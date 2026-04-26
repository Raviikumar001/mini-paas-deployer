import { useDeployments } from '../hooks/useDeployments'
import { DeployForm } from '../components/DeployForm'
import { DeploymentList } from '../components/DeploymentList'

export function HomePage() {
  const { data: deployments = [], error, isLoading } = useDeployments()

  return (
    <main style={{ margin: '0 auto', maxWidth: 900, padding: '32px 16px' }}>
      <header style={{ marginBottom: 32 }}>
        <h1 style={{ color: '#a3e635', fontSize: 14, letterSpacing: 2 }}>
          ▶ BRIMBLE DEPLOYMENTS
        </h1>
      </header>

      <DeployForm />

      <div style={{ color: '#444', fontSize: 11, letterSpacing: 1, marginBottom: 14 }}>
        DEPLOYMENTS{deployments.length > 0 ? ` (${deployments.length})` : ''}
      </div>

      {error instanceof Error && (
        <div style={{ color: '#ef4444', fontSize: 12, marginBottom: 12 }}>
          {error.message}
        </div>
      )}

      {isLoading && deployments.length === 0 ? (
        <div style={{ color: '#444', fontSize: 13 }}>Loading…</div>
      ) : (
        <DeploymentList deployments={deployments} />
      )}
    </main>
  )
}
