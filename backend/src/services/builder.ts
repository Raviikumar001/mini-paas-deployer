import { spawn, exec as execCb } from 'child_process'
import { promisify } from 'util'
import { emitLog } from '../lib/emitter.js'

const exec = promisify(execCb)



function spawnStream(
  cmd: string,
  args: string[],
  deploymentId: string,
  env?: NodeJS.ProcessEnv,
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const proc = spawn(cmd, args, { env: env ?? process.env })

    const drain = (stream: 'stdout' | 'stderr') => (chunk: Buffer) => {
      for (const line of chunk.toString().split('\n').filter(Boolean)) {
        emitLog(deploymentId, stream, line)
      }
    }

    proc.stdout.on('data', drain('stdout'))
    proc.stderr.on('data', drain('stderr'))
    proc.on('close', (code) =>
      code === 0 ? resolve() : reject(new Error(`${cmd} exited with code ${code}`)),
    )
    proc.on('error', reject)
  })
}



export async function cloneRepo(
  url: string,
  destPath: string,
  deploymentId: string,
): Promise<void> {
  emitLog(deploymentId, 'system', `Cloning ${url}…`)
  await spawnStream('git', ['clone', '--depth=1', url, destPath], deploymentId)
  emitLog(deploymentId, 'system', 'Clone complete.')
}


export function parsePortFromInfo(stdout: string): number | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const info = JSON.parse(stdout) as any
    const raw =
      info?.deploy?.variables?.PORT ??
      info?.variables?.PORT ??
      info?.config?.deploy?.variables?.PORT
    const n = Number(raw)
    if (raw !== undefined && !Number.isNaN(n) && n > 0) return n
  } catch {
    // best-effort; if parsing fails or PORT is not found/invalid, we'll just use the default
  }
  return null
}

export async function detectPort(srcPath: string): Promise<number | null> {
  try {
    const { stdout } = await exec(`railpack info --format json ${srcPath}`)
    return parsePortFromInfo(stdout)
  } catch {
    // best-effort; if parsing fails or PORT is not found/invalid, we'll just use the default
  }
  return null
}

// ── Railpack build ────────────────────────────────────────────────────────────
// Streams build output live to the SSE log panel so users see progress.
// --cache-key is per repo name so repeated deploys of the same repo reuse
// BuildKit layer cache — free cache reuse with no extra infrastructure.

export async function buildImage(
  srcPath: string,
  imageTag: string,
  deploymentId: string,
  cacheKey: string,
  envVars: Record<string, string> = {},
): Promise<void> {
  emitLog(deploymentId, 'system', `Building image ${imageTag}…`)

  const envArgs = Object.entries(envVars).flatMap(([k, v]) => ['--env', `${k}=${v}`])

  await spawnStream(
    'railpack',
    ['build', srcPath, '--name', imageTag, '--cache-key', cacheKey, ...envArgs],
    deploymentId,
    {
      ...process.env,
      BUILDKIT_HOST: process.env.BUILDKIT_HOST ?? 'docker-container://buildkit',
    },
  )

  emitLog(deploymentId, 'system', 'Build complete.')
}
