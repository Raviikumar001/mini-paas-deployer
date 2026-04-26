import { spawn, exec as execCb } from 'child_process'
import { promisify } from 'util'
import { emitLog } from '../lib/emitter.js'

const exec = promisify(execCb)

// ── Internal helper ───────────────────────────────────────────────────────────
// Spawn a process, stream every stdout/stderr line to the SSE log panel,
// and resolve/reject on exit. Reused by both git clone and railpack build.

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

// ── Git clone ─────────────────────────────────────────────────────────────────
// Uses spawn (not exec) so the URL never touches a shell — prevents command
// injection from a crafted git URL like "https://x.com/y$(rm -rf /)".

export async function cloneRepo(
  url: string,
  destPath: string,
  deploymentId: string,
): Promise<void> {
  emitLog(deploymentId, 'system', `Cloning ${url}…`)
  await spawnStream('git', ['clone', '--depth=1', url, destPath], deploymentId)
  emitLog(deploymentId, 'system', 'Clone complete.')
}

// ── Port detection ────────────────────────────────────────────────────────────
// `railpack info --format json` is best-effort; the JSON schema isn't fully
// documented so we probe several known paths. Caller defaults to 3000 —
// apps should always read process.env.PORT anyway.

// Exported for unit testing — parses PORT from `railpack info --format json` output.
// The JSON schema isn't fully documented so we probe several known paths.
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
    // best-effort
  }
  return null
}

export async function detectPort(srcPath: string): Promise<number | null> {
  try {
    const { stdout } = await exec(`railpack info --format json ${srcPath}`)
    return parsePortFromInfo(stdout)
  } catch {
    // best-effort
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
): Promise<void> {
  emitLog(deploymentId, 'system', `Building image ${imageTag}…`)

  await spawnStream(
    'railpack',
    ['build', srcPath, '--name', imageTag, '--cache-key', cacheKey],
    deploymentId,
    {
      ...process.env,
      BUILDKIT_HOST: process.env.BUILDKIT_HOST ?? 'docker-container://buildkit',
    },
  )

  emitLog(deploymentId, 'system', 'Build complete.')
}
