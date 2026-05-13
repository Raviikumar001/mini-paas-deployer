import { Hono } from 'hono'
import { customAlphabet } from 'nanoid'
import { createHmac, timingSafeEqual } from 'crypto'
import {
  createDeployment,
  findDeploymentBySourceAndBranch,
  findPreviewDeploymentByRepoAndPr,
  getDeployment,
  updateDeployment,
} from '../db/schema.js'
import { runPipeline, runRedeployPipeline } from '../services/pipeline.js'
import { recordDeploymentEvent } from '../services/deployment-events.js'
import { destroyDeployment } from '../services/deployment-lifecycle.js'
import {
  ensureRawBodySize,
  ensureRequestSize,
  parseJsonBody,
  validatePublicGitUrl,
} from '../lib/http-input.js'

const nanoid = customAlphabet('abcdefghijklmnopqrstuvwxyz0123456789', 10)
const WEBHOOK_BODY_LIMIT = 1024 * 1024

export const webhookRoutes = new Hono()

interface GitHubPushPayload {
  ref?: string
  repository?: { clone_url?: string; name?: string }
  head_commit?: { id?: string; message?: string }
}

interface GitHubPRPayload {
  action?: string
  pull_request?: {
    number?: number
    html_url?: string
    title?: string
    merged?: boolean
    head?: { ref?: string; sha?: string }
    base?: { ref?: string }
  }
  repository?: { clone_url?: string; name?: string }
}

type ParsedAddons = Array<{ type: 'postgres' | 'redis'; persistent?: boolean }>

function parseBranch(ref?: string): string | undefined {
  if (!ref) return undefined
  if (ref.startsWith('refs/heads/')) return ref.replace('refs/heads/', '')
  if (ref.startsWith('refs/pull/')) return undefined
  return ref
}

function verifyGitHubSignature(rawBody: string, signature: string | null, secret: string): boolean {
  if (!signature?.startsWith('sha256=')) return false

  const expected = createHmac('sha256', secret)
    .update(rawBody)
    .digest('hex')
  const provided = signature.slice('sha256='.length)

  const expectedBytes = Buffer.from(expected, 'hex')
  const providedBytes = Buffer.from(provided, 'hex')
  if (expectedBytes.length !== providedBytes.length) return false

  return timingSafeEqual(expectedBytes, providedBytes)
}

function previewDeploymentName(repoName: string, prNumber: number): string {
  const slug = repoName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 28)
  return `pr-${prNumber}-${slug || 'preview'}`
}

function parseRecord(raw: string | null | undefined): Record<string, string> {
  if (!raw) return {}
  try {
    return JSON.parse(raw) as Record<string, string>
  } catch {
    return {}
  }
}

function parseAddons(raw: string | null | undefined): ParsedAddons {
  if (!raw) return []
  try {
    return JSON.parse(raw) as ParsedAddons
  } catch {
    return []
  }
}

