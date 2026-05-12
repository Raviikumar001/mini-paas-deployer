import { Hono } from 'hono'
import { customAlphabet } from 'nanoid'
import { createHmac, timingSafeEqual } from 'crypto'
import {
  createDeployment,
  findDeploymentBySourceAndBranch,
  getDeployment,
  updateDeployment,
} from '../db/schema.js'
import { runPipeline, runRedeployPipeline } from '../services/pipeline.js'
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
    head?: { ref?: string }
  }
  repository?: { clone_url?: string; name?: string }
}

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

  // Determine event type and extract fields
  const isPush = 'ref' in payload && payload.ref !== undefined
  const isPR = 'pull_request' in payload && payload.pull_request !== undefined

  const gitUrl = payload.repository?.clone_url
  if (!gitUrl) return c.json({ error: 'missing repository.clone_url' }, 400)
  const validatedGitUrl = validatePublicGitUrl(gitUrl)
  if (!validatedGitUrl.ok) return c.json({ error: validatedGitUrl.error }, 400)

  let branch: string | undefined
  let commitMsg = ''

  if (isPush) {
    const push = payload as GitHubPushPayload
    branch = parseBranch(push.ref)
    commitMsg = push.head_commit?.message ?? ''
  } else if (isPR) {
    const pr = payload as GitHubPRPayload
    branch = pr.pull_request?.head?.ref
    commitMsg = `PR ${pr.action ?? 'updated'}`
  }

  if (!branch) return c.json({ error: 'could not determine branch' }, 400)

  // Look for an existing deployment for this repo + branch
  const existing = findDeploymentBySourceAndBranch(gitUrl, branch)

  if (existing) {
    // Redeploy existing
    if (['building', 'deploying', 'redeploying'].includes(existing.status)) {
      return c.json({ error: 'deployment already in progress' }, 409)
    }

    const envVars = JSON.parse(existing.env_vars || '{}') as Record<string, string>
    const addons = existing.addons ? JSON.parse(existing.addons) as Array<{ type: 'postgres' | 'redis' }> : []

    updateDeployment(existing.id, {
      status: 'redeploying',
      error: null,
    })

    runRedeployPipeline(
      existing.id,
      existing.source_url!,
      existing.name,
      existing.container_name ?? '',
      envVars,
      existing.branch ?? undefined,
      addons,
    ).catch((err) => {
      updateDeployment(existing.id, { status: 'failed', error: String(err) })
    })

    return c.json({ action: 'redeploy', deploymentId: existing.id, branch, commitMsg })
  }

  // Create new deployment for this branch
  const name = payload.repository?.name ?? 'deployment'
  const id = nanoid(10)
  const deployment = createDeployment(id, name, gitUrl, {}, branch)

  runPipeline(id, gitUrl, name, {}, branch).catch((err) => {
    updateDeployment(id, { status: 'failed', error: String(err) })
  })

  return c.json({ action: 'create', deploymentId: id, branch, commitMsg }, 202)
})
