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
  // 404 = already gone — not an error
  if (!res.ok && res.status !== 404) {
    const text = await res.text()
    throw new Error(`Caddy DELETE ${path} failed (${res.status}): ${text}`)
  }
}

// ── addRoute ─────────────────────────────────────────────────────────────────
// Two routes per deployment:
//
// 1. App route  /p/:id  →  strip prefix  →  container
// 2. Asset route  /_next/* (+ /favicon.ico etc.)  when Referer = /p/:id
//    →  container (no prefix strip — Next.js serves /_next/* at its own root)
//
// The Referer matcher means multiple deployments can each claim /_next/* for
// their own assets without colliding.

export async function addRoute(
  deploymentId: string,
  containerName: string,
  port: number,
): Promise<void> {
  const upstream = [{ dial: `${containerName}:${port}` }]

  const appRoute = {
    '@id': `dep-${deploymentId}`,
    match: [{ path: [`/p/${deploymentId}/*`, `/p/${deploymentId}`] }],
    handle: [
      { handler: 'rewrite', strip_path_prefix: `/p/${deploymentId}` },
      { handler: 'reverse_proxy', upstreams: upstream },
    ],
  }

  // Proxy root-relative assets back to the container when the Referer ties
  // them to this specific deployment. Covers Next.js (/_next/*), CRA, Vite,
  // and common static file conventions.
  const assetRoute = {
    '@id': `dep-assets-${deploymentId}`,
    match: [{
      path: [
        '/_next/*',
        '/static/*',
        '/assets/*',
        '/favicon.ico',
        '/robots.txt',
        '/manifest.json',
      ],
      header: { Referer: [`*localhost/p/${deploymentId}*`] },
    }],
    handle: [{ handler: 'reverse_proxy', upstreams: upstream }],
  }

  const base = '/config/apps/http/servers/srv0/routes'
  await caddyPost(base, appRoute)
  await caddyPost(base, assetRoute)
}

// ── removeRoute ───────────────────────────────────────────────────────────────

export async function removeRoute(deploymentId: string): Promise<void> {
  await Promise.allSettled([
    caddyDelete(`/id/dep-${deploymentId}`),
    caddyDelete(`/id/dep-assets-${deploymentId}`),
  ])
}
