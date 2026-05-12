import { spawn, exec as execCb } from 'child_process'
import { promisify } from 'util'
import { createConnection } from 'net'
import { emitLog } from '../lib/emitter.js'
import type { Addon, AddonType } from '../db/schema.js'

const exec = promisify(execCb)
const NETWORK = process.env.DOCKER_NETWORK ?? 'nobuild_net'

export function postgresContainerName(deploymentId: string): string {
  return `dep-${deploymentId}-db`
}

export function postgresVolumeName(deploymentId: string): string {
  return `dep-${deploymentId}-postgres-data`
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
    '--volume', `${postgresVolumeName(deploymentId)}:/var/lib/postgresql/data`,
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

export async function stopPostgres(deploymentId: string, removeVolume = false): Promise<void> {
  const name = postgresContainerName(deploymentId)
  await exec(`docker stop ${name}`).catch(() => {})
  await exec(`docker rm   ${name}`).catch(() => {})
  if (removeVolume) {
    await exec(`docker volume rm ${postgresVolumeName(deploymentId)}`).catch(() => {})
  }
}

// ── Redis sidecar ─────────────────────────────────────────────────────────────

export function redisContainerName(deploymentId: string): string {
  return `dep-${deploymentId}-redis`
}

export function redisVolumeName(deploymentId: string): string {
  return `dep-${deploymentId}-redis-data`
}

export function buildRedisUrl(deploymentId: string): string {
  const host = redisContainerName(deploymentId)
  return `redis://${host}:6379`
}

export async function runRedis(deploymentId: string, persistent = false): Promise<void> {
  const name = redisContainerName(deploymentId)
  emitLog(deploymentId, 'system', `Starting Redis sidecar${persistent ? ' with persistence' : ''}…`)

  await exec(`docker stop ${name}`).catch(() => {})
  await exec(`docker rm   ${name}`).catch(() => {})

  const args = [
    'run', '-d',
    '--name', name,
    '--network', NETWORK,
    ...(persistent ? ['--volume', `${redisVolumeName(deploymentId)}:/data`] : []),
    'redis:7-alpine',
    ...(persistent ? ['redis-server', '--appendonly', 'yes'] : []),
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

export async function stopRedis(deploymentId: string, removeVolume = false): Promise<void> {
  const name = redisContainerName(deploymentId)
  await exec(`docker stop ${name}`).catch(() => {})
  await exec(`docker rm   ${name}`).catch(() => {})
  if (removeVolume) {
    await exec(`docker volume rm ${redisVolumeName(deploymentId)}`).catch(() => {})
  }
}

export interface AddonStatus {
  type: AddonType
  persistent: boolean
  status: 'running' | 'stopped'
  connectionEnv: 'DATABASE_URL' | 'REDIS_URL'
}

async function isContainerRunning(name: string): Promise<boolean> {
  try {
    const { stdout } = await exec(`docker inspect --format='{{.State.Running}}' ${name}`)
    return stdout.trim() === "'true'" || stdout.trim() === 'true'
  } catch {
    return false
  }
}

export async function getAddonStatuses(
  deploymentId: string,
  addons: Addon[],
): Promise<AddonStatus[]> {
  const statuses: AddonStatus[] = []

  if (addons.some((a) => a.type === 'postgres')) {
    statuses.push({
      type: 'postgres',
      persistent: true,
      status: await isContainerRunning(postgresContainerName(deploymentId)) ? 'running' : 'stopped',
      connectionEnv: 'DATABASE_URL',
    })
  }

  const redis = addons.find((a) => a.type === 'redis')
  if (redis) {
    statuses.push({
      type: 'redis',
      persistent: redis.persistent === true,
      status: await isContainerRunning(redisContainerName(deploymentId)) ? 'running' : 'stopped',
      connectionEnv: 'REDIS_URL',
    })
  }

  return statuses
}
