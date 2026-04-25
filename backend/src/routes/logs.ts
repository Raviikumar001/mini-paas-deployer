import { Hono } from 'hono'
import { streamSSE } from 'hono/streaming'
import { getLogs, getDeployment } from '../db/schema.js'
import { logEmitter, type PipelineEvent } from '../lib/emitter.js'

export const logsRoute = new Hono()

// GET /api/deployments/:id/logs  — SSE stream
// On connect: flush persisted log history, then stream live events.
// Stays open until the pipeline emits 'done' or the client disconnects.
logsRoute.get('/:id/logs', (c) => {
  const id = c.req.param('id')

  const dep = getDeployment(id)
  if (!dep) return c.json({ error: 'not found' }, 404)

  return streamSSE(c, async (stream) => {
    // 1. Flush history so the client can scroll back immediately
    const history = getLogs(id)
    for (const line of history) {
      await stream.writeSSE({
        data: JSON.stringify({
          type: 'log',
          stream: line.stream,
          message: line.message,
          ts: line.created_at,
        }),
      })
    }

    // 2. Subscribe to live events from the pipeline
    let done = false

    const onEvent = async (event: PipelineEvent) => {
      if (done) return
      await stream.writeSSE({ data: JSON.stringify(event) })
      if (event.type === 'done') done = true
    }

    logEmitter.on(id, onEvent)

    // 3. Hold the connection open until abort or pipeline done
    await new Promise<void>((resolve) => {
      stream.onAbort(resolve)
      // also resolve when pipeline signals completion
      const check = setInterval(() => {
        if (done) { clearInterval(check); resolve() }
      }, 500)
    })

    logEmitter.off(id, onEvent)
  })
})
