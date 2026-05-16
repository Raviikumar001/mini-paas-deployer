import { useEffect, useState, type CSSProperties } from 'react'
import {
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Eye,
  EyeOff,
  GitMerge,
  RotateCcw,
  Trash2,
} from 'lucide-react'
import type { Deployment, DeploymentStatus } from '../api/client'
import { useDeleteDeployment, usePromoteDeployment, useRedeployment } from '../hooks/useDeployments'
import { DeploymentSystem } from './DeploymentSystem'
import { LogPanel } from './LogPanel'
import { DeploymentTimeline } from './DeploymentTimeline'

const ACTIVE = new Set<DeploymentStatus>(['pending', 'building', 'deploying', 'redeploying'])

type EnvEntry = {
  key: string
  value: string | null
  kind: 'plain' | 'secret' | 'injected'
}

const STATUS_CONFIG: Record<DeploymentStatus, {
  label: string
  tone: string
  dot: string
}> = {
  pending: { label: 'Pending', tone: 'var(--ink-muted)', dot: 'var(--ink-muted)' },
  building: { label: 'Building', tone: 'var(--warning)', dot: 'var(--warning)' },
  deploying: { label: 'Deploying', tone: 'var(--blue)', dot: 'var(--blue)' },
  running: { label: 'Live', tone: 'var(--success)', dot: 'var(--success)' },
  redeploying: { label: 'Redeploying', tone: 'var(--blue)', dot: 'var(--blue)' },
  failed: { label: 'Failed', tone: 'var(--danger)', dot: 'var(--danger)' },
  stopped: { label: 'Stopped', tone: 'var(--ink-muted)', dot: 'var(--ink-muted)' },
}

