import { Hono } from 'hono'
import { customAlphabet } from 'nanoid'
import {
  createDeployment,
  deleteDeployment,
  type Deployment,
  getDeployment,
  listDeployments,
  updateDeployment,
} from '../db/schema.js'
import { runPipeline, runRedeployPipeline } from '../services/pipeline.js'
import { stopAndRemove } from '../services/runner.js'
import { removeRoute } from '../services/caddy.js'
import { stopPostgres, stopRedis } from '../services/addons.js'
import { stopRuntimeLogs } from '../services/runtime-logs.js'
import {
  ensureRawBodySize,
  ensureRequestSize,
  parseJsonBody,
  validatePublicGitUrl,
} from '../lib/http-input.js'

const nanoid = customAlphabet('abcdefghijklmnopqrstuvwxyz0123456789', 10)
const DEPLOYMENT_BODY_LIMIT = 64 * 1024

export const deploymentRoutes = new Hono()

type PublicDeployment = Omit<Deployment, 'secret_env_vars'> & {
  secret_env_keys: string[]
}

function parseRecord(raw: string | null | undefined): Record<string, string> {
  if (!raw) return {}
  try {
    return JSON.parse(raw) as Record<string, string>
  } catch {
    return {}
  }
}

function toPublicDeployment(dep: Deployment): PublicDeployment {
  const { secret_env_vars: secretEnvVars, ...publicDep } = dep
  return {
    ...publicDep,
    secret_env_keys: Object.keys(parseRecord(secretEnvVars)),
  }
}


deploymentRoutes.post('/', async (c) => {
  const lengthError = ensureRequestSize(c.req.header('content-length'), DEPLOYMENT_BODY_LIMIT)
  if (lengthError) return c.json({ error: lengthError }, 413)

  const rawBody = await c.req.text()
  const bodySizeError = ensureRawBodySize(rawBody, DEPLOYMENT_BODY_LIMIT)
  if (bodySizeError) return c.json({ error: bodySizeError }, 413)

  const parsed = parseJsonBody<{
    gitUrl?: string
    envVars?: Record<string, string>
    secretEnvVars?: Record<string, string>
    branch?: string
    addons?: Array<{ type: 'postgres' | 'redis' }>
  }>(rawBody)
  if ('error' in parsed) return c.json({ error: parsed.error }, 400)

  const body = parsed
  if (!body.gitUrl) return c.json({ error: 'gitUrl is required' }, 400)

  const gitUrl = validatePublicGitUrl(body.gitUrl)
  if (!gitUrl.ok) return c.json({ error: gitUrl.error }, 400)

  const envVars = body.envVars ?? {}
  const secretEnvVars = body.secretEnvVars ?? {}
  const mergedEnvVars = { ...envVars, ...secretEnvVars }
  const branch = body.branch?.trim() || 'main'
  const addons = body.addons ?? []
  const name = gitUrl.url.pathname.split('/').filter(Boolean).pop()?.replace(/\.git$/, '') ?? 'deployment'
  const id = nanoid(10)
  const deployment = createDeployment(id, name, body.gitUrl, envVars, secretEnvVars, branch, addons)

  runPipeline(id, body.gitUrl, name, mergedEnvVars, branch, addons).catch((err) => {
    updateDeployment(id, { status: 'failed', error: String(err) })
  })

  return c.json(toPublicDeployment(deployment), 202)
})


deploymentRoutes.get('/', (c) => c.json(listDeployments().map(toPublicDeployment)))


deploymentRoutes.get('/:id', (c) => {
  const dep = getDeployment(c.req.param('id'))
  if (!dep) return c.json({ error: 'not found' }, 404)
  return c.json(toPublicDeployment(dep))
})


deploymentRoutes.delete('/:id', async (c) => {
  const dep = getDeployment(c.req.param('id'))
  if (!dep) return c.json({ error: 'not found' }, 404)

  await Promise.allSettled([
    dep.container_name ? stopAndRemove(dep.container_name) : Promise.resolve(),
    removeRoute(dep.id),
    stopPostgres(dep.id),
    stopRedis(dep.id),
    stopRuntimeLogs(dep.id),
  ])

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


  const lengthError = ensureRequestSize(c.req.header('content-length'), DEPLOYMENT_BODY_LIMIT)
  if (lengthError) return c.json({ error: lengthError }, 413)

  const rawBody = await c.req.text()
  const bodySizeError = ensureRawBodySize(rawBody, DEPLOYMENT_BODY_LIMIT)
  if (bodySizeError) return c.json({ error: bodySizeError }, 413)

  const body = rawBody
    ? parseJsonBody<{ envVars?: Record<string, string>; secretEnvVars?: Record<string, string> }>(rawBody)
    : { envVars: undefined, secretEnvVars: undefined }
  if ('error' in body) return c.json({ error: body.error }, 400)
  const envVars = body.envVars ?? parseRecord(dep.env_vars)
  const secretEnvVars = body.secretEnvVars ?? parseRecord(dep.secret_env_vars)
  const mergedEnvVars = { ...envVars, ...secretEnvVars }


  updateDeployment(dep.id, {
    status: 'redeploying',
    env_vars: JSON.stringify(envVars),
    secret_env_vars: JSON.stringify(secretEnvVars),
    error: null,
  })

  const oldContainerName = dep.container_name ?? ''
  const addons: Array<{ type: 'postgres' | 'redis' }> = dep.addons ? JSON.parse(dep.addons) : []
  runRedeployPipeline(dep.id, dep.source_url, dep.name, oldContainerName, mergedEnvVars, dep.branch ?? undefined, addons).catch((err) => {
    updateDeployment(dep.id, { status: 'failed', error: String(err) })
  })

  return c.json(toPublicDeployment(getDeployment(dep.id)!))
})
