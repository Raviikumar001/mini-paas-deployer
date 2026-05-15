import { useQuery } from '@tanstack/react-query'
import { api } from '../api/client'

export function useWorkspaceEvents(limit = 60) {
  return useQuery({
    queryKey: ['workspace-events', limit],
    queryFn: () => api.deployments.recentEvents(limit),
    refetchInterval: 5_000,
  })
}
