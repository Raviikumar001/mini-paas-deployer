import { useState, useEffect, type CSSProperties } from 'react'
import type { Deployment, DeploymentStatus } from '../api/client'
import { useDeleteDeployment, useRedeployment } from '../hooks/useDeployments'
import { LogPanel } from './LogPanel'

const ACTIVE = new Set<DeploymentStatus>(['pending', 'building', 'deploying'])

const STATUS_STYLE: Record<DeploymentStatus, CSSProperties> = {
  pending:   { background: '#1e1e1e', color: '#888' },
  building:  { background: '#2d1f00', color: '#f59e0b' },
  deploying: { background: '#0d1f3c', color: '#60a5fa' },
  running:   { background: '#0d2318', color: '#4ade80' },
  failed:    { background: '#2d0f0f', color: '#f87171' },
  stopped:   { background: '#1a1a1a', color: '#555' },
}

function timeAgo(iso: string): string {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (s < 60)   return `${s}s ago`
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  return `${Math.floor(s / 86400)}d ago`
}

function repoLabel(url: string | null): string {
  if (!url) return ''
  try {
    return new URL(url).pathname.replace(/^\//, '').replace(/\.git$/, '')
  } catch { return url }
}

interface Props { deployment: Deployment }

type Tab = 'logs' | 'env'

export function DeploymentRow({ deployment: dep }: Props) {
  const [expanded, setExpanded] = useState(() => ACTIVE.has(dep.status))
  const [tab, setTab] = useState<Tab>('logs')
  const { mutate: remove, isPending: removing } = useDeleteDeployment()
  const { mutate: redeploy, isPending: redeploying } = useRedeployment()

  useEffect(() => {
    if (ACTIVE.has(dep.status)) { setExpanded(true); setTab('logs') }
  }, [dep.status])

  const canRedeploy = dep.status === 'running' || dep.status === 'failed' || dep.status === 'stopped'
  const statusStyle = STATUS_STYLE[dep.status]

  let envEntries: [string, string][] = []
  try { envEntries = Object.entries(JSON.parse(dep.env_vars || '{}')) } catch { /* */ }

  return (
    <div style={cardStyle}>
      {/* ── Header row ──────────────────────────────────────────────────────── */}
      <div
        style={headerRowStyle}
        onClick={() => setExpanded((v) => !v)}
        role="button"
        aria-expanded={expanded}
      >
        {/* Status pill */}
        <span style={{ ...pillStyle, ...statusStyle }}>
          {dep.status.toUpperCase()}
        </span>

        {/* Name + repo */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ alignItems: 'center', display: 'flex', gap: 8 }}>
            <span style={{ color: '#e2e2e2', fontSize: 14, fontWeight: 600 }}>
              {dep.name}
            </span>
            {dep.error && (
              <span style={{ color: '#f87171', fontSize: 11 }} title={dep.error}>
                — {dep.error.slice(0, 60)}{dep.error.length > 60 ? '…' : ''}
              </span>
            )}
          </div>
          <div style={{ color: '#444', fontSize: 12, marginTop: 2 }}>
            {repoLabel(dep.source_url)}
            <span style={{ color: '#2a2a2a', margin: '0 6px' }}>·</span>
            {timeAgo(dep.created_at)}
          </div>
        </div>

        {/* Actions */}
        <div
          style={{ alignItems: 'center', display: 'flex', flexShrink: 0, gap: 6 }}
          onClick={(e) => e.stopPropagation()}
        >
          {dep.status === 'running' && dep.url && (
            <a href={dep.url} target="_blank" rel="noopener noreferrer" style={linkBtnStyle}>
              Open ↗
            </a>
          )}
          {canRedeploy && (
            <button
              disabled={redeploying}
              onClick={() => redeploy({ id: dep.id })}
              style={actionBtnStyle}
              title="Redeploy"
            >
              ↺ Redeploy
            </button>
          )}
          <button
            style={{ ...actionBtnStyle, color: '#333' }}
            onClick={() => setExpanded((v) => !v)}
            title={expanded ? 'Collapse' : 'View logs'}
          >
            {expanded ? '▲' : '▼'}
          </button>
          <button
            disabled={removing}
            onClick={() => remove(dep.id)}
            style={{ ...actionBtnStyle, color: '#442020' }}
            title="Delete"
          >
            ✕
          </button>
        </div>
      </div>

      {/* ── Expanded panel ───────────────────────────────────────────────────── */}
      {expanded && (
        <div style={{ borderTop: '1px solid #141414' }}>
          {/* Tab bar */}
          <div style={tabBarStyle}>
            <button
              style={{ ...tabStyle, ...(tab === 'logs' ? tabActiveStyle : {}) }}
              onClick={() => setTab('logs')}
            >
              Logs
            </button>
            <button
              style={{ ...tabStyle, ...(tab === 'env' ? tabActiveStyle : {}) }}
              onClick={() => setTab('env')}
            >
              Environment
              {envEntries.length > 0 && (
                <span style={tabBadgeStyle}>{envEntries.length}</span>
              )}
            </button>
          </div>

          {/* Tab content */}
          {tab === 'logs' && <LogPanel deploymentId={dep.id} />}
          {tab === 'env' && (
            <div style={envPanelStyle}>
              {envEntries.length === 0 ? (
                <span style={{ color: '#333', fontSize: 12 }}>
                  No environment variables for this deployment.
                </span>
              ) : (
                <table style={{ borderCollapse: 'collapse', width: '100%' }}>
                  <tbody>
                    {envEntries.map(([k, v]) => (
                      <tr key={k} style={{ borderBottom: '1px solid #141414' }}>
                        <td style={envKeyStyle}>{k}</td>
                        <td style={envValStyle}>
                          <EnvValue value={v} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// Mask env var values by default with reveal on hover
function EnvValue({ value }: { value: string }) {
  const [revealed, setRevealed] = useState(false)
  return (
    <span
      style={{ cursor: 'pointer', userSelect: revealed ? 'text' : 'none' }}
      title={revealed ? 'Click to hide' : 'Click to reveal'}
      onClick={() => setRevealed((v) => !v)}
    >
      {revealed
        ? <span style={{ color: '#a3e635', fontFamily: 'monospace' }}>{value}</span>
        : <span style={{ color: '#2a2a2a', letterSpacing: 2 }}>{'●'.repeat(Math.min(value.length, 12))}</span>
      }
    </span>
  )
}

// ── Styles ────────────────────────────────────────────────────────────────────

const cardStyle: CSSProperties = {
  background: '#0f0f0f',
  border: '1px solid #161616',
  borderRadius: 10,
  overflow: 'hidden',
  transition: 'border-color 0.15s',
}

const headerRowStyle: CSSProperties = {
  alignItems: 'center',
  cursor: 'pointer',
  display: 'flex',
  gap: 12,
  padding: '13px 16px',
  userSelect: 'none',
}

const pillStyle: CSSProperties = {
  borderRadius: 5,
  flexShrink: 0,
  fontSize: 10,
  fontWeight: 600,
  letterSpacing: 0.6,
  padding: '3px 8px',
}

const actionBtnStyle: CSSProperties = {
  background: 'none',
  border: '1px solid #1e1e1e',
  borderRadius: 6,
  color: '#555',
  cursor: 'pointer',
  fontFamily: 'inherit',
  fontSize: 12,
  padding: '5px 10px',
  transition: 'color 0.1s, border-color 0.1s',
}

const linkBtnStyle: CSSProperties = {
  border: '1px solid #1a3a1a',
  borderRadius: 6,
  color: '#4ade80',
  fontSize: 12,
  padding: '5px 10px',
  textDecoration: 'none',
}

const tabBarStyle: CSSProperties = {
  borderBottom: '1px solid #141414',
  display: 'flex',
  gap: 0,
  padding: '0 16px',
}

const tabStyle: CSSProperties = {
  alignItems: 'center',
  background: 'none',
  border: 'none',
  borderBottom: '2px solid transparent',
  color: '#555',
  cursor: 'pointer',
  display: 'flex',
  fontFamily: 'inherit',
  fontSize: 12,
  fontWeight: 500,
  gap: 6,
  marginBottom: -1,
  padding: '10px 14px',
  transition: 'color 0.1s',
}

const tabActiveStyle: CSSProperties = {
  borderBottomColor: '#a3e635',
  color: '#e2e2e2',
}

const tabBadgeStyle: CSSProperties = {
  background: '#1e1e1e',
  borderRadius: 9,
  color: '#666',
  fontSize: 10,
  padding: '1px 6px',
}

const envPanelStyle: CSSProperties = {
  fontFamily: "'Cascadia Code', 'Fira Code', monospace",
  fontSize: 12,
  maxHeight: 300,
  overflowY: 'auto',
  padding: '4px 0',
}

const envKeyStyle: CSSProperties = {
  color: '#888',
  padding: '8px 16px',
  width: '38%',
}

const envValStyle: CSSProperties = {
  padding: '8px 16px 8px 0',
}
