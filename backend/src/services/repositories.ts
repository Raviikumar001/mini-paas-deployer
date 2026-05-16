import { spawn } from 'node:child_process'

const BRANCH_LOOKUP_TIMEOUT_MS = 10_000

export class RepositoryLookupError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'RepositoryLookupError'
  }
}

export async function listRemoteBranches(gitUrl: string): Promise<string[]> {
  return new Promise((resolve, reject) => {
    const child = spawn('git', ['ls-remote', '--heads', gitUrl], {
      stdio: ['ignore', 'pipe', 'pipe'],
    })

    let stdout = ''
    let stderr = ''
    let settled = false

    const finish = (fn: () => void) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      fn()
    }

    const timer = setTimeout(() => {
      child.kill('SIGTERM')
      finish(() => reject(new RepositoryLookupError('branch lookup timed out')))
    }, BRANCH_LOOKUP_TIMEOUT_MS)

    child.stdout.setEncoding('utf8')
    child.stderr.setEncoding('utf8')
    child.stdout.on('data', (chunk) => {
      stdout += chunk
    })
    child.stderr.on('data', (chunk) => {
      stderr += chunk
    })

    child.on('error', (err) => {
      finish(() => reject(new RepositoryLookupError(`git failed to start: ${err.message}`)))
    })

    child.on('close', (code) => {
      finish(() => {
        if (code !== 0) {
          reject(new RepositoryLookupError(stderr.trim() || 'repository branches could not be loaded'))
          return
        }

        const branches = stdout
          .split('\n')
          .flatMap((line) => {
            const ref = line.trim().split(/\s+/)[1]
            if (!ref?.startsWith('refs/heads/')) return []
            return [ref.slice('refs/heads/'.length)]
          })
          .sort((a, b) => {
            if (a === 'main') return -1
            if (b === 'main') return 1
            if (a === 'master') return -1
            if (b === 'master') return 1
            return a.localeCompare(b)
          })

        resolve([...new Set(branches)])
      })
    })
  })
}
