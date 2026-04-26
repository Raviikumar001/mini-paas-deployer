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
// subdomain is the public hostname label (e.g. "my-app-a4o0").
// deploymentId is used only as the internal @id tag for future PATCH/DELETE.

export async function addRoute(
  deploymentId: string,
  subdomain: string,
  containerName: string,
  port: number,
): Promise<void> {
  const route = {
    '@id': `dep-${deploymentId}`,
    match: [{ host: [`${subdomain}.localhost`] }],
    handle: [
      { handler: 'reverse_proxy', upstreams: [{ dial: `${containerName}:${port}` }] },
    ],
  }

  await caddyPost('/config/apps/http/servers/srv0/routes', route)
}

// ── updateRoute ───────────────────────────────────────────────────────────────
// Swaps the upstream dial address of an existing route.
// We target only the dial string rather than replacing the whole route object —
// replacing the route via PUT /id/<tag> causes Caddy to see a duplicate @id
// (old index entry + new object both carry the same tag during validation).

export async function updateRoute(
  deploymentId: string,
  containerName: string,
  port: number,
): Promise<void> {
  const res = await fetch(
    `${CADDY_ADMIN}/id/dep-${deploymentId}/handle/0/upstreams/0/dial`,
    {
      method: 'PATCH',
      headers: HEADERS,
      body: JSON.stringify(`${containerName}:${port}`),
    },
  )

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Caddy updateRoute failed (${res.status}): ${text}`)
  }
}

// ── removeRoute ───────────────────────────────────────────────────────────────

export async function removeRoute(deploymentId: string): Promise<void> {
  await caddyDelete(`/id/dep-${deploymentId}`)
}
