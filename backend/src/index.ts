import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { logger } from 'hono/logger'
import { initDb } from './db/schema.js'
import { deploymentRoutes } from './routes/deployments.js'
import { logsRoute } from './routes/logs.js'
import { repositoryRoutes } from './routes/repositories.js'
import { webhookRoutes } from './routes/webhook.js'
import { startHealthMonitor } from './services/health-monitor.js'
import { reconcile } from './services/reconcile.js'
import { registerStaticRoutes } from './services/caddy.js'

const app = new Hono()
const STATIC_ROUTE_ATTEMPTS = 20
const STATIC_ROUTE_RETRY_MS = 500

app.use('*', logger())
app.use('/api/*', cors())

const api = new Hono()
api.route('/deployments', deploymentRoutes)
api.route('/deployments', logsRoute)
api.route('/repositories', repositoryRoutes)
api.route('/webhook', webhookRoutes)
api.get('/health', (c) => c.json({ ok: true, ts: new Date().toISOString() }))

app.route('/api', api)

async function registerStaticRoutesWithRetry(): Promise<void> {
  for (let attempt = 1; attempt <= STATIC_ROUTE_ATTEMPTS; attempt++) {
    try {
      await registerStaticRoutes()
      return
    } catch (err) {
      if (attempt === STATIC_ROUTE_ATTEMPTS) throw err
      console.warn(`caddy static routes unavailable, retrying (${attempt}/${STATIC_ROUTE_ATTEMPTS})`)
      await new Promise((resolve) => setTimeout(resolve, STATIC_ROUTE_RETRY_MS))
    }
  }
}

initDb()
registerStaticRoutesWithRetry().catch((err) => console.error('caddy static routes error:', err))
reconcile().catch((err) => console.error('reconcile error:', err))
startHealthMonitor()

const port = Number(process.env.PORT ?? 3001)
serve({ fetch: app.fetch, port }, () => {
  console.log(`backend listening on :${port}`)
})
