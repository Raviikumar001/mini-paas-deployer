import { deleteDeployment, type Deployment } from '../db/schema.js'
import { removeRoute } from './caddy.js'
import { stopPostgres, stopRedis } from './addons.js'
import { stopAndRemove } from './runner.js'
import { stopRuntimeLogs } from './runtime-logs.js'

export async function destroyDeployment(
  deployment: Deployment,
  deleteData = false,
): Promise<void> {
  await Promise.allSettled([
    deployment.container_name ? stopAndRemove(deployment.container_name) : Promise.resolve(),
    removeRoute(deployment.id),
    stopPostgres(deployment.id, deleteData),
    stopRedis(deployment.id, deleteData),
    stopRuntimeLogs(deployment.id),
  ])

  deleteDeployment(deployment.id)
}
