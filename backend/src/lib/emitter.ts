import { EventEmitter } from 'events'
import { insertLog } from '../db/schema.js'

// Single process-level emitter keyed by deployment ID.
// Pipeline services emit here; SSE handlers subscribe here.
export const logEmitter = new EventEmitter()
logEmitter.setMaxListeners(200)

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


export function emitLog(
  deploymentId: string,
  stream: LogEvent['stream'],
  message: string,
): void {
  const ts = new Date().toISOString()
  insertLog(deploymentId, stream, message)
  logEmitter.emit(deploymentId, { type: 'log', stream, message, ts } satisfies LogEvent)
}

export function emitStatus(deploymentId: string, status: string): void {
  logEmitter.emit(deploymentId, { type: 'status', status } satisfies StatusEvent)
}

export function emitDone(deploymentId: string): void {
  logEmitter.emit(deploymentId, { type: 'done' } satisfies DoneEvent)
}
