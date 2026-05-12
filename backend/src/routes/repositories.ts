import { Hono } from 'hono'
import { validatePublicGitUrl } from '../lib/http-input.js'
import { listRemoteBranches, RepositoryLookupError } from '../services/repositories.js'

export const repositoryRoutes = new Hono()

repositoryRoutes.get('/branches', async (c) => {
  const rawGitUrl = c.req.query('gitUrl')?.trim()
  if (!rawGitUrl) return c.json({ error: 'gitUrl is required' }, 400)

  const gitUrl = validatePublicGitUrl(rawGitUrl)
  if (!gitUrl.ok) return c.json({ error: gitUrl.error }, 400)

  try {
    const branches = await listRemoteBranches(rawGitUrl)
    return c.json({ branches })
  } catch (err) {
    const message = err instanceof RepositoryLookupError
      ? err.message
      : 'repository branches could not be loaded'
    return c.json({ error: message }, 502)
  }
})
