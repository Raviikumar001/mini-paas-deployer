import { createHmac } from 'crypto'
import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest'
import { Hono } from 'hono'

vi.mock('../services/pipeline.js', () => ({
  runPipeline: vi.fn().mockResolvedValue(undefined),
  runRedeployPipeline: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('../services/deployment-lifecycle.js', () => ({
  destroyDeployment: vi.fn().mockResolvedValue(undefined),
}))

import { findPreviewDeploymentByRepoAndPr, getDeployment, initDb } from '../db/schema.js'
import { webhookRoutes } from '../routes/webhook.js'
import { runPipeline, runRedeployPipeline } from '../services/pipeline.js'
import { destroyDeployment } from '../services/deployment-lifecycle.js'

const app = new Hono().route('/', webhookRoutes)
const ORIGINAL_SECRET = process.env.GITHUB_WEBHOOK_SECRET

beforeAll(() => { initDb() })

beforeEach(() => {
  vi.clearAllMocks()
  delete process.env.GITHUB_WEBHOOK_SECRET
})

afterEach(() => {
  if (ORIGINAL_SECRET === undefined) {
    delete process.env.GITHUB_WEBHOOK_SECRET
  } else {
    process.env.GITHUB_WEBHOOK_SECRET = ORIGINAL_SECRET
  }
})

function pushPayload(repo = 'signed-test') {
  return {
    ref: 'refs/heads/main',
    repository: {
      clone_url: `https://github.com/user/${repo}`,
      name: repo,
    },
    head_commit: {
      id: 'abc123',
      message: 'Ship it',
    },
  }
}

function sign(rawBody: string, secret: string): string {
  return `sha256=${createHmac('sha256', secret).update(rawBody).digest('hex')}`
}

function pullRequestPayload(repo = 'preview-test', action = 'opened') {
  return {
    action,
    pull_request: {
      number: 42,
      html_url: `https://github.com/user/${repo}/pull/42`,
      title: 'Ship preview polish',
      merged: false,
      head: {
        ref: 'feature/preview-flow',
        sha: 'def456',
      },
      base: {
        ref: 'main',
      },
    },
    repository: {
      clone_url: `https://github.com/user/${repo}`,
      name: repo,
    },
  }
}

describe('POST /api/webhook/github', () => {
  it('accepts unsigned local webhooks when no secret is configured', async () => {
    const res = await app.request('/github', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(pushPayload('unsigned-local')),
    })

    expect(res.status).toBe(202)
    expect(runPipeline).toHaveBeenCalledOnce()
  })

  it('rejects missing signatures when a GitHub webhook secret is configured', async () => {
    process.env.GITHUB_WEBHOOK_SECRET = 'top-secret'

    const res = await app.request('/github', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(pushPayload('missing-signature')),
    })

    expect(res.status).toBe(401)
    expect(await res.json()).toEqual({ error: 'invalid webhook signature' })
    expect(runPipeline).not.toHaveBeenCalled()
  })

  it('rejects invalid signatures when a GitHub webhook secret is configured', async () => {
    process.env.GITHUB_WEBHOOK_SECRET = 'top-secret'

    const res = await app.request('/github', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Hub-Signature-256': 'sha256=not-a-real-signature',
      },
      body: JSON.stringify(pushPayload('bad-signature')),
    })

    expect(res.status).toBe(401)
    expect(runPipeline).not.toHaveBeenCalled()
  })

  it('accepts valid GitHub signatures when a webhook secret is configured', async () => {
    const secret = 'top-secret'
    process.env.GITHUB_WEBHOOK_SECRET = secret
    const rawBody = JSON.stringify(pushPayload('valid-signature'))

    const res = await app.request('/github', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Hub-Signature-256': sign(rawBody, secret),
      },
      body: rawBody,
    })

    expect(res.status).toBe(202)
    expect(runPipeline).toHaveBeenCalledOnce()
  })

  it('rejects invalid JSON payloads', async () => {
    const res = await app.request('/github', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{not-json',
    })

    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'invalid JSON payload' })
    expect(runPipeline).not.toHaveBeenCalled()
  })

  it('rejects unsupported repository clone URLs', async () => {
    const payload = pushPayload('unsupported-host')
    payload.repository.clone_url = 'https://example.com/user/repo'

    const res = await app.request('/github', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })

    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'gitUrl host is not supported' })
    expect(runPipeline).not.toHaveBeenCalled()
  })

  it('rejects oversized webhook payloads', async () => {
    const payload = {
      ...pushPayload('oversized-webhook'),
      padding: 'x'.repeat(1024 * 1024),
    }

    const res = await app.request('/github', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })

    expect(res.status).toBe(413)
    expect(runPipeline).not.toHaveBeenCalled()
  })

  it('creates a preview deployment for pull request opened events', async () => {
    const res = await app.request('/github', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-GitHub-Event': 'pull_request',
      },
      body: JSON.stringify(pullRequestPayload('preview-create')),
    })

    expect(res.status).toBe(202)
    expect(runPipeline).toHaveBeenCalledOnce()

    const body = await res.json() as { deploymentId: string; action: string }
    expect(body.action).toBe('create-preview')

    const stored = getDeployment(body.deploymentId)
    expect(stored?.is_preview).toBe(1)
    expect(stored?.pr_number).toBe(42)
    expect(stored?.source_sha).toBe('def456')
    expect(stored?.source_message).toBe('Ship preview polish')
    expect(stored?.name).toBe('pr-42-preview-create')
  })

  it('redeploys an existing preview deployment on pull request synchronize', async () => {
    await app.request('/github', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-GitHub-Event': 'pull_request',
      },
      body: JSON.stringify(pullRequestPayload('preview-sync', 'opened')),
    })

    vi.clearAllMocks()

    const res = await app.request('/github', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-GitHub-Event': 'pull_request',
      },
      body: JSON.stringify(pullRequestPayload('preview-sync', 'synchronize')),
    })

    expect(res.status).toBe(202)
    expect(runRedeployPipeline).toHaveBeenCalledOnce()
    expect(runPipeline).not.toHaveBeenCalled()

    const preview = findPreviewDeploymentByRepoAndPr('https://github.com/user/preview-sync', 42)
    expect(preview?.source_sha).toBe('def456')
  })

  it('deletes preview deployments when pull requests close', async () => {
    await app.request('/github', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-GitHub-Event': 'pull_request',
      },
      body: JSON.stringify(pullRequestPayload('preview-close', 'opened')),
    })

    vi.clearAllMocks()

    const res = await app.request('/github', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-GitHub-Event': 'pull_request',
      },
      body: JSON.stringify(pullRequestPayload('preview-close', 'closed')),
    })

    expect(res.status).toBe(202)
    expect(destroyDeployment).toHaveBeenCalledOnce()
    expect(runPipeline).not.toHaveBeenCalled()
    expect(runRedeployPipeline).not.toHaveBeenCalled()
  })
})
