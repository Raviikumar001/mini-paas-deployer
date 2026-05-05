import { spawn, exec as execCb } from 'child_process'
import { promisify } from 'util'
import { createConnection } from 'net'
import { emitLog } from '../lib/emitter.js'

const exec = promisify(execCb)
const NETWORK = process.env.DOCKER_NETWORK ?? 'nobuild_net'

export function postgresContainerName(deploymentId: string): string {
  return `dep-${deploymentId}-db`
}

export function buildDatabaseUrl(deploymentId: string): string {
  const host = postgresContainerName(deploymentId)
  return `postgres://brimble:brimble@${host}:5432/brimble`
}

export async function runPostgres(deploymentId: string): Promise<void> {
  const name = postgresContainerName(deploymentId)
  emitLog(deploymentId, 'system', 'Starting PostgreSQL sidecar…')

  // Clean up any stale sidecar first
  await exec(`docker stop ${name}`).catch(() => {})
  await exec(`docker rm   ${name}`).catch(() => {})

  const args = [
    'run', '-d',
    '--name', name,
    '--network', NETWORK,
    '--env', 'POSTGRES_USER=brimble',
    '--env', 'POSTGRES_PASSWORD=brimble',
    '--env', 'POSTGRES_DB=brimble',
    'postgres:15-alpine',
  ]

  await new Promise<void>((resolve, reject) => {
    const proc = spawn('docker', args)
    let stderr = ''
    proc.stderr.on('data', (d: Buffer) => { stderr += d.toString() })
    proc.on('close', (code) =>
      code === 0 ? resolve() : reject(new Error(`postgres sidecar failed: ${stderr.trim()}`)),
    )
    proc.on('error', reject)
  })

  emitLog(deploymentId, 'system', 'PostgreSQL sidecar started.')
}

export async function waitForPostgres(
  deploymentId: string,
  timeoutMs = 30_000,
): Promise<void> {
  const host = postgresContainerName(deploymentId)
  const deadline = Date.now() + timeoutMs

  while (Date.now() < deadline) {
    const ready = await new Promise<boolean>((resolve) => {
      const sock = createConnection({ host, port: 5432 })
      sock.once('connect', () => { sock.destroy(); resolve(true) })
      sock.once('error',   () => { sock.destroy(); resolve(false) })
      sock.setTimeout(1_000, () => { sock.destroy(); resolve(false) })
    })

    if (ready) {
      emitLog(deploymentId, 'system', 'PostgreSQL is ready.')
      return
    }
    await new Promise((r) => setTimeout(r, 400))
  }

  throw new Error(`PostgreSQL sidecar did not become ready within ${timeoutMs / 1000}s`)
}

export async function stopPostgres(deploymentId: string): Promise<void> {
  const name = postgresContainerName(deploymentId)
  await exec(`docker stop ${name}`).catch(() => {})
  await exec(`docker rm   ${name}`).catch(() => {})
}

// ── Redis sidecar ─────────────────────────────────────────────────────────────

export function redisContainerName(deploymentId: string): string {
  return `dep-${deploymentId}-redis`
}

export function buildRedisUrl(deploymentId: string): string {
  const host = redisContainerName(deploymentId)
  return `redis://${host}:6379`
}

export async function runRedis(deploymentId: string): Promise<void> {
  const name = redisContainerName(deploymentId)
  emitLog(deploymentId, 'system', 'Starting Redis sidecar…')

  await exec(`docker stop ${name}`).catch(() => {})
  await exec(`docker rm   ${name}`).catch(() => {})

  const args = [
    'run', '-d',
    '--name', name,
    '--network', NETWORK,
    'redis:7-alpine',
  ]

  await new Promise<void>((resolve, reject) => {
    const proc = spawn('docker', args)
    let stderr = ''
    proc.stderr.on('data', (d: Buffer) => { stderr += d.toString() })
    proc.on('close', (code) =>
      code === 0 ? resolve() : reject(new Error(`redis sidecar failed: ${stderr.trim()}`)),
    )
    proc.on('error', reject)
  })

  emitLog(deploymentId, 'system', 'Redis sidecar started.')
}

export async function waitForRedis(
  deploymentId: string,
  timeoutMs = 15_000,
): Promise<void> {
  const host = redisContainerName(deploymentId)
  const deadline = Date.now() + timeoutMs

  while (Date.now() < deadline) {
    const ready = await new Promise<boolean>((resolve) => {
      const sock = createConnection({ host, port: 6379 })
      sock.once('connect', () => { sock.destroy(); resolve(true) })
      sock.once('error',   () => { sock.destroy(); resolve(false) })
      sock.setTimeout(1_000, () => { sock.destroy(); resolve(false) })
    })

    if (ready) {
      emitLog(deploymentId, 'system', 'Redis is ready.')
      return
    }
    await new Promise((r) => setTimeout(r, 400))
  }

  throw new Error(`Redis sidecar did not become ready within ${timeoutMs / 1000}s`)
}

export async function stopRedis(deploymentId: string): Promise<void> {
  const name = redisContainerName(deploymentId)
  await exec(`docker stop ${name}`).catch(() => {})
  await exec(`docker rm   ${name}`).catch(() => {})
}
