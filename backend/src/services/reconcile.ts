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