function timeAgo(iso: string): string {
  const seconds = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (seconds < 60) return `${seconds}s ago`
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`
  return `${Math.floor(seconds / 86400)}d ago`
}

function repoLabel(url: string | null): string {
  if (!url) return ''
  try {
    return new URL(url).pathname.replace(/^\//, '').replace(/\.git$/, '')
  } catch {
    return url
  }
}

interface Props { deployment: Deployment }
type Tab = 'overview' | 'logs' | 'env' | 'system'

export function DeploymentRow({ deployment: dep }: Props) {
  const [expanded, setExpanded] = useState(() => ACTIVE.has(dep.status))
  const [tab, setTab] = useState<Tab>('overview')
  const { mutate: remove, isPending: removing } = useDeleteDeployment()
  const { mutate: redeploy, isPending: redeploying } = useRedeployment()
  const { mutate: promote, isPending: promoting } = usePromoteDeployment()

  useEffect(() => {
    if (ACTIVE.has(dep.status)) {
      setExpanded(true)
      setTab('overview')
    }
  }, [dep.status])

  const status = STATUS_CONFIG[dep.status]
  const addonStatuses = dep.addon_statuses ?? []
  const canRedeploy = dep.status === 'running' || dep.status === 'failed' || dep.status === 'stopped'
  const canPromote = dep.is_preview === 1 && canRedeploy
  const canOpen = (dep.status === 'running' || dep.status === 'redeploying') && dep.url
  const allEnvEntries = buildEnvEntries(dep)

  return (
    <article style={rowStyle}>
      <div style={summaryStyle} onClick={() => setExpanded((value) => !value)} role="button" aria-expanded={expanded}>
        <div style={serviceStyle}>
          <span style={{ ...statusDotStyle, background: status.dot }} className={ACTIVE.has(dep.status) ? 'pulse-dot' : undefined} />
          <div style={{ minWidth: 0 }}>
            <div style={titleLineStyle}>
              <strong style={serviceNameStyle}>{dep.name}</strong>
              {dep.is_preview === 1 && <span style={previewStyle}>Preview</span>}
              {dep.branch && <span style={branchStyle}>{dep.branch}</span>}
              {dep.pr_number && <span style={prStyle}>PR #{dep.pr_number}</span>}
              {addonStatuses.map((addon) => (
                <span key={addon.type} style={addon.type === 'postgres' ? postgresBadgeStyle : redisBadgeStyle}>
                  {addon.type === 'postgres' ? 'PG' : 'RD'}
                  <span style={{
                    ...smallDotStyle,
                    background: addon.status === 'running' ? 'var(--success)' : 'var(--ink-muted)',
                  }} />
                </span>
              ))}
            </div>
            <div style={metaStyle}>
              <span>{repoLabel(dep.source_url)}</span>
              <span>/</span>
              <span>{timeAgo(dep.created_at)}</span>
              {dep.source_sha && (
                <>
                  <span>/</span>
                  <span style={shaStyle}>{dep.source_sha.slice(0, 7)}</span>
                </>
              )}
              {dep.error && <span style={errorMetaStyle}>{dep.error.slice(0, 64)}</span>}
            </div>
            {(dep.source_message || dep.pr_url) && (
              <div style={sourceLineStyle}>
                {dep.source_message && <span style={sourceMessageStyle}>{dep.source_message}</span>}
                {dep.pr_url && (
                  <a href={dep.pr_url} target="_blank" rel="noopener noreferrer" style={sourceLinkStyle}>
                    <ExternalLink size={12} />
                    View PR
                  </a>
                )}
              </div>
            )}
          </div>
        </div>

        <div style={actionsStyle} onClick={(e) => e.stopPropagation()}>
          <span style={{ ...statusBadgeStyle, color: status.tone }}>{status.label}</span>
          {canOpen && (
            <a href={dep.url!} target="_blank" rel="noopener noreferrer" style={openLinkStyle}>
              <ExternalLink size={14} />
              Open
            </a>
          )}
          {canRedeploy && (
            <button type="button" disabled={redeploying} onClick={() => redeploy({ id: dep.id })} style={iconButtonStyle} title="Redeploy">
              <RotateCcw size={15} />
            </button>
          )}
          {canPromote && (
            <button
              type="button"
              disabled={promoting}
              onClick={() => promote(dep.id)}
              style={iconButtonStyle}
              title="Promote preview to production"
            >
              <GitMerge size={15} />
            </button>
          )}
          <button type="button" onClick={() => setExpanded((value) => !value)} style={iconButtonStyle} title="Toggle details">
            {expanded ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
          </button>
          <button type="button" disabled={removing} onClick={() => remove(dep.id)} style={dangerButtonStyle} title="Delete">
            <Trash2 size={15} />
          </button>
        </div>
      </div>

      {expanded && (
        <div style={detailsStyle}>
          <div style={tabsStyle}>
            <button type="button" onClick={() => setTab('overview')} style={tab === 'overview' ? activeTabStyle : tabStyle}>
              Timeline
            </button>
            <button type="button" onClick={() => setTab('logs')} style={tab === 'logs' ? activeTabStyle : tabStyle}>Logs</button>
            <button type="button" onClick={() => setTab('env')} style={tab === 'env' ? activeTabStyle : tabStyle}>
              Environment
              {allEnvEntries.length > 0 && <span style={tabCountStyle}>{allEnvEntries.length}</span>}
            </button>
            <button type="button" onClick={() => setTab('system')} style={tab === 'system' ? activeTabStyle : tabStyle}>
              System
            </button>
          </div>

          {tab === 'overview' ? (
            <DeploymentTimeline deploymentId={dep.id} enabled={expanded} />
          ) : tab === 'logs' ? (
            <LogPanel deploymentId={dep.id} />
          ) : tab === 'system' ? (
            <DeploymentSystem deployment={dep} enabled={expanded && tab === 'system'} />
          ) : (
            <EnvironmentTable entries={allEnvEntries} addons={addonStatuses} />
          )}
        </div>
      )}
    </article>
  )
}

function buildEnvEntries(dep: Deployment): EnvEntry[] {
  const entries: EnvEntry[] = []
  const addons = dep.addon_statuses ?? []
  const id = dep.id.toLowerCase().replace(/[^a-z0-9]/g, '')

  if (addons.some((addon) => addon.type === 'postgres')) {
    entries.push({
      key: 'DATABASE_URL',
      value: `postgres://brimble:brimble@dep-${id}-db:5432/brimble`,
      kind: 'injected',
    })
  }
  if (addons.some((addon) => addon.type === 'redis')) {
    entries.push({
      key: 'REDIS_URL',
      value: `redis://dep-${id}-redis:6379`,
      kind: 'injected',
    })
  }

  try {
    for (const [key, value] of Object.entries(JSON.parse(dep.env_vars || '{}'))) {
      entries.push({ key, value: String(value), kind: 'plain' })
    }
  } catch {
    // Ignore malformed legacy env JSON in the presentation layer.
  }

  for (const key of dep.secret_env_keys ?? []) {
    entries.push({ key, value: null, kind: 'secret' })
  }

  return entries
}

