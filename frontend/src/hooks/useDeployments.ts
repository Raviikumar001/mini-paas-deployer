import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, type Deployment } from '../api/client'

export const DEPLOYMENTS_KEY = ['deployments'] as const

export function useDeployments() {
  return useQuery({
    queryKey: DEPLOYMENTS_KEY,
    queryFn: api.deployments.list,
    refetchInterval: 3_000, // catch status changes that arrive between SSE events
  })
}

export function useCreateDeployment() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: api.deployments.create,
    onSuccess: (created) => {
      // Optimistically prepend so the row appears instantly
      qc.setQueryData<Deployment[]>(DEPLOYMENTS_KEY, (prev = []) => [created, ...prev])
    },
  })
}

export function useDeleteDeployment() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: api.deployments.remove,
    onMutate: (id) => {
      // Optimistic removal — row disappears before the server responds
      qc.setQueryData<Deployment[]>(DEPLOYMENTS_KEY, (prev = []) =>
        prev.filter((d) => d.id !== id),
      )
    },
  })
}
