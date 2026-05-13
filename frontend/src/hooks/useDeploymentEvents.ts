import { useQuery } from '@tanstack/react-query'
import { api } from '../api/client'

export function useDeploymentEvents(deploymentId: string, enabled: boolean) {
  return useQuery({
    queryKey: ['deployment-events', deploymentId],
    queryFn: () => api.deployments.events(deploymentId),
    enabled,
    refetchInterval: enabled ? 3_000 : false,
  })
}
