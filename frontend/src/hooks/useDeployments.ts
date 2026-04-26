import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, type Deployment } from '../api/client'

export const DEPLOYMENTS_KEY = ['deployments'] as const

export function useDeployments() {
  return useQuery({
    queryKey: DEPLOYMENTS_KEY,
    queryFn: api.deployments.list,
    refetchInterval: 3_000,
  })
}

export function useCreateDeployment() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: api.deployments.create,
    onSuccess: (created) => {
      qc.setQueryData<Deployment[]>(DEPLOYMENTS_KEY, (prev = []) => [created, ...prev])
    },
  })
}

export function useRedeployment() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, envVars }: { id: string; envVars?: Record<string, string> }) =>
      api.deployments.redeploy(id, envVars),
    onSuccess: (updated) => {
      qc.setQueryData<Deployment[]>(DEPLOYMENTS_KEY, (prev = []) =>
        prev.map((d) => (d.id === updated.id ? updated : d)),
      )
    },
  })
}

export function useDeleteDeployment() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: api.deployments.remove,
    onMutate: (id) => {
      qc.setQueryData<Deployment[]>(DEPLOYMENTS_KEY, (prev = []) =>
        prev.filter((d) => d.id !== id),
      )
    },
  })
}
