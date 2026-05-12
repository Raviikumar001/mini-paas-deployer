import { useState, useEffect, type CSSProperties } from 'react'
import { ExternalLink, RotateCcw, Trash2, ChevronDown, ChevronUp, Eye, EyeOff } from 'lucide-react'
import type { Deployment, DeploymentStatus } from '../api/client'
import { useDeleteDeployment, useRedeployment } from '../hooks/useDeployments'
import { LogPanel } from './LogPanel'

const ACTIVE = new Set<DeploymentStatus>(['pending', 'building', 'deploying', 'redeploying'])
type EnvEntry = { key: string; value: string | null; kind: 'plain' | 'secret' | 'injected' }

const STATUS_CONFIG: Record<DeploymentStatus, {
  label: string; color: string; bg: string; dot: string; pulse: boolean
}> = {
  pending:     { label: 'PENDING',     color: 'var(--text-muted)',  bg: 'rgba(82,80,77,0.12)',       dot: 'var(--text-muted)',  pulse: false },
  building:    { label: 'BUILDING',    color: 'var(--warning)',     bg: 'rgba(245,166,35,0.10)',     dot: 'var(--warning)',     pulse: true  },
  deploying:   { label: 'DEPLOYING',   color: '#60a5fa',            bg: 'rgba(96,165,250,0.10)',     dot: '#60a5fa',            pulse: true  },
  running:     { label: 'LIVE',        color: 'var(--success)',     bg: 'rgba(62,207,142,0.10)',     dot: 'var(--success)',     pulse: false },
  redeploying: { label: 'REDEPLOYING', color: '#a78bfa',            bg: 'rgba(167,139,250,0.10)',    dot: '#a78bfa',            pulse: true  },
  failed:      { label: 'FAILED',      color: 'var(--danger)',      bg: 'rgba(245,101,101,0.10)',    dot: 'var(--danger)',      pulse: false },
  stopped:     { label: 'STOPPED',     color: 'var(--text-muted)',  bg: 'rgba(82,80,77,0.08)',       dot: 'var(--text-muted)',  pulse: false },
}

function timeAgo(iso: string): string {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (s < 60)    return `${s}s ago`
  if (s < 3600)  return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  return `${Math.floor(s / 86400)}d ago`
}

