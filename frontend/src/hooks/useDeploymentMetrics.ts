import { useQuery } from '@tanstack/react-query'
import { api } from '../api/client'

export function useDeploymentMetrics(deploymentId: string, enabled: boolean) {
  return useQuery({
    queryKey: ['deployment-metrics', deploymentId],
    queryFn: () => api.deployments.metrics(deploymentId),
    enabled,
    refetchInterval: enabled ? 15_000 : false,
  })
}
