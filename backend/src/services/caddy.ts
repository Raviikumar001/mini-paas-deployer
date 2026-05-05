const CADDY_ADMIN = process.env.CADDY_ADMIN ?? 'http://localhost:2019'
const BASE_DOMAIN = process.env.BASE_DOMAIN || 'localhost'

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


export async function registerStaticRoutes(): Promise<void> {
  const apiRoute = {
    '@id': 'api',
    match: [{ host: [BASE_DOMAIN], path: ['/api/*'] }],
    handle: [
      { handler: 'reverse_proxy', upstreams: [{ dial: 'backend:3001' }] },
    ],
  }

  const frontendRoute = {
    '@id': 'frontend',
    match: [{ host: [BASE_DOMAIN] }],
    handle: [
      { handler: 'reverse_proxy', upstreams: [{ dial: 'frontend:5173' }] },
    ],
  }

  // Idempotent: delete old routes first in case of restart,
  // then re-add them in priority order (API before frontend so /api/* matches first).
  await caddyDelete('/id/api').catch(() => {})
  await caddyPost('/config/apps/http/servers/srv0/routes', apiRoute)
  await caddyDelete('/id/frontend').catch(() => {})
  await caddyPost('/config/apps/http/servers/srv0/routes', frontendRoute)

  console.log(`Caddy static routes registered for ${BASE_DOMAIN}`)
}


export async function addRoute(
  deploymentId: string,
  subdomain: string,
  containerName: string,
  port: number,
): Promise<void> {
  const route = {
    '@id': `dep-${deploymentId}`,
    match: [{ host: [`${subdomain}.${BASE_DOMAIN}`] }],
    handle: [
      { handler: 'reverse_proxy', upstreams: [{ dial: `${containerName}:${port}` }] },
    ],
  }

  await caddyPost('/config/apps/http/servers/srv0/routes', route)
}



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



export async function removeRoute(deploymentId: string): Promise<void> {
  await caddyDelete(`/id/dep-${deploymentId}`)
}
