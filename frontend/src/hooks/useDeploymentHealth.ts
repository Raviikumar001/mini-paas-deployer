import { useQuery } from '@tanstack/react-query'
import { api } from '../api/client'

export function useDeploymentHealth(deploymentId: string, enabled: boolean) {
  return useQuery({
    queryKey: ['deployment-health', deploymentId],
    queryFn: () => api.deployments.health(deploymentId),
    enabled,
    refetchInterval: enabled ? 30_000 : false,
  })
}
