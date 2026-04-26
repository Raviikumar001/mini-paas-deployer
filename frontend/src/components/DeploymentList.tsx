import type { Deployment } from '../api/client'
import { DeploymentRow } from './DeploymentRow'

interface Props {
  deployments: Deployment[]
}

export function DeploymentList({ deployments }: Props) {
  if (deployments.length === 0) {
    return (
      <div style={{ color: '#444', fontSize: 13, padding: '40px 0', textAlign: 'center' }}>
        No deployments yet — paste a Git URL above.
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {deployments.map((dep) => (
        <DeploymentRow key={dep.id} deployment={dep} />
      ))}
    </div>
  )
}
