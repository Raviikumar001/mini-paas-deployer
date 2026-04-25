import { exec as execCb } from 'child_process'
import { promisify } from 'util'
import { spawn } from 'child_process'
import { emitLog } from '../lib/emitter.js'

const exec = promisify(execCb)

// ── Git clone ─────────────────────────────────────────────────────────────────

export async function cloneRepo(
  url: string,
  destPath: string,
  deploymentId: string,
): Promise<void> {
  emitLog(deploymentId, 'system', `Cloning ${url}…`)
  await exec(`git clone --depth=1 ${url} ${destPath}`)
  emitLog(deploymentId, 'system', 'Clone complete.')
}

// ── Port detection ────────────────────────────────────────────────────────────

export async function detectPort(srcPath: string): Promise<number | null> {
  try {
    const { stdout } = await exec(`railpack analyze ${srcPath}`)
    const plan = JSON.parse(stdout) as { deploy?: { variables?: Record<string, string> } }
    const portStr = plan.deploy?.variables?.PORT
    if (portStr) return Number(portStr)
  } catch {
    // railpack analyze is best-effort
  }
  return null
}

// ── Railpack build ────────────────────────────────────────────────────────────
// Streams stdout/stderr to SSE in real time so the client sees build progress.

export async function buildImage(
  srcPath: string,
  imageTag: string,
  deploymentId: string,
): Promise<void> {
  emitLog(deploymentId, 'system', `Building image ${imageTag}…`)

  await new Promise<void>((resolve, reject) => {
    const proc = spawn(
      'railpack',
      ['build', srcPath, '--name', imageTag],
      {
        env: {
          ...process.env,
          // Railpack communicates with the named buildkit container via the Docker socket
          BUILDKIT_HOST: process.env.BUILDKIT_HOST ?? 'docker-container://buildkit',
        },
      },
    )

    proc.stdout.on('data', (chunk: Buffer) => {
      for (const line of chunk.toString().split('\n').filter(Boolean)) {
        emitLog(deploymentId, 'stdout', line)
      }
    })

    proc.stderr.on('data', (chunk: Buffer) => {
      for (const line of chunk.toString().split('\n').filter(Boolean)) {
        emitLog(deploymentId, 'stderr', line)
      }
    })

    proc.on('close', (code) => {
      if (code === 0) {
        emitLog(deploymentId, 'system', 'Build complete.')
        resolve()
      } else {
        reject(new Error(`railpack exited with code ${code}`))
      }
    })

    proc.on('error', reject)
  })
}
