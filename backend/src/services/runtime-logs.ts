import { ChildProcess, spawn } from 'child_process'
import { emitLog, emitDone } from '../lib/emitter.js'

const tailers = new Map<string, ChildProcess>()

export function startRuntimeLogs(deploymentId: string, containerName: string): void {
  stopRuntimeLogs(deploymentId, false)

  emitLog(deploymentId, 'system', `Tailing runtime logs for ${containerName}…`)

  const proc = spawn('docker', ['logs', '--follow', '--timestamps', containerName])
  tailers.set(deploymentId, proc)

  proc.stdout.on('data', (chunk: Buffer) => {
    for (const line of chunk.toString().split('\n').filter(Boolean)) {
      emitLog(deploymentId, 'stdout', line)
    }
  })

  proc.stderr.on('data', (chunk: Buffer) => {
    for (const line of chunk.toString().split('\n').filter(Boolean)) {
      emitLog(deploymentId, 'system', `[docker] ${line}`)
    }
  })

  proc.on('exit', (code) => {
    tailers.delete(deploymentId)
    if (code !== null && code !== 0) {
      emitLog(deploymentId, 'system', `Log tailer exited with code ${code}`)
    }
  })

  proc.on('error', (err) => {
    tailers.delete(deploymentId)
    emitLog(deploymentId, 'system', `Log tailer error: ${err.message}`)
  })
}

export function stopRuntimeLogs(deploymentId: string, emitEnd = true): void {
  const proc = tailers.get(deploymentId)
  if (proc) {
    proc.kill('SIGTERM')
    tailers.delete(deploymentId)
    emitLog(deploymentId, 'system', 'Runtime log tailer stopped.')
  }
  if (emitEnd) {
    emitDone(deploymentId)
  }
}
