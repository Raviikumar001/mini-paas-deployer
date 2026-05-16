import { useEffect, useState, type CSSProperties } from 'react'
import type { Deployment } from '../api/client'
import { LogPanel } from './LogPanel'

interface Props {
  deployments: Deployment[]
}

export function WorkspaceLogs({ deployments }: Props) {
  const candidates = deployments.filter((deployment) =>
    deployment.status !== 'stopped',
  )
  const [selectedId, setSelectedId] = useState<string>(candidates[0]?.id ?? '')

  useEffect(() => {
    if (!candidates.some((deployment) => deployment.id === selectedId)) {
      setSelectedId(candidates[0]?.id ?? '')
    }
  }, [candidates, selectedId])

  if (candidates.length === 0) {
    return <div style={emptyStyle}>No deployments available for log streaming yet.</div>
  }

  const selected = candidates.find((deployment) => deployment.id === selectedId) ?? candidates[0]

  return (
    <div style={shellStyle}>
      <div style={listStyle}>
        {candidates.map((deployment) => (
          <button
            key={deployment.id}
            type="button"
            onClick={() => setSelectedId(deployment.id)}
            style={deployment.id === selected.id ? activeItemStyle : itemStyle}
          >
            <strong style={itemNameStyle}>{deployment.name}</strong>
            <span style={itemMetaStyle}>{deployment.branch ?? 'main'} / {deployment.status}</span>
          </button>
        ))}
      </div>
      <div style={panelWrapStyle}>
        <div style={headerStyle}>
          <span style={headerTitleStyle}>{selected.name}</span>
          <span style={headerMetaStyle}>{selected.branch ?? 'main'} / {selected.status}</span>
        </div>
        <LogPanel deploymentId={selected.id} />
      </div>
    </div>
  )
}

const shellStyle: CSSProperties = {
  border: '1px solid var(--line)',
  display: 'grid',
  gridTemplateColumns: '240px minmax(0, 1fr)',
  minHeight: 440,
}

const listStyle: CSSProperties = {
  borderRight: '1px solid var(--line)',
  display: 'grid',
}

const itemStyle: CSSProperties = {
  background: 'transparent',
  border: 0,
  borderBottom: '1px solid var(--line)',
  color: 'var(--ink-soft)',
  cursor: 'pointer',
  display: 'grid',
  gap: 4,
  padding: '14px 16px',
  textAlign: 'left',
}

const activeItemStyle: CSSProperties = {
  ...itemStyle,
  background: 'var(--panel)',
  color: 'var(--ink)',
}

const itemNameStyle: CSSProperties = {
  fontSize: 14,
}

const itemMetaStyle: CSSProperties = {
  fontFamily: 'var(--font-mono)',
  fontSize: 11,
  textTransform: 'uppercase',
}

const panelWrapStyle: CSSProperties = {
  minWidth: 0,
}

const headerStyle: CSSProperties = {
  alignItems: 'center',
  borderBottom: '1px solid var(--line)',
  display: 'flex',
  gap: 12,
  justifyContent: 'space-between',
  padding: '12px 16px',
}

const headerTitleStyle: CSSProperties = {
  color: 'var(--ink)',
  fontSize: 16,
  fontWeight: 600,
}

const headerMetaStyle: CSSProperties = {
  color: 'var(--ink-muted)',
  fontFamily: 'var(--font-mono)',
  fontSize: 11,
  textTransform: 'uppercase',
}

const emptyStyle: CSSProperties = {
  border: '1px solid var(--line)',
  color: 'var(--ink-muted)',
  fontFamily: 'var(--font-mono)',
  fontSize: 12,
  padding: 32,
  textAlign: 'center',
  textTransform: 'uppercase',
}
