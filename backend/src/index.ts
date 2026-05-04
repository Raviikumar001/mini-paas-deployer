import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { logger } from 'hono/logger'
import { initDb } from './db/schema.js'
import { deploymentRoutes } from './routes/deployments.js'
import { logsRoute } from './routes/logs.js'
import { webhookRoutes } from './routes/webhook.js'
import { reconcile } from './services/reconcile.js'

const app = new Hono()

app.use('*', logger())
app.use('/api/*', cors())

const api = new Hono()
api.route('/deployments', deploymentRoutes)
api.route('/deployments', logsRoute)
api.route('/webhook', webhookRoutes)
api.get('/health', (c) => c.json({ ok: true, ts: new Date().toISOString() }))

app.route('/api', api)

initDb()
reconcile().catch((err) => console.error('reconcile error:', err))

const port = Number(process.env.PORT ?? 3001)
serve({ fetch: app.fetch, port }, () => {
  console.log(`backend listening on :${port}`)
})
