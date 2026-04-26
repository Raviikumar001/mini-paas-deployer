// All types mirror the backend schema exactly so no translation layer is needed.

export type DeploymentStatus =
  | 'pending' | 'building' | 'deploying' | 'running' | 'failed' | 'stopped'

export interface Deployment {
  id: string
  name: string
  source_url: string | null
  status: DeploymentStatus
  image_tag: string | null
  container_name: string | null
  app_port: number
  url: string | null
  error: string | null
  created_at: string
  updated_at: string
}

// SSE event shapes ─────────────────────────────────────────────────────────────

export interface LogEvent {
  type: 'log'
  stream: 'stdout' | 'stderr' | 'system'
  message: string
  ts: string
}

export interface StatusEvent {
  type: 'status'
  status: DeploymentStatus
}

export interface DoneEvent {
  type: 'done'
}

export type PipelineEvent = LogEvent | StatusEvent | DoneEvent

// HTTP helpers ─────────────────────────────────────────────────────────────────

const BASE = '/api'

async function handle<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const msg = await res.text().catch(() => res.statusText)
    throw new Error(msg)
  }
  if (res.status === 204) return undefined as T
  return res.json() as Promise<T>
}

// Namespaced API object — easy to extend, easy to mock in tests.
export const api = {
  deployments: {
    list: (): Promise<Deployment[]> =>
      fetch(`${BASE}/deployments`).then(handle),

    create: (gitUrl: string): Promise<Deployment> =>
      fetch(`${BASE}/deployments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gitUrl }),
      }).then(handle),

    remove: (id: string): Promise<void> =>
      fetch(`${BASE}/deployments/${id}`, { method: 'DELETE' }).then(handle),
  },
}
