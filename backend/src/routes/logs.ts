import { Hono } from 'hono'
import { streamSSE } from 'hono/streaming'
import { getLogs, getDeployment } from '../db/schema.js'
import { logEmitter, type PipelineEvent } from '../lib/emitter.js'

export const logsRoute = new Hono()

const TERMINAL = new Set(['running', 'failed', 'stopped'])


logsRoute.get('/:id/logs', (c) => {
  const id = c.req.param('id')

  const dep = getDeployment(id)
  if (!dep) return c.json({ error: 'not found' }, 404)

  return streamSSE(c, async (stream) => {
    for (const line of getLogs(id)) {
      await stream.writeSSE({
        data: JSON.stringify({
          type: 'log',
          stream: line.stream,
          message: line.message,
          ts: line.created_at,
        }),
      })
    }

    if (TERMINAL.has(dep.status)) {
      await stream.writeSSE({ data: JSON.stringify({ type: 'done' }) })
      return
    }

    await new Promise<void>((resolve) => {
      const onEvent = async (event: PipelineEvent) => {
        await stream.writeSSE({ data: JSON.stringify(event) })
        if (event.type === 'done') {
          logEmitter.off(id, onEvent)
          resolve()
        }
      }

      logEmitter.on(id, onEvent)


      stream.onAbort(() => {
        logEmitter.off(id, onEvent)
        resolve()
      })
    })
  })
})
