const CADDY_ADMIN = process.env.CADDY_ADMIN ?? 'http://localhost:2019'

// Caddy admin API: https://caddyserver.com/docs/api
// Routes are inserted at index 0 so they match before the frontend catch-all.
// Each route is tagged with @id so we can delete it by name later.

export async function addRoute(
  deploymentId: string,
  containerName: string,
  port: number,
): Promise<void> {
  const route = {
    '@id': `dep-${deploymentId}`,
    match: [{ path: [`/p/${deploymentId}/*`, `/p/${deploymentId}`] }],
    handle: [
      // Strip the /p/:id prefix before proxying so the app sees clean paths
      { handler: 'rewrite', strip_path_prefix: `/p/${deploymentId}` },
      { handler: 'reverse_proxy', upstreams: [{ dial: `${containerName}:${port}` }] },
    ],
  }

  const res = await fetch(
    `${CADDY_ADMIN}/config/apps/http/servers/srv0/routes/0`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(route),
    },
  )

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Caddy addRoute failed (${res.status}): ${text}`)
  }
}

export async function removeRoute(deploymentId: string): Promise<void> {
  const res = await fetch(
    `${CADDY_ADMIN}/id/dep-${deploymentId}`,
    { method: 'DELETE' },
  )

  // 404 means route was already gone — not an error
  if (!res.ok && res.status !== 404) {
    const text = await res.text()
    throw new Error(`Caddy removeRoute failed (${res.status}): ${text}`)
  }
}
