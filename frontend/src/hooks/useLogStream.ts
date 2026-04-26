import { useEffect, useReducer } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { DEPLOYMENTS_KEY } from './useDeployments'
import type { LogEvent, PipelineEvent } from '../api/client'

const MAX_LINES = 2_000

type Action = { type: 'reset' } | LogEvent

function reducer(state: LogEvent[], action: Action): LogEvent[] {
  if (action.type === 'reset') return []
  const next = [...state, action]
  // Cap to avoid unbounded memory growth for very chatty builds
  return next.length > MAX_LINES ? next.slice(-MAX_LINES) : next
}

/**
 * Opens an SSE connection for a deployment's log stream.
 * - Flushes persisted history on first connect (server sends it before live lines).
 * - On status/done events, invalidates the deployments query so status badges update
 *   immediately rather than waiting for the next 3-second poll.
 * - Closes the EventSource on component unmount or deploymentId change.
 */
export function useLogStream(deploymentId: string): LogEvent[] {
  const qc = useQueryClient()
  const [logs, dispatch] = useReducer(reducer, [])

  useEffect(() => {
    dispatch({ type: 'reset' })

    const es = new EventSource(`/api/deployments/${deploymentId}/logs`)

    es.onmessage = (e: MessageEvent<string>) => {
      const event = JSON.parse(e.data) as PipelineEvent

      if (event.type === 'log') {
        dispatch(event)
      } else if (event.type === 'status' || event.type === 'done') {
        qc.invalidateQueries({ queryKey: DEPLOYMENTS_KEY })
        if (event.type === 'done') es.close()
      }
    }

    es.onerror = () => es.close()

    return () => es.close()
  }, [deploymentId, qc])

  return logs
}
