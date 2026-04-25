import { Hono } from 'hono'
import { nanoid } from 'nanoid'
import {
  createDeployment,
  deleteDeployment,
  getDeployment,
  listDeployments,
  updateDeployment,
} from '../db/schema.js'
import { runPipeline } from '../services/pipeline.js'

export const deploymentRoutes = new Hono()

// POST /api/deployments — create and kick off pipeline
deploymentRoutes.post('/', async (c) => {
  const body = await c.req.json<{ gitUrl?: string }>()

  if (!body.gitUrl) {
    return c.json({ error: 'gitUrl is required' }, 400)
  }

  let url: URL
  try {
    url = new URL(body.gitUrl)
  } catch {
    return c.json({ error: 'invalid gitUrl' }, 400)
  }

  const name = url.pathname.split('/').filter(Boolean).pop() ?? 'deployment'
  const id = nanoid(10)

  const deployment = createDeployment(id, name, body.gitUrl)

  // Fire-and-forget — client polls or streams logs for progress
  runPipeline(id, body.gitUrl).catch((err) => {
    updateDeployment(id, { status: 'failed', error: String(err) })
  })

  return c.json(deployment, 202)
})

// GET /api/deployments
deploymentRoutes.get('/', (c) => {
  return c.json(listDeployments())
})

// GET /api/deployments/:id
deploymentRoutes.get('/:id', (c) => {
  const dep = getDeployment(c.req.param('id'))
  if (!dep) return c.json({ error: 'not found' }, 404)
  return c.json(dep)
})

// DELETE /api/deployments/:id — stop container and remove record
deploymentRoutes.delete('/:id', async (c) => {
  const { stopAndRemove } = await import('../services/runner.js')
  const { removeRoute } = await import('../services/caddy.js')

  const dep = getDeployment(c.req.param('id'))
  if (!dep) return c.json({ error: 'not found' }, 404)

  if (dep.container_name) {
    await stopAndRemove(dep.container_name).catch(() => {})
    await removeRoute(dep.id).catch(() => {})
  }

  deleteDeployment(dep.id)
  return c.body(null, 204)
})
