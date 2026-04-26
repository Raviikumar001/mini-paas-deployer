import { exec as execCb } from 'child_process'
import { promisify } from 'util'
import { listDeployments, updateDeployment } from '../db/schema.js'
import { addRoute } from './caddy.js'

const exec = promisify(execCb)

async function isContainerRunning(name: string): Promise<boolean> {
  try {
    const { stdout } = await exec(
      `docker inspect --format='{{.State.Running}}' ${name}`,
    )
    return stdout.trim() === "'true'" || stdout.trim() === 'true'
  } catch {
    return false
  }
}

// Called once on backend startup.
// - running deployments: re-register Caddy routes if container is alive, else mark stopped
// - in-flight deployments (building/deploying/redeploying): mark failed — pipeline was killed
export async function reconcile(): Promise<void> {
  const deployments = listDeployments()

  for (const dep of deployments) {
    if (['building', 'deploying', 'redeploying'].includes(dep.status)) {
      updateDeployment(dep.id, {
        status: 'failed',
        error: 'Server restarted while deployment was in progress',
      })
      continue
    }

    if (dep.status === 'running' && dep.container_name) {
      const alive = await isContainerRunning(dep.container_name)
      if (alive) {
        // Re-register the route — Caddy lost it when it restarted.
        // Recover subdomain from the stored URL (e.g. "my-app-a4o0.localhost" → "my-app-a4o0").
        const subdomain = dep.url
          ? new URL(dep.url).hostname.split('.')[0]
          : dep.id.toLowerCase().replace(/[^a-z0-9]/g, '')
        await addRoute(dep.id, subdomain, dep.container_name, dep.app_port).catch(() => {})
      } else {
        updateDeployment(dep.id, { status: 'stopped' })
      }
    }
  }
}
