import { EventEmitter } from 'events'

// Single process-level emitter keyed by deployment ID.
// SSE handlers subscribe here; pipeline services emit here.
export const logEmitter = new EventEmitter()
logEmitter.setMaxListeners(200)  // one listener per open SSE connection

export interface LogEvent {
  type: 'log'
  stream: 'stdout' | 'stderr' | 'system'
  message: string
  ts: string
}

export interface StatusEvent {
  type: 'status'
  status: string
}

export interface DoneEvent {
  type: 'done'
}

export type PipelineEvent = LogEvent | StatusEvent | DoneEvent

/** Emit a log line and persist it to the DB in one call. */
export function emitLog(
  deploymentId: string,
  stream: LogEvent['stream'],
  message: string,
): void {
  // Lazy import to avoid circular dep with schema.ts
  import('../db/schema.js').then(({ insertLog }) => {
    insertLog(deploymentId, stream, message)
  })
  const event: LogEvent = { type: 'log', stream, message, ts: new Date().toISOString() }
  logEmitter.emit(deploymentId, event)
}

/** Emit a status change (no persistence — status lives in the deployments row). */
export function emitStatus(deploymentId: string, status: string): void {
  const event: StatusEvent = { type: 'status', status }
  logEmitter.emit(deploymentId, event)
}

/** Signal pipeline completion to all SSE subscribers. */
export function emitDone(deploymentId: string): void {
  const event: DoneEvent = { type: 'done' }
  logEmitter.emit(deploymentId, event)
}
