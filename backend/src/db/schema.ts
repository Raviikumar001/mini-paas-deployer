import Database from 'better-sqlite3'

export type DeploymentStatus =
  | 'pending' | 'building' | 'deploying' | 'running' | 'redeploying' | 'failed' | 'stopped'

export type AddonType = 'postgres' | 'redis'

export interface Addon {
  type: AddonType
  persistent?: boolean
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
  pr_base_branch: string | null
  is_preview: number
  clone_duration_ms: number | null
  build_duration_ms: number | null
  deploy_duration_ms: number | null
  total_duration_ms: number | null
  last_failure_at: string | null
  last_failure_stage: string | null
  detected_language: string | null
  detected_framework: string | null
  detected_start_command: string | null
  status: DeploymentStatus
  image_tag: string | null
  container_id: string | null
  container_name: string | null
  app_port: number
  url: string | null
  env_vars: string   // JSON-encoded Record<string, string>
  secret_env_vars: string // JSON-encoded Record<string, string>
  addons: string     // JSON-encoded Addon[]
  error: string | null
  created_at: string
  updated_at: string
}

export interface LogLine {
  id: number
  deployment_id: string
  stream: 'stdout' | 'stderr' | 'system'
  message: string
  created_at: string
}

export type DeploymentEventType =
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

