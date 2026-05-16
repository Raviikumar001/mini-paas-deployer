import type { CSSProperties } from 'react'
import { GitBranch, Rocket, ShieldCheck } from 'lucide-react'
import type { Deployment } from '../api/client'
import { DeploymentRow } from './DeploymentRow'

interface Props { deployments: Deployment[] }

export function DeploymentList({ deployments }: Props) {
  if (deployments.length === 0) return <EmptyState />

  return (
    <div style={listStyle}>
      {deployments.map((dep) => (
        <DeploymentRow key={dep.id} deployment={dep} />
      ))}
    </div>
  )
}

function EmptyState() {
  return (
    <div style={emptyStyle}>
      <div style={emptyIconStyle}>
        <Rocket size={24} />
      </div>
      <h3 style={emptyTitleStyle}>No services deployed</h3>
      <p style={emptyCopyStyle}>Start with a public Git repository. The platform will build it, probe it, and assign a local subdomain.</p>
      <div style={emptyStepsStyle}>
        <span style={emptyStepStyle}><GitBranch size={14} /> Git source</span>
        <span style={emptyStepStyle}><ShieldCheck size={14} /> Secret-safe env</span>
        <span style={emptyStepStyle}><Rocket size={14} /> Live URL</span>
      </div>
    </div>
  )
}

const listStyle: CSSProperties = {
  border: '1px solid var(--line)',
  display: 'grid',
}

const emptyStyle: CSSProperties = {
  alignItems: 'center',
  background: 'linear-gradient(135deg, rgba(102,124,255,0.09), transparent 48%), var(--panel)',
  border: '1px solid var(--line)',
  display: 'flex',
  flexDirection: 'column',
  justifyContent: 'center',
  minHeight: 360,
  padding: 34,
  textAlign: 'center',
}

const emptyIconStyle: CSSProperties = {
  alignItems: 'center',
  background: 'var(--ink)',
  color: 'var(--paper)',
  display: 'flex',
  height: 54,
  justifyContent: 'center',
  marginBottom: 18,
  width: 58,
}

const emptyTitleStyle: CSSProperties = {
  fontSize: 28,
  fontWeight: 600,
  letterSpacing: '-0.03em',
  marginBottom: 8,
}

const emptyCopyStyle: CSSProperties = {
  color: 'var(--ink-soft)',
  fontSize: 15,
  lineHeight: 1.5,
  maxWidth: 460,
}

const emptyStepsStyle: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 8,
  justifyContent: 'center',
  marginTop: 22,
}

const emptyStepStyle: CSSProperties = {
  alignItems: 'center',
  background: 'var(--paper)',
  border: '1px solid var(--line)',
  color: 'var(--ink-muted)',
  display: 'inline-flex',
  fontFamily: 'var(--font-mono)',
  fontSize: 11,
  fontWeight: 700,
  gap: 7,
  padding: '7px 9px',
  textTransform: 'uppercase',
}
