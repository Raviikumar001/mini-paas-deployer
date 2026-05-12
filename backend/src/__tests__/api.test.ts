import { describe, it, expect, vi, beforeAll } from 'vitest'
import { Hono } from 'hono'

// Mock side-effectful services before any route module is imported.
// Tests verify HTTP contract only — no docker/git/caddy actually runs.
vi.mock('../services/pipeline.js', () => ({ runPipeline: vi.fn().mockResolvedValue(undefined) }))
vi.mock('../services/runner.js',   () => ({ stopAndRemove: vi.fn().mockResolvedValue(undefined) }))
vi.mock('../services/caddy.js',    () => ({
  removeRoute: vi.fn().mockResolvedValue(undefined),
  addRoute: vi.fn().mockResolvedValue(undefined),
}))

// DATABASE_PATH=':memory:' is set in vitest.config.ts before this module loads
import { initDb } from '../db/schema.js'
import { deploymentRoutes } from '../routes/deployments.js'

const app = new Hono().route('/', deploymentRoutes)

beforeAll(() => { initDb() })

// ── POST / ────────────────────────────────────────────────────────────────────

describe('POST /api/deployments', () => {
  it('rejects a missing gitUrl with 400', async () => {
    const res = await app.request('/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    })
    expect(res.status).toBe(400)
  })

  it('rejects a non-URL string with 400', async () => {
    const res = await app.request('/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ gitUrl: 'not-a-url' }),
    })
    expect(res.status).toBe(400)
  })

  it('rejects non-HTTPS Git URLs with 400', async () => {
    const res = await app.request('/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ gitUrl: 'http://github.com/user/repo' }),
    })
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'gitUrl must use https' })
  })

  it('rejects unsupported Git hosts with 400', async () => {
    const res = await app.request('/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ gitUrl: 'https://example.com/user/repo' }),
    })
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'gitUrl host is not supported' })
  })

  it('rejects oversized deployment payloads with 413', async () => {
    const res = await app.request('/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        gitUrl: 'https://github.com/user/repo',
        envVars: { BIG_VALUE: 'x'.repeat(70 * 1024) },
      }),
    })
    expect(res.status).toBe(413)
  })

  it('accepts a valid https URL and returns 202 with id + pending status', async () => {
    const res = await app.request('/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ gitUrl: 'https://github.com/user/repo' }),
    })
    expect(res.status).toBe(202)
    const body = await res.json() as { id: string; status: string }
    expect(typeof body.id).toBe('string')
    expect(body.id.length).toBeGreaterThan(0)
    expect(body.status).toBe('pending')
  })
})

// ── GET / ─────────────────────────────────────────────────────────────────────

describe('GET /api/deployments', () => {
  it('returns a JSON array', async () => {
    const res = await app.request('/')
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(Array.isArray(body)).toBe(true)
  })

  it('includes a previously created deployment', async () => {
    const createRes = await app.request('/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ gitUrl: 'https://github.com/user/list-test' }),
    })
    const { id } = await createRes.json() as { id: string }

    const listRes = await app.request('/')
    const list = await listRes.json() as { id: string }[]
    expect(list.some((d) => d.id === id)).toBe(true)
  })
})

// ── GET /:id ──────────────────────────────────────────────────────────────────

describe('GET /api/deployments/:id', () => {
  it('returns 404 for an unknown id', async () => {
    const res = await app.request('/does-not-exist')
    expect(res.status).toBe(404)
  })

  it('returns the deployment for a known id', async () => {
    const createRes = await app.request('/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ gitUrl: 'https://github.com/user/get-test' }),
    })
    const { id } = await createRes.json() as { id: string }

    const res = await app.request(`/${id}`)
    expect(res.status).toBe(200)
    const body = await res.json() as { id: string; status: string }
    expect(body.id).toBe(id)
    expect(body.status).toBe('pending')
  })
})

// ── DELETE /:id ───────────────────────────────────────────────────────────────

describe('DELETE /api/deployments/:id', () => {
  it('returns 404 for an unknown id', async () => {
    const res = await app.request('/does-not-exist', { method: 'DELETE' })
    expect(res.status).toBe(404)
  })

  it('returns 204 and removes the deployment', async () => {
    const createRes = await app.request('/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ gitUrl: 'https://github.com/user/delete-test' }),
    })
    const { id } = await createRes.json() as { id: string }

    const delRes = await app.request(`/${id}`, { method: 'DELETE' })
    expect(delRes.status).toBe(204)

    // Confirm it's gone
    const getRes = await app.request(`/${id}`)
    expect(getRes.status).toBe(404)
  })
})
