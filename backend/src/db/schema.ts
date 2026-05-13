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
): Deployment {
  const now = new Date().toISOString()
  getDb()
    .prepare(
      `INSERT INTO deployments (id, name, source_url, branch, status, env_vars, secret_env_vars, addons, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'pending', ?, ?, ?, ?, ?)`,
    )
    .run(
      id,
      name,
      sourceUrl,
      branch,
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
    .prepare('SELECT * FROM deployments WHERE source_url = ? AND branch = ? ORDER BY created_at DESC LIMIT 1')
    .get(sourceUrl, branch) as Deployment | undefined
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
