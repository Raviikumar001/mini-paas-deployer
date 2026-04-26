import { spawn, exec as execCb } from 'child_process'
import { promisify } from 'util'
import { createConnection } from 'net'

const exec = promisify(execCb)

const NETWORK = process.env.DOCKER_NETWORK ?? 'brimble_net'

// ── Container lifecycle ───────────────────────────────────────────────────────

export async function runContainer(
  containerName: string,
  imageTag: string,
  appPort: number,
  envVars: Record<string, string> = {},
): Promise<string> {
  // Use spawn (not exec) so env var values with spaces or special characters
  // are passed as separate argv elements — no shell quoting needed.
  const envArgs = Object.entries(envVars).flatMap(([k, v]) => ['--env', `${k}=${v}`])
  const args = [
    'run', '-d',
    '--name', containerName,
    '--network', NETWORK,
    '--env', `PORT=${appPort}`,
    ...envArgs,
    imageTag,
  ]

  return new Promise((resolve, reject) => {
    const proc = spawn('docker', args)
    let stdout = ''
    let stderr = ''
    proc.stdout.on('data', (d: Buffer) => { stdout += d.toString() })
    proc.stderr.on('data', (d: Buffer) => { stderr += d.toString() })
    proc.on('close', (code) =>
      code === 0
        ? resolve(stdout.trim())
        : reject(new Error(`docker run failed: ${stderr.trim()}`)),
    )
    proc.on('error', reject)
  })
}

export async function stopAndRemove(containerName: string): Promise<void> {
  await exec(`docker stop ${containerName}`).catch(() => {})
  await exec(`docker rm   ${containerName}`).catch(() => {})
}

// ── Readiness probe ───────────────────────────────────────────────────────────

export async function waitForContainer(
  host: string,
  port: number,
  timeoutMs = 60_000,
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
