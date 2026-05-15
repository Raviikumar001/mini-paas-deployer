export type DeploymentStatus =
  | 'pending' | 'building' | 'deploying' | 'running' | 'redeploying' | 'failed' | 'stopped'

export interface AddonStatus {
  type: 'postgres' | 'redis'
  persistent: boolean
  status: 'running' | 'stopped'
  connectionEnv: 'DATABASE_URL' | 'REDIS_URL'
}

export interface Deployment {
  id: string
  name: string
  source_url: string | null
  branch: string | null
  source_sha: string | null
  source_message: string | null
  pr_number: number | null
  pr_url: string | null
  is_preview: number
  build_duration_ms: number | null
  deploy_duration_ms: number | null
  last_failure_at: string | null
  last_failure_stage: string | null
  detected_language: string | null
  detected_framework: string | null
  detected_start_command: string | null
  status: DeploymentStatus
  image_tag: string | null
  container_name: string | null
  app_port: number
  url: string | null
  env_vars: string   // JSON-encoded Record<string,string>
  secret_env_keys: string[]
  addons: string     // JSON-encoded Array<{ type: string }>
  addon_statuses: AddonStatus[]
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

export interface DeploymentEvent {
  id: number
  deployment_id: string
  type:
    | 'deployment_created'
    | 'addons_provisioning'
    | 'addons_ready'
    | 'clone_started'
    | 'clone_completed'
    | 'build_started'
    | 'build_completed'
    | 'container_started'
    | 'healthcheck_passed'
    | 'route_configured'
    | 'runtime_live'
    | 'redeploy_started'
    | 'traffic_shifted'
    | 'old_runtime_stopped'
    | 'deployment_deleted'
    | 'deployment_failed'
  message: string
  metadata: string
  created_at: string
}

export interface DeploymentHealthCheck {
  id: number
  deployment_id: string
  ok: number
  latency_ms: number | null
  created_at: string
}

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
  repositories: {
    branches: (gitUrl: string): Promise<{ branches: string[] }> =>
      fetch(`${BASE}/repositories/branches?gitUrl=${encodeURIComponent(gitUrl)}`)
        .then(handle<{ branches: string[] }>),
  },

  deployments: {
    list: (): Promise<Deployment[]> =>
      fetch(`${BASE}/deployments`).then(handle<Deployment[]>),

    events: (id: string): Promise<DeploymentEvent[]> =>
      fetch(`${BASE}/deployments/${id}/events`).then(handle<DeploymentEvent[]>),

    health: (id: string): Promise<DeploymentHealthCheck[]> =>
      fetch(`${BASE}/deployments/${id}/health`).then(handle<DeploymentHealthCheck[]>),

    create: (params: {
      gitUrl: string
      envVars?: Record<string, string>
      secretEnvVars?: Record<string, string>
      branch?: string
      addons?: Array<{ type: 'postgres' | 'redis'; persistent?: boolean }>
    }): Promise<Deployment> =>
      fetch(`${BASE}/deployments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
      }).then(handle<Deployment>),

    redeploy: (
      id: string,
      envVars?: Record<string, string>,
      secretEnvVars?: Record<string, string>,
    ): Promise<Deployment> =>
      fetch(`${BASE}/deployments/${id}/redeploy`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ envVars, secretEnvVars }),
      }).then(handle<Deployment>),

    remove: (id: string): Promise<void> =>
      fetch(`${BASE}/deployments/${id}`, { method: 'DELETE' }).then(handle<void>),
  },
}
