import { createConnection } from 'net'
import {
  insertDeploymentHealthCheck,
  listDeployments,
  updateDeployment,
} from '../db/schema.js'

const HEALTH_INTERVAL_MS = 30_000

async function checkDeploymentHealth(host: string, port: number): Promise<{ ok: boolean; latencyMs: number | null }> {
  const startedAt = Date.now()

  return new Promise((resolve) => {
    const socket = createConnection({ host, port })
    let settled = false

    const finish = (ok: boolean) => {
      if (settled) return
      settled = true
      socket.destroy()
      resolve({
        ok,
        latencyMs: ok ? Date.now() - startedAt : null,
      })
    }

    socket.once('connect', () => finish(true))
    socket.once('error', () => finish(false))
    socket.setTimeout(2_000, () => finish(false))
  })
}

export async function runHealthSweep(): Promise<void> {
  const deployments = listDeployments().filter((deployment) =>
    deployment.status === 'running' && deployment.container_name,
  )

  for (const deployment of deployments) {
    const result = await checkDeploymentHealth(deployment.container_name!, deployment.app_port)
    insertDeploymentHealthCheck(deployment.id, result.ok, result.latencyMs)

    if (!result.ok) {
      updateDeployment(deployment.id, {
        last_failure_at: new Date().toISOString(),
        last_failure_stage: 'runtime-health',
      })
    }
  }
}

export function startHealthMonitor(): void {
  runHealthSweep().catch((err) => console.error('health sweep error:', err))
  setInterval(() => {
    runHealthSweep().catch((err) => console.error('health sweep error:', err))
  }, HEALTH_INTERVAL_MS)
}
