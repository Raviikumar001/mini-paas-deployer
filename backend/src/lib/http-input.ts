const GIT_HOSTS = new Set(['github.com', 'gitlab.com', 'bitbucket.org'])

export function ensureRequestSize(
  contentLength: string | undefined,
  maxBytes: number,
): string | null {
  if (!contentLength) return null
  const size = Number(contentLength)
  if (!Number.isFinite(size) || size < 0) return 'invalid Content-Length'
  if (size > maxBytes) return `request body must be ${maxBytes} bytes or less`
  return null
}

export function ensureRawBodySize(rawBody: string, maxBytes: number): string | null {
  if (Buffer.byteLength(rawBody, 'utf8') > maxBytes) {
    return `request body must be ${maxBytes} bytes or less`
  }
  return null
}

export function parseJsonBody<T>(rawBody: string): T | { error: string } {
  try {
    return JSON.parse(rawBody) as T
  } catch {
    return { error: 'invalid JSON payload' }
  }
}

export function validatePublicGitUrl(value: string): { ok: true; url: URL } | { ok: false; error: string } {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    return { ok: false, error: 'invalid gitUrl' }
  }

  if (url.protocol !== 'https:') {
    return { ok: false, error: 'gitUrl must use https' }
  }

  if (url.username || url.password) {
    return { ok: false, error: 'gitUrl must not include credentials' }
  }

  if (!GIT_HOSTS.has(url.hostname.toLowerCase())) {
    return { ok: false, error: 'gitUrl host is not supported' }
  }

  const parts = url.pathname.split('/').filter(Boolean)
  if (parts.length < 2) {
    return { ok: false, error: 'gitUrl must include owner and repository' }
  }

  return { ok: true, url }
}

