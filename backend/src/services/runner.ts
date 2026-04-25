import { exec as execCb } from 'child_process'
import { promisify } from 'util'

const exec = promisify(execCb)

const NETWORK = process.env.DOCKER_NETWORK ?? 'brimble_net'

// ── Container lifecycle ───────────────────────────────────────────────────────

export async function runContainer(
  containerName: string,
  imageTag: string,
  appPort: number,
): Promise<string> {
  // --network puts the container on the same bridge as Caddy
  // No host port binding needed — Caddy reaches it by container name
  const { stdout } = await exec(
    `docker run -d --name ${containerName} --network ${NETWORK} --env PORT=${appPort} ${imageTag}`,
  )
  return stdout.trim()  // full container ID
}

export async function stopAndRemove(containerName: string): Promise<void> {
  // docker stop sends SIGTERM, waits 10s, then SIGKILL — graceful shutdown
  await exec(`docker stop ${containerName}`).catch(() => {})
  await exec(`docker rm ${containerName}`).catch(() => {})
}