function EnvironmentTable({ entries, addons }: { entries: EnvEntry[]; addons: Deployment['addon_statuses'] }) {
  if (entries.length === 0) {
    return <div style={emptyDetailStyle}>No environment variables configured.</div>
  }

  return (
    <div style={envTableStyle}>
      {entries.map((entry) => {
        const addon = addons.find((candidate) => candidate.connectionEnv === entry.key)
        return (
          <div key={`${entry.kind}-${entry.key}`} style={envRowStyle}>
            <div style={envKeyStyle}>
              {entry.key}
              {entry.kind === 'injected' && <span style={injectedStyle}>injected</span>}
              {entry.kind === 'secret' && <span style={secretStyle}>secret</span>}
              {addon && <span style={addon.status === 'running' ? runningStyle : stoppedStyle}>{addon.status}{addon.persistent ? ' / disk' : ''}</span>}
            </div>
            <div style={envValueStyle}>
              {entry.kind === 'secret' ? <SecretValue /> : <EnvValue value={entry.value ?? ''} />}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function SecretValue() {
  return (
    <span style={secretValueStyle}>
      <span>••••••••••••</span>
      <EyeOff size={13} />
    </span>
  )
}

function EnvValue({ value }: { value: string }) {
  const [revealed, setRevealed] = useState(false)
  return (
    <button type="button" onClick={() => setRevealed((current) => !current)} style={valueButtonStyle}>
      <span>{revealed ? value : '•'.repeat(Math.min(value.length || 8, 12))}</span>
      {revealed ? <EyeOff size={13} /> : <Eye size={13} />}
    </button>
  )
}

const rowStyle: CSSProperties = {
  background: 'var(--panel)',
  borderBottom: '1px solid var(--line)',
}

const summaryStyle: CSSProperties = {
  alignItems: 'center',
  cursor: 'pointer',
  display: 'flex',
  gap: 18,
  justifyContent: 'space-between',
  minHeight: 76,
  padding: '16px 18px',
}

const serviceStyle: CSSProperties = {
  alignItems: 'center',
  display: 'flex',
  gap: 13,
  minWidth: 0,
}

const statusDotStyle: CSSProperties = {
  display: 'block',
  flexShrink: 0,
  height: 8,
  width: 8,
}

const titleLineStyle: CSSProperties = {
  alignItems: 'center',
  display: 'flex',
  flexWrap: 'wrap',
  gap: 8,
}

const serviceNameStyle: CSSProperties = {
  color: 'var(--ink)',
  fontSize: 16,
  fontWeight: 600,
}

const branchStyle: CSSProperties = {
  background: 'var(--paper)',
  border: '1px solid var(--line)',
  color: 'var(--ink-muted)',
  fontFamily: 'var(--font-mono)',
  fontSize: 10,
  fontWeight: 700,
  padding: '2px 6px',
  textTransform: 'uppercase',
}

const previewStyle: CSSProperties = {
  ...branchStyle,
  background: 'var(--blue-soft)',
  borderColor: 'rgba(102,124,255,0.2)',
  color: 'var(--blue)',
}

const prStyle: CSSProperties = {
  ...branchStyle,
  background: 'rgba(255,178,79,0.16)',
  borderColor: 'rgba(184,106,0,0.2)',
  color: 'var(--warning)',
}

const metaStyle: CSSProperties = {
  alignItems: 'center',
  color: 'var(--ink-muted)',
  display: 'flex',
  flexWrap: 'wrap',
  fontFamily: 'var(--font-mono)',
  fontSize: 11,
  gap: 7,
  marginTop: 5,
}

const errorMetaStyle: CSSProperties = {
  color: 'var(--danger)',
}

const shaStyle: CSSProperties = {
  color: 'var(--ink-soft)',
}

const sourceLineStyle: CSSProperties = {
  alignItems: 'center',
  display: 'flex',
  flexWrap: 'wrap',
  gap: 10,
  marginTop: 6,
}

const sourceMessageStyle: CSSProperties = {
  color: 'var(--ink-soft)',
  fontSize: 13,
  lineHeight: 1.4,
}

const sourceLinkStyle: CSSProperties = {
  alignItems: 'center',
  color: 'var(--blue)',
  display: 'inline-flex',
  fontFamily: 'var(--font-mono)',
  fontSize: 11,
  fontWeight: 700,
  gap: 5,
  textDecoration: 'none',
  textTransform: 'uppercase',
}

const postgresBadgeStyle: CSSProperties = {
  alignItems: 'center',
  background: 'rgba(22,138,91,0.10)',
  border: '1px solid rgba(22,138,91,0.22)',
  color: 'var(--success)',
  display: 'inline-flex',
  fontFamily: 'var(--font-mono)',
  fontSize: 10,
  fontWeight: 800,
  gap: 5,
  padding: '2px 6px',
}

const redisBadgeStyle: CSSProperties = {
  ...postgresBadgeStyle,
  background: 'rgba(255,178,79,0.18)',
  borderColor: 'rgba(184,106,0,0.24)',
  color: 'var(--warning)',
}

const smallDotStyle: CSSProperties = {
  height: 5,
  width: 5,
}

const actionsStyle: CSSProperties = {
  alignItems: 'center',
  display: 'flex',
  flexShrink: 0,
  gap: 8,
}

const statusBadgeStyle: CSSProperties = {
  background: 'var(--paper)',
  border: '1px solid var(--line)',
  fontFamily: 'var(--font-mono)',
  fontSize: 11,
  fontWeight: 800,
  padding: '5px 8px',
  textTransform: 'uppercase',
}

const openLinkStyle: CSSProperties = {
  alignItems: 'center',
  background: 'var(--ink)',
  border: '1px solid var(--ink)',
  color: 'var(--paper)',
  display: 'inline-flex',
  fontFamily: 'var(--font-mono)',
  fontSize: 11,
  fontWeight: 800,
  gap: 6,
  height: 30,
  padding: '0 10px',
  textDecoration: 'none',
  textTransform: 'uppercase',
}

const iconButtonStyle: CSSProperties = {
  alignItems: 'center',
  background: 'var(--paper)',
  border: '1px solid var(--line)',
  color: 'var(--ink-muted)',
  cursor: 'pointer',
  display: 'flex',
  height: 30,
  justifyContent: 'center',
  width: 32,
}

const dangerButtonStyle: CSSProperties = {
  ...iconButtonStyle,
  color: 'var(--danger)',
}

const detailsStyle: CSSProperties = {
  borderTop: '1px solid var(--line)',
}

const tabsStyle: CSSProperties = {
  background: 'var(--paper)',
  borderBottom: '1px solid var(--line)',
  display: 'flex',
  padding: '0 14px',
}

const tabStyle: CSSProperties = {
  alignItems: 'center',
  background: 'transparent',
  border: 0,
  borderBottom: '2px solid transparent',
  color: 'var(--ink-muted)',
  cursor: 'pointer',
  display: 'inline-flex',
  fontFamily: 'var(--font-mono)',
  fontSize: 11,
  fontWeight: 800,
  gap: 7,
  marginBottom: -1,
  padding: '12px 10px',
  textTransform: 'uppercase',
}

const activeTabStyle: CSSProperties = {
  ...tabStyle,
  borderBottomColor: 'var(--blue)',
  color: 'var(--ink)',
}

const tabCountStyle: CSSProperties = {
  background: 'var(--line)',
  color: 'var(--ink-soft)',
  padding: '1px 6px',
}

const envTableStyle: CSSProperties = {
  display: 'grid',
}

const envRowStyle: CSSProperties = {
  alignItems: 'center',
  borderBottom: '1px solid var(--line)',
  display: 'grid',
  gap: 18,
  gridTemplateColumns: 'minmax(180px, 0.8fr) minmax(0, 1.2fr)',
  minHeight: 48,
  padding: '0 18px',
}

const envKeyStyle: CSSProperties = {
  alignItems: 'center',
  color: 'var(--ink-soft)',
  display: 'flex',
  flexWrap: 'wrap',
  fontFamily: 'var(--font-code)',
  fontSize: 12,
  gap: 6,
}

const envValueStyle: CSSProperties = {
  color: 'var(--ink-muted)',
  fontFamily: 'var(--font-code)',
  fontSize: 12,
  minWidth: 0,
}

const labelPillBase: CSSProperties = {
  fontFamily: 'var(--font-mono)',
  fontSize: 9,
  fontWeight: 800,
  padding: '2px 5px',
  textTransform: 'uppercase',
}

const injectedStyle: CSSProperties = {
  ...labelPillBase,
  background: 'var(--blue-soft)',
  color: 'var(--blue)',
}

const secretStyle: CSSProperties = {
  ...labelPillBase,
  background: 'var(--ink)',
  color: 'var(--paper)',
}

const runningStyle: CSSProperties = {
  ...labelPillBase,
  background: 'rgba(22,138,91,0.10)',
  color: 'var(--success)',
}

const stoppedStyle: CSSProperties = {
  ...labelPillBase,
  background: 'var(--paper)',
  color: 'var(--ink-muted)',
}

const secretValueStyle: CSSProperties = {
  alignItems: 'center',
  color: 'var(--ink-muted)',
  display: 'inline-flex',
  gap: 7,
  letterSpacing: 2,
}

const valueButtonStyle: CSSProperties = {
  alignItems: 'center',
  background: 'transparent',
  border: 0,
  color: 'var(--ink-muted)',
  cursor: 'pointer',
  display: 'inline-flex',
  fontFamily: 'var(--font-code)',
  fontSize: 12,
  gap: 7,
  minWidth: 0,
  padding: 0,
  textAlign: 'left',
}

const emptyDetailStyle: CSSProperties = {
  color: 'var(--ink-muted)',
  fontFamily: 'var(--font-mono)',
  fontSize: 12,
  padding: 18,
  textTransform: 'uppercase',
}
