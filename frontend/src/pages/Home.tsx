import { useDeployments } from '../hooks/useDeployments'
import { DeployForm } from '../components/DeployForm'
import { DeploymentList } from '../components/DeploymentList'

export function HomePage() {
  const { data: deployments = [], error, isLoading } = useDeployments()

  return (
    <div style={{ minHeight: '100vh', background: '#080808' }}>
      {/* Top nav */}
      <nav style={navStyle}>
        <div style={{ alignItems: 'center', display: 'flex', gap: 10 }}>
          <span style={{ color: '#a3e635', fontSize: 18, fontWeight: 700, letterSpacing: -0.5 }}>
            brimble
          </span>
          <span style={{ color: '#2a2a2a', fontSize: 18 }}>|</span>
          <span style={{ color: '#555', fontSize: 13 }}>Deployments</span>
        </div>
      </nav>

      <main style={{ margin: '0 auto', maxWidth: 860, padding: '40px 20px' }}>
        <DeployForm />

        <div style={sectionHeaderStyle}>
          <span>Deployments</span>
          {deployments.length > 0 && (
            <span style={{ color: '#555', fontWeight: 400 }}>{deployments.length}</span>
          )}
        </div>

        {error instanceof Error && (
          <div style={{ color: '#ef4444', fontSize: 13, marginBottom: 12 }}>
            {error.message}
          </div>
        )}

        {isLoading && deployments.length === 0 ? (
          <div style={{ color: '#444', fontSize: 13, padding: '48px 0', textAlign: 'center' }}>
            Loading…
          </div>
        ) : (
          <DeploymentList deployments={deployments} />
        )}
      </main>
    </div>
  )
}

const navStyle: React.CSSProperties = {
  alignItems: 'center',
  borderBottom: '1px solid #141414',
  display: 'flex',
  height: 52,
  padding: '0 24px',
}

const sectionHeaderStyle: React.CSSProperties = {
  alignItems: 'center',
  color: '#e2e2e2',
  display: 'flex',
  fontSize: 13,
  fontWeight: 600,
  gap: 8,
  letterSpacing: 0.1,
  marginBottom: 12,
}
