import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Hono } from 'hono'

vi.mock('../services/repositories.js', () => ({
  RepositoryLookupError: class RepositoryLookupError extends Error {
    constructor(message: string) {
      super(message)
      this.name = 'RepositoryLookupError'
    }
  },
  listRemoteBranches: vi.fn().mockResolvedValue(['main', 'feat/platform-ui']),
}))

import { repositoryRoutes } from '../routes/repositories.js'
import { listRemoteBranches } from '../services/repositories.js'

const app = new Hono().route('/', repositoryRoutes)

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(listRemoteBranches).mockResolvedValue(['main', 'feat/platform-ui'])
})

describe('GET /api/repositories/branches', () => {
  it('requires a gitUrl query parameter', async () => {
    const res = await app.request('/branches')

    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'gitUrl is required' })
    expect(listRemoteBranches).not.toHaveBeenCalled()
  })

  it('rejects unsupported repository URLs before running git', async () => {
    const res = await app.request('/branches?gitUrl=https%3A%2F%2Fexample.com%2Fuser%2Frepo')

    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'gitUrl host is not supported' })
    expect(listRemoteBranches).not.toHaveBeenCalled()
  })

  it('returns available branches for a supported repository URL', async () => {
    const res = await app.request('/branches?gitUrl=https%3A%2F%2Fgithub.com%2Fuser%2Frepo')

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ branches: ['main', 'feat/platform-ui'] })
    expect(listRemoteBranches).toHaveBeenCalledWith('https://github.com/user/repo')
  })

  it('keeps lookup failures explicit so the UI can fall back to manual entry', async () => {
    vi.mocked(listRemoteBranches).mockRejectedValueOnce(new Error('private repository'))

    const res = await app.request('/branches?gitUrl=https%3A%2F%2Fgithub.com%2Fuser%2Fprivate')

    expect(res.status).toBe(502)
    expect(await res.json()).toEqual({ error: 'repository branches could not be loaded' })
  })
})
