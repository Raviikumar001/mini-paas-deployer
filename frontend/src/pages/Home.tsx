import type { CSSProperties } from 'react'
import { Layers } from 'lucide-react'
import { useDeployments } from '../hooks/useDeployments'
import { DeployForm } from '../components/DeployForm'
import { DeploymentList } from '../components/DeploymentList'

export function HomePage() {
  const { data: deployments = [], error, isLoading } = useDeployments()

  return (
    <div style={rootStyle}>
      <main style={mainStyle}>
        <div style={contentInnerStyle}>
          <div style={pageHeaderStyle}>
            <div style={pageIconStyle}>
              <Layers size={22} color="var(--accent)" />
            </div>
            <div>
              <h1 style={pageTitleStyle}>Deployments</h1>
              <p style={pageDescStyle}>
                Manage your deployed services. Track live builds, redeploy, and spin up new deployments with ENV support.
              </p>
            </div>
          </div>

          <div style={dividerStyle} />

          <DeployForm />

          <div style={sectionLabelStyle}>
            <span>All Deployments</span>
            {deployments.length > 0 && (
              <span style={sectionCountStyle}>{deployments.length}</span>
            )}
          </div>

          {error instanceof Error && (
            <div style={{ color: 'var(--danger)' as string, fontSize: 13, marginBottom: 12 }}>
              {error.message}
            </div>
          )}

          {isLoading && deployments.length === 0 ? (
            <div style={{ color: 'var(--text-muted)' as string, fontSize: 13, padding: '48px 0', textAlign: 'center' }}>
              Loading…
            </div>
          ) : (
            <DeploymentList deployments={deployments} />
          )}
        </div>
      </main>
    </div>
  )
}

// ── Styles ────────────────────────────────────────────────────────────────────

const rootStyle: CSSProperties = {
  background: 'var(--bg-base)' as string,
  minHeight: '100vh',
}

const mainStyle: CSSProperties = {
  padding: '0 32px',
}

const contentInnerStyle: CSSProperties = {
  margin: '0 auto',
  maxWidth: 800,
  padding: '32px 0 48px',
}

const pageHeaderStyle: CSSProperties = {
  alignItems: 'flex-start',
  display: 'flex',
  gap: 20,
  marginBottom: 24,
}

const pageIconStyle: CSSProperties = {
  alignItems: 'center',
  background: 'var(--bg-raised)' as string,
  border: '0.5px solid var(--border-default)' as string,
  borderRadius: 10,
  display: 'flex',
  flexShrink: 0,
  height: 56,
  justifyContent: 'center',
  width: 56,
}

const pageTitleStyle: CSSProperties = {
  color: 'var(--text-primary)' as string,
  fontSize: 20,
  fontWeight: 500,
  marginBottom: 6,
}

const pageDescStyle: CSSProperties = {
  color: 'var(--text-secondary)' as string,
  fontSize: 14,
  lineHeight: 1.6,
  maxWidth: 480,
}

const dividerStyle: CSSProperties = {
  borderTop: '0.5px solid var(--border-subtle)' as string,
  marginBottom: 24,
}

const sectionLabelStyle: CSSProperties = {
  alignItems: 'center',
  color: 'var(--text-muted)' as string,
  display: 'flex',
  fontSize: 11,
  fontFamily: 'var(--font-mono)' as string,
  fontWeight: 500,
  gap: 8,
  letterSpacing: '0.08em',
  marginBottom: 10,
  textTransform: 'uppercase',
}

const sectionCountStyle: CSSProperties = {
  background: 'var(--bg-raised)' as string,
  border: '0.5px solid var(--border-subtle)' as string,
  borderRadius: 9,
  color: 'var(--text-muted)' as string,
  fontFamily: 'var(--font-mono)' as string,
  fontSize: 10,
  padding: '1px 7px',
}