webhookRoutes.post('/github', async (c) => {
  const lengthError = ensureRequestSize(c.req.header('content-length'), WEBHOOK_BODY_LIMIT)
  if (lengthError) return c.json({ error: lengthError }, 413)

  const rawBody = await c.req.text()
  const bodySizeError = ensureRawBodySize(rawBody, WEBHOOK_BODY_LIMIT)
  if (bodySizeError) return c.json({ error: bodySizeError }, 413)

  const secret = process.env.GITHUB_WEBHOOK_SECRET

  if (secret) {
    const signature = c.req.header('x-hub-signature-256') ?? null
    if (!verifyGitHubSignature(rawBody, signature, secret)) {
      return c.json({ error: 'invalid webhook signature' }, 401)
    }
  }

  const payload = parseJsonBody<GitHubPushPayload | GitHubPRPayload>(rawBody)
  if ('error' in payload) return c.json({ error: payload.error }, 400)
  const eventName = c.req.header('x-github-event') ?? ''

  const gitUrl = payload.repository?.clone_url
  if (!gitUrl) return c.json({ error: 'missing repository.clone_url' }, 400)
  const validatedGitUrl = validatePublicGitUrl(gitUrl)
  if (!validatedGitUrl.ok) return c.json({ error: validatedGitUrl.error }, 400)

  if (eventName === 'pull_request') {
    const prPayload = payload as GitHubPRPayload
    const action = prPayload.action ?? ''
    const pr = prPayload.pull_request
    const prNumber = pr?.number
    const branch = pr?.head?.ref

    if (!prNumber || !branch) return c.json({ error: 'could not determine pull request branch' }, 400)

    const existingPreview = findPreviewDeploymentByRepoAndPr(gitUrl, prNumber)
    const sourceSha = pr.head?.sha ?? null
    const sourceMessage = pr.title ?? null
    const prUrl = pr.html_url ?? null

    if (action === 'closed') {
      if (!existingPreview) {
        return c.json({ action: 'noop', reason: 'preview not found', prNumber }, 202)
      }

      recordDeploymentEvent(existingPreview.id, 'deployment_deleted', 'Preview deployment auto-removed', {
        prNumber,
        merged: pr.merged === true,
      })
      await destroyDeployment(existingPreview, true)
      return c.json({ action: 'delete-preview', deploymentId: existingPreview.id, prNumber }, 202)
    }

    if (!['opened', 'reopened', 'synchronize'].includes(action)) {
      return c.json({ action: 'noop', reason: `ignored pull_request action ${action}`, prNumber }, 202)
    }

    if (existingPreview) {
      if (['building', 'deploying', 'redeploying'].includes(existingPreview.status)) {
        return c.json({ error: 'deployment already in progress' }, 409)
      }

      const envVars = parseRecord(existingPreview.env_vars)
      const secretEnvVars = parseRecord(existingPreview.secret_env_vars)
      const addons = parseAddons(existingPreview.addons)

      updateDeployment(existingPreview.id, {
        status: 'redeploying',
        error: null,
        branch,
        source_sha: sourceSha,
        source_message: sourceMessage,
        pr_url: prUrl,
      })

      runRedeployPipeline(
        existingPreview.id,
        existingPreview.source_url!,
        existingPreview.name,
        existingPreview.container_name ?? '',
        { ...envVars, ...secretEnvVars },
        branch,
        addons,
      ).catch((err) => {
        updateDeployment(existingPreview.id, { status: 'failed', error: String(err) })
      })

      return c.json({
        action: 'redeploy-preview',
        deploymentId: existingPreview.id,
        branch,
        prNumber,
        sourceSha,
        sourceMessage,
      }, 202)
    }

    const name = previewDeploymentName(payload.repository?.name ?? 'deployment', prNumber)
    const id = nanoid(10)
    createDeployment(id, name, gitUrl, {}, {}, branch, [], {
      sourceSha,
      sourceMessage,
      prNumber,
      prUrl,
      isPreview: true,
    })
    recordDeploymentEvent(id, 'deployment_created', 'Preview deployment queued', {
      repository: payload.repository?.name ?? name,
      branch,
      prNumber,
      preview: true,
    })

    runPipeline(id, gitUrl, name, {}, branch).catch((err) => {
      updateDeployment(id, { status: 'failed', error: String(err) })
    })

    return c.json({
      action: 'create-preview',
      deploymentId: id,
      branch,
      prNumber,
      sourceSha,
      sourceMessage,
    }, 202)
  }

  if (eventName && eventName !== 'push') {
    return c.json({ action: 'noop', reason: `ignored event ${eventName}` }, 202)
  }

  const push = payload as GitHubPushPayload
  const branch = parseBranch(push.ref)
  if (!branch) return c.json({ error: 'could not determine branch' }, 400)

  const existing = findDeploymentBySourceAndBranch(gitUrl, branch)
  const sourceSha = push.head_commit?.id ?? null
  const sourceMessage = push.head_commit?.message ?? null

  if (existing) {
    if (['building', 'deploying', 'redeploying'].includes(existing.status)) {
      return c.json({ error: 'deployment already in progress' }, 409)
    }

    const envVars = parseRecord(existing.env_vars)
    const secretEnvVars = parseRecord(existing.secret_env_vars)
    const addons = parseAddons(existing.addons)

    updateDeployment(existing.id, {
      status: 'redeploying',
      error: null,
      source_sha: sourceSha,
      source_message: sourceMessage,
    })

    runRedeployPipeline(
      existing.id,
      existing.source_url!,
      existing.name,
      existing.container_name ?? '',
      { ...envVars, ...secretEnvVars },
      existing.branch ?? undefined,
      addons,
    ).catch((err) => {
      updateDeployment(existing.id, { status: 'failed', error: String(err) })
    })

    return c.json({ action: 'redeploy', deploymentId: existing.id, branch, sourceSha, sourceMessage }, 202)
  }

  const name = payload.repository?.name ?? 'deployment'
  const id = nanoid(10)
  createDeployment(id, name, gitUrl, {}, {}, branch, [], {
    sourceSha,
    sourceMessage,
  })
  recordDeploymentEvent(id, 'deployment_created', 'Deployment queued from push webhook', {
    repository: name,
    branch,
    preview: false,
  })

  runPipeline(id, gitUrl, name, {}, branch).catch((err) => {
    updateDeployment(id, { status: 'failed', error: String(err) })
  })

  return c.json({ action: 'create', deploymentId: id, branch, sourceSha, sourceMessage }, 202)
})
