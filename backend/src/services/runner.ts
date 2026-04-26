import { exec as execCb } from 'child_process'
import { promisify } from 'util'
import { createConnection } from 'net'

const exec = promisify(execCb)

const NETWORK = process.env.DOCKER_NETWORK ?? 'brimble_net'

// ── Container lifecycle ───────────────────────────────────────────────────────

export async function runContainer(
  containerName: string,
  imageTag: string,
  appPort: number,
): Promise<string> {
  // No host-port binding — Caddy reaches containers by name over brimble_net.
  // PORT env var is the universal contract: apps read process.env.PORT.
  const { stdout } = await exec(
    `docker run -d --name ${containerName} --network ${NETWORK} --env PORT=${appPort} ${imageTag}`,
  )
  return stdout.trim() // full container ID
}

export async function stopAndRemove(containerName: string): Promise<void> {
  // docker stop sends SIGTERM, waits gracePeriod (default 10s), then SIGKILL
  await exec(`docker stop ${containerName}`).catch(() => {})
  await exec(`docker rm   ${containerName}`).catch(() => {})
}

// ── Readiness probe ───────────────────────────────────────────────────────────
// Poll TCP until the app accepts connections before we tell Caddy to route to it.
// Without this, the first real request arrives while the process is still
// bootstrapping and Caddy returns a 502.

export async function waitForContainer(
  host: string,
  port: number,
  timeoutMs = 30_000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs

  while (Date.now() < deadline) {
    const ready = await new Promise<boolean>((resolve) => {
      const sock = createConnection({ host, port })
      sock.once('connect', () => { sock.destroy(); resolve(true) })
      sock.once('error',   () => { sock.destroy(); resolve(false) })
      sock.setTimeout(1_000, () => { sock.destroy(); resolve(false) })
    })

    if (ready) return
    await new Promise((r) => setTimeout(r, 400))
  }

  throw new Error(`${host}:${port} did not become ready within ${timeoutMs / 1000}s`)
}
