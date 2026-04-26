import { useState, useEffect, type CSSProperties } from 'react'
import type { Deployment, DeploymentStatus } from '../api/client'
import { useDeleteDeployment } from '../hooks/useDeployments'
import { LogPanel } from './LogPanel'

// Statuses that mean a build/deploy is actively in progress
const ACTIVE = new Set<DeploymentStatus>(['pending', 'building', 'deploying'])

const STATUS_COLOR: Record<DeploymentStatus, string> = {
  pending:   '#6b7280',
  building:  '#f59e0b',
  deploying: '#3b82f6',
  running:   '#22c55e',
  failed:    '#ef4444',
  stopped:   '#6b7280',
}

function relativeTime(iso: string): string {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (s < 60)   return `${s}s ago`
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  return `${Math.floor(s / 3600)}h ago`
}

interface Props {
  deployment: Deployment
}

export function DeploymentRow({ deployment: dep }: Props) {
  // Auto-expand while the pipeline is running; user can toggle after
  const [expanded, setExpanded] = useState(() => ACTIVE.has(dep.status))
  const { mutate: remove, isPending: removing } = useDeleteDeployment()

  useEffect(() => {
    if (ACTIVE.has(dep.status)) setExpanded(true)
  }, [dep.status])

  const dot = STATUS_COLOR[dep.status]

  return (
    <div style={cardStyle}>
      {/* ── Meta row ──────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px' }}>
        {/* Left: name + status + meta */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ alignItems: 'center', display: 'flex', gap: 8, marginBottom: 3 }}>
            <span style={{ color: dot, fontSize: 9 }}>●</span>
            <span style={{ color: '#e5e5e5', fontSize: 13, fontWeight: 600 }}>
              {dep.name}
            </span>
            <span style={{ color: dot, fontSize: 11 }}>{dep.status}</span>
          </div>
          <div style={{ color: '#555', display: 'flex', fontSize: 11, gap: 14 }}>
            {dep.image_tag && (
              <span title="image tag" style={{ color: '#444' }}>
                {dep.image_tag}
              </span>
            )}
            <span>{relativeTime(dep.created_at)}</span>
            {dep.error && (
              <span style={{ color: '#ef4444' }} title={dep.error}>
                ⚠ error
              </span>
            )}
          </div>
        </div>

        {/* Right: actions */}
        <div style={{ alignItems: 'center', display: 'flex', flexShrink: 0, gap: 6 }}>
          {dep.status === 'running' && dep.url && (
            <a
              href={dep.url}
              rel="noopener noreferrer"
              target="_blank"
              style={linkBtnStyle}
            >
              {dep.url} ↗
            </a>
          )}
          <button onClick={() => setExpanded((v) => !v)} style={btnStyle}>
            {expanded ? '▼ logs' : '▶ logs'}
          </button>
          <button
            disabled={removing}
            onClick={() => remove(dep.id)}
            style={{ ...btnStyle, color: '#ef444466' }}
            title="remove deployment"
          >
            ✕
          </button>
        </div>
      </div>

      {/* ── Log panel (only mounted when expanded — SSE connects here) ────── */}
      {expanded && <LogPanel deploymentId={dep.id} />}
    </div>
  )
}

const cardStyle: CSSProperties = {
  background: '#111',
  border: '1px solid #1e1e1e',
  borderRadius: 6,
  overflow: 'hidden',
}

const btnStyle: CSSProperties = {
  background: 'none',
  border: '1px solid #2a2a2a',
  borderRadius: 4,
  color: '#666',
  cursor: 'pointer',
  fontFamily: 'inherit',
  fontSize: 11,
  padding: '4px 9px',
}

const linkBtnStyle: CSSProperties = {
  border: '1px solid #a3e63530',
  borderRadius: 4,
  color: '#a3e635',
  fontSize: 11,
  padding: '4px 9px',
  textDecoration: 'none',
}
