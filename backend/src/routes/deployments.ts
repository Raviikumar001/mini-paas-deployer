import { Hono } from 'hono'
import { customAlphabet } from 'nanoid'
import {
  createDeployment,
  deleteDeployment,
  getDeployment,
  listDeployments,
  updateDeployment,
} from '../db/schema.js'
import { runPipeline, runRedeployPipeline } from '../services/pipeline.js'
import { stopAndRemove } from '../services/runner.js'
import { removeRoute } from '../services/caddy.js'

const nanoid = customAlphabet('abcdefghijklmnopqrstuvwxyz0123456789', 10)

export const deploymentRoutes = new Hono()


deploymentRoutes.post('/', async (c) => {
  const body = await c.req.json<{ gitUrl?: string; envVars?: Record<string, string> }>()

  if (!body.gitUrl) return c.json({ error: 'gitUrl is required' }, 400)

  let url: URL
  try { url = new URL(body.gitUrl) } catch {
    return c.json({ error: 'invalid gitUrl' }, 400)
  }

  const envVars = body.envVars ?? {}
  const name = url.pathname.split('/').filter(Boolean).pop() ?? 'deployment'
  const id = nanoid(10)
  const deployment = createDeployment(id, name, body.gitUrl, envVars)

  runPipeline(id, body.gitUrl, name, envVars).catch((err) => {
    updateDeployment(id, { status: 'failed', error: String(err) })
  })

  return c.json(deployment, 202)
})


deploymentRoutes.get('/', (c) => c.json(listDeployments()))


deploymentRoutes.get('/:id', (c) => {
  const dep = getDeployment(c.req.param('id'))
  if (!dep) return c.json({ error: 'not found' }, 404)
  return c.json(dep)
})


deploymentRoutes.delete('/:id', async (c) => {
  const dep = getDeployment(c.req.param('id'))
  if (!dep) return c.json({ error: 'not found' }, 404)

  if (dep.container_name) {
    await Promise.allSettled([
      stopAndRemove(dep.container_name),
      removeRoute(dep.id),
    ])
  }

  deleteDeployment(dep.id)
  return c.body(null, 204)
})


deploymentRoutes.post('/:id/redeploy', async (c) => {
  const dep = getDeployment(c.req.param('id'))
  if (!dep) return c.json({ error: 'not found' }, 404)

  if (dep.status === 'building' || dep.status === 'deploying' || dep.status === 'redeploying') {
    return c.json({ error: 'deployment already in progress' }, 409)
  }
  if (!dep.source_url) {
    return c.json({ error: 'no source URL to redeploy from' }, 422)
  }


  const body = await c.req.json<{ envVars?: Record<string, string> }>().catch(() => ({ envVars: undefined }))
  const envVars = body.envVars ?? (JSON.parse(dep.env_vars || '{}') as Record<string, string>)


  updateDeployment(dep.id, {
    status: 'redeploying',
    env_vars: JSON.stringify(envVars),
    error: null,
  })

  const oldContainerName = dep.container_name ?? ''
  runRedeployPipeline(dep.id, dep.source_url, dep.name, oldContainerName, envVars).catch((err) => {
    updateDeployment(dep.id, { status: 'failed', error: String(err) })
  })

  return c.json(getDeployment(dep.id))
})
