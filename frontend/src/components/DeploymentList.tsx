import { useState, useEffect, type CSSProperties } from 'react'
import type { Deployment } from '../api/client'
import { DeploymentRow } from './DeploymentRow'

// ── Animated empty state ──────────────────────────────────────────────────────

function EmptyState() {
  const [text, setText] = useState('')
  const [done, setDone] = useState(false)
  const message = 'No deployments yet.'

  useEffect(() => {
    if (done) return
    let i = 0
    const t = setInterval(() => {
      i++
      setText(message.slice(0, i))
      if (i >= message.length) { clearInterval(t); setDone(true) }
    }, 55)
    return () => clearInterval(t)
  }, [done])

  return (
    <div style={emptyWrapStyle}>
      <div style={emptyInnerStyle}>
        <div style={{ alignItems: 'center', display: 'flex', gap: 0, marginBottom: 10 }}>
          <span style={emptyTextStyle}>{text}</span>
          {!done && <span style={cursorStyle} />}
        </div>
        <p style={emptySubStyle}>
          Paste a public Git URL above and hit Deploy to get started.
        </p>
      </div>
    </div>
  )
}

// ── List ──────────────────────────────────────────────────────────────────────

interface Props { deployments: Deployment[] }

export function DeploymentList({ deployments }: Props) {
  if (deployments.length === 0) return <EmptyState />

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {deployments.map((dep) => (
        <DeploymentRow key={dep.id} deployment={dep} />
      ))}
    </div>
  )
}

// ── Styles ────────────────────────────────────────────────────────────────────

const emptyWrapStyle: CSSProperties = {
  backgroundImage: 'repeating-linear-gradient(-45deg, var(--bg-stripe) 0px, var(--bg-stripe) 6px, transparent 6px, transparent 14px)',
  border: '0.5px solid var(--border-subtle)' as string,
  borderRadius: 10,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  minHeight: 220,
}

const emptyInnerStyle: CSSProperties = {
  background: 'var(--bg-surface)' as string,
  border: '0.5px solid var(--border-default)' as string,
  borderRadius: 8,
  padding: '20px 28px',
  textAlign: 'center',
}

const emptyTextStyle: CSSProperties = {
  color: 'var(--text-secondary)' as string,
  fontFamily: 'var(--font-mono)' as string,
  fontSize: 14,
  fontWeight: 500,
}

const cursorStyle: CSSProperties = {
  animation: 'blink 1s step-end infinite',
  background: 'var(--accent)' as string,
  display: 'inline-block',
  height: 16,
  marginLeft: 2,
  verticalAlign: 'text-bottom',
  width: 2,
}

const emptySubStyle: CSSProperties = {
  color: 'var(--text-muted)' as string,
  fontSize: 13,
  marginTop: 4,
}
