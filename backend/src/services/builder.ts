import { spawn, exec as execCb } from 'child_process'
import { access, mkdir } from 'fs/promises'
import { createHash } from 'crypto'
import { promisify } from 'util'
import { emitLog } from '../lib/emitter.js'

const exec = promisify(execCb)
const REPO_CACHE_DIR = process.env.REPO_CACHE_DIR ?? '/data/repo-cache'



function spawnStream(
  cmd: string,
  args: string[],
  deploymentId: string,
  options?: {
    env?: NodeJS.ProcessEnv
    cwd?: string
  },
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const proc = spawn(cmd, args, {
      env: options?.env ?? process.env,
      cwd: options?.cwd,
    })

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

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

function getMirrorPath(url: string): string {
  const digest = createHash('sha1').update(url).digest('hex')
  return `${REPO_CACHE_DIR}/${digest}.git`
}

async function ensureMirror(url: string, deploymentId: string): Promise<string | null> {
  try {
    await mkdir(REPO_CACHE_DIR, { recursive: true })
    const mirrorPath = getMirrorPath(url)

    if (await pathExists(mirrorPath)) {
      emitLog(deploymentId, 'system', 'Refreshing cached repository mirror…')
      await spawnStream('git', ['-C', mirrorPath, 'remote', 'set-url', 'origin', url], deploymentId)
      await spawnStream('git', ['-C', mirrorPath, 'fetch', '--prune', 'origin'], deploymentId)
      emitLog(deploymentId, 'system', 'Repository mirror refreshed.')
      return mirrorPath
    }

    emitLog(deploymentId, 'system', 'Creating repository mirror cache…')
    await spawnStream('git', ['clone', '--mirror', url, mirrorPath], deploymentId)
    emitLog(deploymentId, 'system', 'Repository mirror ready.')
    return mirrorPath
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    emitLog(deploymentId, 'system', `Mirror cache unavailable, falling back to direct clone (${message}).`)
    return null
  }
}



export async function cloneRepo(
  url: string,
  destPath: string,
  deploymentId: string,
  branch?: string,
  options?: {
    cloneBranch?: string
    checkoutSha?: string
  },
): Promise<void> {
  const cloneBranch = options?.cloneBranch ?? branch
  const mirrorPath = await ensureMirror(url, deploymentId)
  const args = ['clone', '--depth=1']
  if (cloneBranch && cloneBranch !== 'main') {
    args.push('--branch', cloneBranch)
  }
  if (mirrorPath) {
    args.push('--reference-if-able', mirrorPath, '--dissociate')
  }
  args.push(url, destPath)
  emitLog(
    deploymentId,
    'system',
    `Cloning ${url}${cloneBranch && cloneBranch !== 'main' ? ` #${cloneBranch}` : ''}${mirrorPath ? ' using local mirror cache' : ''}…`,
  )
  await spawnStream('git', args, deploymentId)
  if (options?.checkoutSha) {
    emitLog(deploymentId, 'system', `Checking out ${options.checkoutSha.slice(0, 7)}…`)
    await spawnStream('git', ['-C', destPath, 'fetch', '--depth=1', 'origin', options.checkoutSha], deploymentId)
    await spawnStream('git', ['-C', destPath, 'checkout', options.checkoutSha], deploymentId)
  }
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
      env: {
        ...process.env,
        BUILDKIT_HOST: process.env.BUILDKIT_HOST ?? 'docker-container://buildkit',
      },
    },
  )

  emitLog(deploymentId, 'system', 'Build complete.')
}