export interface DeploymentEvent {
  id: number
  deployment_id: string
  type: DeploymentEventType
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

export interface DeploymentMetricSample {
  id: number
  deployment_id: string
  cpu_pct: number | null
  memory_used_bytes: number | null
  memory_limit_bytes: number | null
  network_rx_bytes: number | null
  network_tx_bytes: number | null
  created_at: string
}

let db: Database.Database

export function getDb(): Database.Database {
  if (!db) {
    const path = process.env.DATABASE_PATH ?? './data/db.sqlite'
    db = new Database(path)
    db.pragma('journal_mode = WAL')   // WAL for better concurrent reads
    db.pragma('foreign_keys = ON')
    db.pragma('synchronous = NORMAL') // safe with WAL, faster than FULL
  }
  return db
}

export function initDb(): void {
  getDb().exec(`
    CREATE TABLE IF NOT EXISTS deployments (
      id             TEXT PRIMARY KEY,
      name           TEXT NOT NULL,
      source_url     TEXT,
      branch         TEXT DEFAULT 'main',
      source_sha     TEXT,
      source_message TEXT,
      pr_number      INTEGER,
      pr_url         TEXT,
      pr_base_branch TEXT,
      is_preview     INTEGER NOT NULL DEFAULT 0,
      clone_duration_ms INTEGER,
      build_duration_ms INTEGER,
      deploy_duration_ms INTEGER,
      total_duration_ms INTEGER,
      last_failure_at TEXT,
      last_failure_stage TEXT,
      detected_language TEXT,
      detected_framework TEXT,
      detected_start_command TEXT,
      status         TEXT NOT NULL DEFAULT 'pending',
      image_tag      TEXT,
      container_id   TEXT,
      container_name TEXT,
      app_port       INTEGER NOT NULL DEFAULT 3000,
      url            TEXT,
      error          TEXT,
      addons         TEXT DEFAULT '[]',
      created_at     TEXT NOT NULL,
      updated_at     TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS log_lines (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      deployment_id  TEXT NOT NULL REFERENCES deployments(id) ON DELETE CASCADE,
      stream         TEXT NOT NULL DEFAULT 'system',
      message        TEXT NOT NULL,
      created_at     TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS deployment_events (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      deployment_id  TEXT NOT NULL REFERENCES deployments(id) ON DELETE CASCADE,
      type           TEXT NOT NULL,
      message        TEXT NOT NULL,
      metadata       TEXT NOT NULL DEFAULT '{}',
      created_at     TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_logs_deployment
      ON log_lines(deployment_id, id);

    CREATE INDEX IF NOT EXISTS idx_deployment_events_deployment
      ON deployment_events(deployment_id, id);

    CREATE TABLE IF NOT EXISTS deployment_health_checks (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      deployment_id  TEXT NOT NULL REFERENCES deployments(id) ON DELETE CASCADE,
      ok             INTEGER NOT NULL,
      latency_ms     INTEGER,
      created_at     TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_deployment_health_checks_deployment
      ON deployment_health_checks(deployment_id, id);

    CREATE TABLE IF NOT EXISTS deployment_metric_samples (
      id                 INTEGER PRIMARY KEY AUTOINCREMENT,
      deployment_id      TEXT NOT NULL REFERENCES deployments(id) ON DELETE CASCADE,
      cpu_pct            REAL,
      memory_used_bytes  INTEGER,
      memory_limit_bytes INTEGER,
      network_rx_bytes   INTEGER,
      network_tx_bytes   INTEGER,
      created_at         TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_deployment_metric_samples_deployment
      ON deployment_metric_samples(deployment_id, id);
  `)

  // Non-destructive migrations — adds columns if this is an existing DB
  try {
    getDb().exec(`ALTER TABLE deployments ADD COLUMN env_vars TEXT NOT NULL DEFAULT '{}'`)
  } catch { /* column already exists */ }

  try {
    getDb().exec(`ALTER TABLE deployments ADD COLUMN secret_env_vars TEXT NOT NULL DEFAULT '{}'`)
  } catch { /* column already exists */ }

  try {
    getDb().exec(`ALTER TABLE deployments ADD COLUMN branch TEXT DEFAULT 'main'`)
  } catch { /* column already exists */ }

  try {
    getDb().exec(`ALTER TABLE deployments ADD COLUMN addons TEXT DEFAULT '[]'`)
  } catch { /* column already exists */ }

  try {
    getDb().exec(`ALTER TABLE deployments ADD COLUMN source_sha TEXT`)
  } catch { /* column already exists */ }

  try {
    getDb().exec(`ALTER TABLE deployments ADD COLUMN source_message TEXT`)
  } catch { /* column already exists */ }

  try {
    getDb().exec(`ALTER TABLE deployments ADD COLUMN pr_number INTEGER`)
  } catch { /* column already exists */ }

  try {
    getDb().exec(`ALTER TABLE deployments ADD COLUMN pr_url TEXT`)
  } catch { /* column already exists */ }

  try {
    getDb().exec(`ALTER TABLE deployments ADD COLUMN pr_base_branch TEXT`)
  } catch { /* column already exists */ }

  try {
    getDb().exec(`ALTER TABLE deployments ADD COLUMN is_preview INTEGER NOT NULL DEFAULT 0`)
  } catch { /* column already exists */ }

  try {
    getDb().exec(`ALTER TABLE deployments ADD COLUMN clone_duration_ms INTEGER`)
  } catch { /* column already exists */ }

  try {
    getDb().exec(`ALTER TABLE deployments ADD COLUMN build_duration_ms INTEGER`)
  } catch { /* column already exists */ }

  try {
    getDb().exec(`ALTER TABLE deployments ADD COLUMN deploy_duration_ms INTEGER`)
  } catch { /* column already exists */ }

  try {
    getDb().exec(`ALTER TABLE deployments ADD COLUMN total_duration_ms INTEGER`)
  } catch { /* column already exists */ }

  try {
    getDb().exec(`ALTER TABLE deployments ADD COLUMN last_failure_at TEXT`)
  } catch { /* column already exists */ }

  try {
    getDb().exec(`ALTER TABLE deployments ADD COLUMN last_failure_stage TEXT`)
  } catch { /* column already exists */ }

  try {
    getDb().exec(`ALTER TABLE deployments ADD COLUMN detected_language TEXT`)
  } catch { /* column already exists */ }

  try {
    getDb().exec(`ALTER TABLE deployments ADD COLUMN detected_framework TEXT`)
  } catch { /* column already exists */ }

  try {
    getDb().exec(`ALTER TABLE deployments ADD COLUMN detected_start_command TEXT`)
  } catch { /* column already exists */ }
}

// ── Deployment queries ────────────────────────────────────────────────────────

export function createDeployment(
  id: string,
  name: string,
  sourceUrl: string | null,
  envVars: Record<string, string> = {},
  secretEnvVars: Record<string, string> = {},
  branch = 'main',
  addons: Addon[] = [],
  metadata: {
    sourceSha?: string | null
    sourceMessage?: string | null
    prNumber?: number | null
    prUrl?: string | null
    prBaseBranch?: string | null
    isPreview?: boolean
  } = {},
): Deployment {
  const now = new Date().toISOString()
  getDb()
    .prepare(
      `INSERT INTO deployments (
         id, name, source_url, branch, source_sha, source_message, pr_number, pr_url, pr_base_branch, is_preview,
         status, env_vars, secret_env_vars, addons, created_at, updated_at
       )
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?, ?)`,
    )
    .run(
      id,
      name,
      sourceUrl,
      branch,
      metadata.sourceSha ?? null,
      metadata.sourceMessage ?? null,
      metadata.prNumber ?? null,
      metadata.prUrl ?? null,
      metadata.prBaseBranch ?? null,
      metadata.isPreview ? 1 : 0,
      JSON.stringify(envVars),
      JSON.stringify(secretEnvVars),
      JSON.stringify(addons),
      now,
      now,
    )
  return getDeployment(id)!
}

export function listDeployments(): Deployment[] {
  return getDb()
    .prepare('SELECT * FROM deployments ORDER BY created_at DESC')
    .all() as Deployment[]
}

export function getDeployment(id: string): Deployment | undefined {
  return getDb()
    .prepare('SELECT * FROM deployments WHERE id = ?')
    .get(id) as Deployment | undefined
}

export function findDeploymentBySourceAndBranch(
  sourceUrl: string,
  branch: string,
): Deployment | undefined {
  return getDb()
    .prepare('SELECT * FROM deployments WHERE source_url = ? AND branch = ? AND is_preview = 0 ORDER BY created_at DESC LIMIT 1')
    .get(sourceUrl, branch) as Deployment | undefined
}

export function findPreviewDeploymentByRepoAndPr(
  sourceUrl: string,
  prNumber: number,
): Deployment | undefined {
  return getDb()
    .prepare('SELECT * FROM deployments WHERE source_url = ? AND pr_number = ? AND is_preview = 1 ORDER BY created_at DESC LIMIT 1')
    .get(sourceUrl, prNumber) as Deployment | undefined
}

export function updateDeployment(
  id: string,
  patch: Partial<Omit<Deployment, 'id' | 'created_at'>>,
): void {
  const now = new Date().toISOString()
  const fields = { ...patch, updated_at: now }
  const sets = Object.keys(fields).map((k) => `${k} = ?`).join(', ')
  getDb()
    .prepare(`UPDATE deployments SET ${sets} WHERE id = ?`)
    .run(...Object.values(fields), id)
}

export function deleteDeployment(id: string): void {
  getDb().prepare('DELETE FROM deployments WHERE id = ?').run(id)
}

// ── Log queries ───────────────────────────────────────────────────────────────

export function insertLog(
  deploymentId: string,
  stream: LogLine['stream'],
  message: string,
): void {
  getDb()
    .prepare(
      `INSERT INTO log_lines (deployment_id, stream, message, created_at)
       VALUES (?, ?, ?, ?)`,
    )
    .run(deploymentId, stream, message, new Date().toISOString())
}

export function getLogs(deploymentId: string): LogLine[] {
  return getDb()
    .prepare('SELECT * FROM log_lines WHERE deployment_id = ? ORDER BY id')
    .all(deploymentId) as LogLine[]
}

export function insertDeploymentEvent(
  deploymentId: string,
  type: DeploymentEventType,
  message: string,
  metadata: Record<string, string | number | boolean | null> = {},
): void {
  getDb()
    .prepare(
      `INSERT INTO deployment_events (deployment_id, type, message, metadata, created_at)
       VALUES (?, ?, ?, ?, ?)`,
    )
    .run(
      deploymentId,
      type,
      message,
      JSON.stringify(metadata),
      new Date().toISOString(),
    )
}

export function getDeploymentEvents(deploymentId: string): DeploymentEvent[] {
  return getDb()
    .prepare('SELECT * FROM deployment_events WHERE deployment_id = ? ORDER BY id')
    .all(deploymentId) as DeploymentEvent[]
}

export function listRecentDeploymentEvents(limit = 60): DeploymentEvent[] {
  return getDb()
    .prepare(
      `SELECT * FROM deployment_events
       ORDER BY id DESC
       LIMIT ?`,
    )
    .all(limit) as DeploymentEvent[]
}

export function insertDeploymentHealthCheck(
  deploymentId: string,
  ok: boolean,
  latencyMs: number | null,
): void {
  getDb()
    .prepare(
      `INSERT INTO deployment_health_checks (deployment_id, ok, latency_ms, created_at)
       VALUES (?, ?, ?, ?)`,
    )
    .run(deploymentId, ok ? 1 : 0, latencyMs, new Date().toISOString())
}

export function getDeploymentHealthChecks(deploymentId: string, limit = 24): DeploymentHealthCheck[] {
  return getDb()
    .prepare(
      `SELECT * FROM deployment_health_checks
       WHERE deployment_id = ?
       ORDER BY id DESC
       LIMIT ?`,
    )
    .all(deploymentId, limit) as DeploymentHealthCheck[]
}

export function insertDeploymentMetricSample(
  deploymentId: string,
  sample: {
    cpuPct: number | null
    memoryUsedBytes: number | null
    memoryLimitBytes: number | null
    networkRxBytes: number | null
    networkTxBytes: number | null
  },
): void {
  getDb()
    .prepare(
      `INSERT INTO deployment_metric_samples (
         deployment_id, cpu_pct, memory_used_bytes, memory_limit_bytes,
         network_rx_bytes, network_tx_bytes, created_at
       )
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      deploymentId,
      sample.cpuPct,
      sample.memoryUsedBytes,
      sample.memoryLimitBytes,
      sample.networkRxBytes,
      sample.networkTxBytes,
      new Date().toISOString(),
    )
}

export function getDeploymentMetricSamples(deploymentId: string, limit = 40): DeploymentMetricSample[] {
  return getDb()
    .prepare(
      `SELECT * FROM deployment_metric_samples
       WHERE deployment_id = ?
       ORDER BY id DESC
       LIMIT ?`,
    )
    .all(deploymentId, limit) as DeploymentMetricSample[]
}
