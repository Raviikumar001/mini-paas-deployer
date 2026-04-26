const CADDY_ADMIN = process.env.CADDY_ADMIN ?? 'http://localhost:2019'

const HEADERS = {
  'Content-Type': 'application/json',
  'Origin': CADDY_ADMIN,
}

async function caddyPost(path: string, body: unknown): Promise<void> {
  const res = await fetch(`${CADDY_ADMIN}${path}`, {
    method: 'POST',
    headers: HEADERS,
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Caddy POST ${path} failed (${res.status}): ${text}`)
  }
}

async function caddyDelete(path: string): Promise<void> {
  const res = await fetch(`${CADDY_ADMIN}${path}`, {
    method: 'DELETE',
    headers: { 'Origin': CADDY_ADMIN },
  })
  if (!res.ok && res.status !== 404) {
    const text = await res.text()
    throw new Error(`Caddy DELETE ${path} failed (${res.status}): ${text}`)
  }
}

// ── addRoute ─────────────────────────────────────────────────────────────────
// Subdomain routing: each deployment gets its own hostname (<id>.localhost).
// The app is served at the domain root — no path stripping, no basePath
// required, client-side navigation and all asset paths work out of the box.

export async function addRoute(
  deploymentId: string,
  containerName: string,
  port: number,
): Promise<void> {
  const route = {
    '@id': `dep-${deploymentId}`,
    match: [{ host: [`${deploymentId}.localhost`] }],
    handle: [
      { handler: 'reverse_proxy', upstreams: [{ dial: `${containerName}:${port}` }] },
    ],
  }

  await caddyPost('/config/apps/http/servers/srv0/routes', route)
}

// ── removeRoute ───────────────────────────────────────────────────────────────

export async function removeRoute(deploymentId: string): Promise<void> {
  await caddyDelete(`/id/dep-${deploymentId}`)
}
