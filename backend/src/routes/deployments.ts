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
import { stopAndRemove } from '../services/runner.js'
import { removeRoute } from '../services/caddy.js'

export const deploymentRoutes = new Hono()

// POST /api/deployments
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

  // Fire-and-forget — client follows progress via SSE
  runPipeline(id, body.gitUrl, name).catch((err) => {
    updateDeployment(id, { status: 'failed', error: String(err) })
  })

  return c.json(deployment, 202)
})

// GET /api/deployments
deploymentRoutes.get('/', (c) => c.json(listDeployments()))

// GET /api/deployments/:id
deploymentRoutes.get('/:id', (c) => {
  const dep = getDeployment(c.req.param('id'))
  if (!dep) return c.json({ error: 'not found' }, 404)
  return c.json(dep)
})

// DELETE /api/deployments/:id
deploymentRoutes.delete('/:id', async (c) => {
  const dep = getDeployment(c.req.param('id'))
  if (!dep) return c.json({ error: 'not found' }, 404)

  if (dep.container_name) {
    // Run both in parallel — container removal and Caddy route removal are independent
    await Promise.allSettled([
      stopAndRemove(dep.container_name),
      removeRoute(dep.id),
    ])
  }

  deleteDeployment(dep.id)
  return c.body(null, 204)
})
