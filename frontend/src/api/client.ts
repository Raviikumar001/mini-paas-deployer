export type DeploymentStatus =
  | 'pending' | 'building' | 'deploying' | 'running' | 'redeploying' | 'failed' | 'stopped'

export interface Deployment {
  id: string
  name: string
  source_url: string | null
  branch: string | null
  status: DeploymentStatus
  image_tag: string | null
  container_name: string | null
  app_port: number
  url: string | null
  env_vars: string   // JSON-encoded Record<string,string>
  addons: string     // JSON-encoded Array<{ type: string }>
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

export interface DoneEvent { type: 'done' }

export type PipelineEvent = LogEvent | StatusEvent | DoneEvent

// HTTP helpers ─────────────────────────────────────────────────────────────────

const BASE = '/api'

async function handle<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const msg = await res.text().catch(() => res.statusText)
    throw new Error(msg)
  }
  if (res.status === 204) return undefined as T
  return (await res.json()) as T
}

export const api = {
  deployments: {
    list: (): Promise<Deployment[]> =>
      fetch(`${BASE}/deployments`).then(handle<Deployment[]>),

    create: (params: {
      gitUrl: string
      envVars?: Record<string, string>
      branch?: string
      addons?: Array<{ type: 'postgres' | 'redis' }>
    }): Promise<Deployment> =>
      fetch(`${BASE}/deployments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
      }).then(handle<Deployment>),

    redeploy: (id: string, envVars?: Record<string, string>): Promise<Deployment> =>
      fetch(`${BASE}/deployments/${id}/redeploy`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ envVars }),
      }).then(handle<Deployment>),

    remove: (id: string): Promise<void> =>
      fetch(`${BASE}/deployments/${id}`, { method: 'DELETE' }).then(handle<void>),
  },
}