function repoLabel(url: string | null): string {
  if (!url) return ''
  try { return new URL(url).pathname.replace(/^\//, '').replace(/\.git$/, '') }
  catch { return url }
}

interface Props { deployment: Deployment }
type Tab = 'logs' | 'env'

export function DeploymentRow({ deployment: dep }: Props) {
  const [expanded, setExpanded] = useState(() => ACTIVE.has(dep.status))
  const [tab, setTab] = useState<Tab>('logs')
  const [hovered, setHovered] = useState(false)
  const { mutate: remove, isPending: removing } = useDeleteDeployment()
  const { mutate: redeploy, isPending: redeploying } = useRedeployment()

  useEffect(() => {
    if (ACTIVE.has(dep.status)) { setExpanded(true); setTab('logs') }
  }, [dep.status])

  const canRedeploy = dep.status === 'running' || dep.status === 'failed' || dep.status === 'stopped'
  const canOpen = (dep.status === 'running' || dep.status === 'redeploying') && dep.url
  const cfg = STATUS_CONFIG[dep.status]
  const addonStatuses = dep.addon_statuses ?? []

  let envEntries: EnvEntry[] = []
  try {
    envEntries = Object.entries(JSON.parse(dep.env_vars || '{}')).map(([key, value]) => ({
      key,
      value: String(value),
      kind: 'plain',
    }))
  } catch { /* */ }

  let addonEntries: EnvEntry[] = []
  try {
    const id = dep.id.toLowerCase().replace(/[^a-z0-9]/g, '')
    if (addonStatuses.some((a) => a.type === 'postgres')) {
      addonEntries.push({
        key: 'DATABASE_URL',
        value: `postgres://brimble:brimble@dep-${id}-db:5432/brimble`,
        kind: 'injected',
      })
    }
    if (addonStatuses.some((a) => a.type === 'redis')) {
      addonEntries.push({
        key: 'REDIS_URL',
        value: `redis://dep-${id}-redis:6379`,
        kind: 'injected',
      })
    }
  } catch { /* */ }

  const secretEntries = (dep.secret_env_keys ?? []).map((key) => ({ key, value: null, kind: 'secret' as const }))
  const allEnvEntries = [...addonEntries, ...envEntries, ...secretEntries]

  return (
    <div
      style={{
        ...cardStyle,
        borderColor: hovered ? 'var(--border-default)' : 'var(--border-subtle)',
        transform: hovered ? 'translateY(-1px)' : 'translateY(0)',
      } as CSSProperties}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div
        style={headerStyle}
        onClick={() => setExpanded((v) => !v)}
        role="button"
        aria-expanded={expanded}
      >
        {/* Left: dot + name + meta */}
        <div style={{ alignItems: 'center', display: 'flex', flex: 1, gap: 10, minWidth: 0 }}>
          {/* Status dot */}
          <span
            className={cfg.pulse ? 'pulse-dot' : undefined}
            style={{ ...dotStyle, background: cfg.dot as string }}
          />

          {/* Name + meta */}
          <div style={{ minWidth: 0 }}>
            <div style={{ alignItems: 'center', display: 'flex', gap: 8 }}>
              <span style={{
                ...nameStyle,
                color: hovered ? 'var(--accent)' : 'var(--text-primary)',
              } as CSSProperties}>
                {dep.name}
              </span>
              {dep.branch && dep.branch !== 'main' && (
                <span style={branchBadgeStyle}>{dep.branch}</span>
              )}
              {addonStatuses.map((addon) => (
                <span
                  key={addon.type}
                  style={addon.type === 'postgres' ? pgAddonBadgeStyle : redisAddonBadgeStyle}
                  title={`${addon.connectionEnv} ${addon.status}${addon.persistent ? ', persistent' : ''}`}
                >
                  {addon.type === 'postgres' ? 'PG' : 'RD'}
                  <span style={{
                    ...addonStatusDotStyle,
                    background: addon.status === 'running' ? 'var(--success)' : 'var(--text-muted)',
                  } as CSSProperties} />
                </span>
              ))}
              {dep.status === 'redeploying' && (
                <span style={rebuildBadgeStyle}>
                  <span className="pulse-dot" style={{ ...dotStyle, background: '#a78bfa', height: 5, width: 5 }} />
                  rebuilding
                </span>
              )}
            </div>
            <div style={metaStyle}>
              <span style={{ color: 'var(--text-muted)' as string }}>{repoLabel(dep.source_url)}</span>
              <span style={{ color: 'var(--border-subtle)' as string }}>·</span>
              <span>{timeAgo(dep.created_at)}</span>
              {dep.error && (
                <span style={{ color: 'var(--danger)' as string }} title={dep.error}>
                  — {dep.error.slice(0, 52)}{dep.error.length > 52 ? '…' : ''}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Right: status badge + actions */}
        <div
          style={{ alignItems: 'center', display: 'flex', flexShrink: 0, gap: 6 }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Status badge */}
          <span style={{ ...statusBadgeStyle, background: cfg.bg as string, color: cfg.color as string }}>
            {cfg.label}
          </span>

          {canOpen && (
            <a href={dep.url!} target="_blank" rel="noopener noreferrer" style={openLinkStyle}>
              <ExternalLink size={12} />
              Open
            </a>
          )}
          {canRedeploy && (
            <button
              disabled={redeploying}
              onClick={() => redeploy({ id: dep.id })}
              style={{ ...iconBtnStyle, opacity: redeploying ? 0.4 : 1 }}
              title="Redeploy"
            >
              <RotateCcw size={12} />
            </button>
          )}
          <button style={iconBtnStyle} onClick={() => setExpanded((v) => !v)}>
            {expanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
          </button>
          <button
            disabled={removing}
            onClick={() => remove(dep.id)}
            style={{ ...iconBtnStyle, opacity: removing ? 0.4 : 1 }}
            title="Delete"
          >
            <Trash2 size={12} />
          </button>
        </div>
      </div>

      {/* ── Expanded ─────────────────────────────────────────────────────────── */}
      {expanded && (
        <>
          <div style={tabBarStyle}>
            {(['logs', 'env'] as Tab[]).map((t) => (
              <button
                key={t}
                style={{
                  ...tabStyle,
                  ...(tab === t ? tabActiveStyle : {}),
                } as CSSProperties}
                onClick={(e) => { e.stopPropagation(); setTab(t) }}
              >
                {t === 'logs' ? 'Logs' : 'Environment'}
                {t === 'env' && allEnvEntries.length > 0 && (
                  <span style={tabBadgeStyle}>{allEnvEntries.length}</span>
                )}
              </button>
            ))}
          </div>

          {tab === 'logs' && <LogPanel deploymentId={dep.id} />}
          {tab === 'env' && (
            <div style={envPanelStyle}>
              {allEnvEntries.length === 0 ? (
                <span style={{ color: 'var(--text-muted)' as string, fontSize: 12 }}>
                  No environment variables.
                </span>
              ) : (
                <table style={{ borderCollapse: 'collapse', width: '100%' }}>
                  <tbody>
                    {allEnvEntries.map((entry) => (
                      <tr key={`${entry.kind}-${entry.key}`} style={{ borderBottom: '0.5px solid var(--border-subtle)' as string }}>
                        <td style={envKeyStyle}>
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                            {entry.key}
                            {entry.kind === 'injected' && (() => {
                              const addon = addonStatuses.find((a) => a.connectionEnv === entry.key)
                              return (
                                <>
                                  <span style={injectedBadgeStyle}>injected</span>
                                  {addon && (
                                    <span style={addon.status === 'running' ? addonRunningBadgeStyle : addonStoppedBadgeStyle}>
                                      {addon.status}{addon.persistent ? ' / disk' : ''}
                                    </span>
                                  )}
                                </>
                              )
                            })()}
                            {entry.kind === 'secret' && (
                              <span style={secretBadgeStyle}>secret</span>
                            )}
                          </span>
                        </td>
                        <td style={envValStyle}>
                          {entry.kind === 'secret'
                            ? <SecretValue />
                            : <EnvValue value={entry.value ?? ''} />}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}

function SecretValue() {
  return (
    <span style={{ alignItems: 'center', display: 'inline-flex', gap: 6 }}>
      <span style={{ color: 'var(--text-muted)' as string, letterSpacing: 2 }}>••••••••••••</span>
      <EyeOff size={11} color="var(--text-muted)" />
    </span>
  )
}

function EnvValue({ value }: { value: string }) {
  const [revealed, setRevealed] = useState(false)
  return (
    <span
      style={{ alignItems: 'center', cursor: 'pointer', display: 'inline-flex', gap: 6 }}
      onClick={() => setRevealed((v) => !v)}
    >
      {revealed
        ? <span style={{ color: 'var(--success)' as string, fontFamily: 'var(--font-mono)', userSelect: 'text' as const }}>{value}</span>
        : <span style={{ color: 'var(--text-muted)' as string, letterSpacing: 2 }}>{'●'.repeat(Math.min(value.length, 12))}</span>
      }
      {revealed
        ? <EyeOff size={11} color="var(--text-muted)" />
        : <Eye size={11} color="var(--text-muted)" />
      }
    </span>
  )
}

// ── Styles ────────────────────────────────────────────────────────────────────

const cardStyle: CSSProperties = {
  background: 'var(--bg-surface)' as string,
  border: '0.5px solid',
  borderRadius: 10,
  overflow: 'hidden',
  transition: 'border-color 0.15s ease, transform 0.15s ease',
}

const headerStyle: CSSProperties = {
  alignItems: 'center',
  cursor: 'pointer',
  display: 'flex',
  gap: 10,
  padding: '13px 16px',
  userSelect: 'none',
}

const dotStyle: CSSProperties = {
  borderRadius: '50%',
  display: 'inline-block',
  flexShrink: 0,
  height: 7,
  width: 7,
}

const nameStyle: CSSProperties = {
  fontSize: 14,
  fontWeight: 500,
  transition: 'color 0.15s ease',
}

const metaStyle: CSSProperties = {
  alignItems: 'center',
  color: 'var(--text-secondary)' as string,
  display: 'flex',
  fontSize: 12,
  fontFamily: 'var(--font-mono)' as string,
  gap: 5,
  marginTop: 3,
}

const branchBadgeStyle: CSSProperties = {
  alignItems: 'center',
  background: 'rgba(96,165,250,0.1)',
  border: '0.5px solid rgba(96,165,250,0.2)',
  borderRadius: 4,
  color: '#60a5fa',
  display: 'inline-flex',
  fontFamily: 'var(--font-mono)' as string,
  fontSize: 10,
  fontWeight: 500,
  gap: 5,
  padding: '2px 7px',
}

const pgAddonBadgeStyle: CSSProperties = {
  alignItems: 'center',
  background: 'rgba(62,207,142,0.1)',
  border: '0.5px solid rgba(62,207,142,0.2)',
  borderRadius: 4,
  color: 'var(--success)',
  display: 'inline-flex',
  fontFamily: 'var(--font-mono)' as string,
  fontSize: 10,
  fontWeight: 500,
  gap: 5,
  padding: '2px 7px',
}

const redisAddonBadgeStyle: CSSProperties = {
  alignItems: 'center',
  background: 'rgba(245,166,35,0.1)',
  border: '0.5px solid rgba(245,166,35,0.2)',
  borderRadius: 4,
  color: 'var(--warning)',
  display: 'inline-flex',
  fontFamily: 'var(--font-mono)' as string,
  fontSize: 10,
  fontWeight: 500,
  gap: 5,
  padding: '2px 7px',
}

const addonStatusDotStyle: CSSProperties = {
  borderRadius: '50%',
  display: 'inline-block',
  height: 5,
  width: 5,
}

const rebuildBadgeStyle: CSSProperties = {
  alignItems: 'center',
  background: 'rgba(167,139,250,0.1)',
  border: '0.5px solid rgba(167,139,250,0.2)',
  borderRadius: 4,
  color: '#a78bfa',
  display: 'inline-flex',
  fontFamily: 'var(--font-mono)' as string,
  fontSize: 10,
  fontWeight: 500,
  gap: 5,
  padding: '2px 7px',
}

const statusBadgeStyle: CSSProperties = {
  borderRadius: 4,
  fontFamily: 'var(--font-mono)' as string,
  fontSize: 10,
  fontWeight: 500,
  letterSpacing: '0.06em',
  padding: '3px 8px',
}

const openLinkStyle: CSSProperties = {
  alignItems: 'center',
  background: 'rgba(62,207,142,0.08)',
  border: '0.5px solid rgba(62,207,142,0.2)',
  borderRadius: 6,
  color: 'var(--success)' as string,
  display: 'inline-flex',
  fontFamily: 'var(--font-mono)' as string,
  fontSize: 11,
  gap: 5,
  padding: '4px 10px',
  textDecoration: 'none',
}

const iconBtnStyle: CSSProperties = {
  alignItems: 'center',
  background: 'none',
  border: '0.5px solid var(--border-subtle)' as string,
  borderRadius: 6,
  color: 'var(--text-muted)' as string,
  cursor: 'pointer',
  display: 'flex',
  padding: '5px 8px',
  transition: 'color 0.1s, border-color 0.1s',
}

const tabBarStyle: CSSProperties = {
  borderBottom: '0.5px solid var(--border-subtle)' as string,
  borderTop: '0.5px solid var(--border-subtle)' as string,
  display: 'flex',
  padding: '0 12px',
}

const tabStyle: CSSProperties = {
  alignItems: 'center',
  background: 'none',
  border: 'none',
  borderBottom: '2px solid transparent',
  color: 'var(--text-muted)' as string,
  cursor: 'pointer',
  display: 'flex',
  fontFamily: 'var(--font-body)' as string,
  fontSize: 12,
  fontWeight: 500,
  gap: 6,
  marginBottom: -1,
  padding: '9px 10px',
  transition: 'color 0.1s',
}

const tabActiveStyle: CSSProperties = {
  borderBottomColor: 'var(--accent)' as string,
  color: 'var(--text-primary)' as string,
}

const tabBadgeStyle: CSSProperties = {
  background: 'var(--bg-raised)' as string,
  borderRadius: 9,
  color: 'var(--text-muted)' as string,
  fontFamily: 'var(--font-mono)' as string,
  fontSize: 10,
  padding: '1px 6px',
}

const envPanelStyle: CSSProperties = {
  background: 'var(--bg-base)' as string,
  fontFamily: 'var(--font-mono)' as string,
  fontSize: 12,
  maxHeight: 260,
  overflowY: 'auto',
  padding: '4px 0',
}

const envKeyStyle: CSSProperties = {
  color: 'var(--text-muted)' as string,
  padding: '8px 16px',
  width: '38%',
}

const injectedBadgeStyle: CSSProperties = {
  background: 'rgba(62,207,142,0.1)',
  border: '0.5px solid rgba(62,207,142,0.2)',
  borderRadius: 3,
  color: 'var(--success)' as string,
  fontFamily: 'var(--font-mono)' as string,
  fontSize: 9,
  fontWeight: 500,
  padding: '1px 4px',
}

const addonRunningBadgeStyle: CSSProperties = {
  background: 'rgba(62,207,142,0.1)',
  border: '0.5px solid rgba(62,207,142,0.2)',
  borderRadius: 3,
  color: 'var(--success)' as string,
  fontFamily: 'var(--font-mono)' as string,
  fontSize: 9,
  fontWeight: 500,
  padding: '1px 4px',
}

const addonStoppedBadgeStyle: CSSProperties = {
  background: 'rgba(82,80,77,0.1)',
  border: '0.5px solid var(--border-subtle)' as string,
  borderRadius: 3,
  color: 'var(--text-muted)' as string,
  fontFamily: 'var(--font-mono)' as string,
  fontSize: 9,
  fontWeight: 500,
  padding: '1px 4px',
}

const secretBadgeStyle: CSSProperties = {
  background: 'rgba(232,255,71,0.08)',
  border: '0.5px solid rgba(232,255,71,0.18)',
  borderRadius: 3,
  color: 'var(--accent)' as string,
  fontFamily: 'var(--font-mono)' as string,
  fontSize: 9,
  fontWeight: 500,
  padding: '1px 4px',
}

const envValStyle: CSSProperties = {
  padding: '8px 16px 8px 0',
}
