import type { Deployment } from '../api/client'
import { DeploymentRow } from './DeploymentRow'

interface Props { deployments: Deployment[] }

export function DeploymentList({ deployments }: Props) {
  if (deployments.length === 0) {
    return (
      <div style={{
        border: '1px dashed #1a1a1a',
        borderRadius: 10,
        color: '#3a3a3a',
        fontSize: 13,
        padding: '56px 0',
        textAlign: 'center',
      }}>
        No deployments yet — paste a Git URL above to get started.
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {deployments.map((dep) => (
        <DeploymentRow key={dep.id} deployment={dep} />
      ))}
    </div>
  )
}
