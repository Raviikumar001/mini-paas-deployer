import Database from 'better-sqlite3'

export type DeploymentStatus =
  | 'pending' | 'building' | 'deploying' | 'running' | 'redeploying' | 'failed' | 'stopped'

export interface Deployment {
  id: string
  name: string
  source_url: string | null
  status: DeploymentStatus
  image_tag: string | null
  container_id: string | null
  container_name: string | null
  app_port: number
  url: string | null
  env_vars: string   // JSON-encoded Record<string, string>
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
      status         TEXT NOT NULL DEFAULT 'pending',
      image_tag      TEXT,
      container_id   TEXT,
      container_name TEXT,
      app_port       INTEGER NOT NULL DEFAULT 3000,
      url            TEXT,
      error          TEXT,
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

    CREATE INDEX IF NOT EXISTS idx_logs_deployment
      ON log_lines(deployment_id, id);
  `)

  // Non-destructive migration — adds column if this is an existing DB
  try {
    getDb().exec(`ALTER TABLE deployments ADD COLUMN env_vars TEXT NOT NULL DEFAULT '{}'`)
  } catch { /* column already exists */ }
}

// ── Deployment queries ────────────────────────────────────────────────────────

export function createDeployment(
  id: string,
  name: string,
  sourceUrl: string | null,
  envVars: Record<string, string> = {},
): Deployment {
  const now = new Date().toISOString()
  getDb()
    .prepare(
      `INSERT INTO deployments (id, name, source_url, status, env_vars, created_at, updated_at)
       VALUES (?, ?, ?, 'pending', ?, ?, ?)`,
    )
    .run(id, name, sourceUrl, JSON.stringify(envVars), now, now)
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
