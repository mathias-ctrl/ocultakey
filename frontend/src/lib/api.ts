let accessToken: string | null = null
let sessionExpiredHandler: (() => void) | null = null

export function setAccessToken(token: string | null) {
  accessToken = token
}

export function getAccessToken() {
  return accessToken
}

export function setSessionExpiredHandler(handler: (() => void) | null) {
  sessionExpiredHandler = handler
}

export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers)
  if (accessToken) headers.set('Authorization', `Bearer ${accessToken}`)
  if (options.body && !(options.body instanceof FormData)) headers.set('Content-Type', 'application/json')
  let response = await fetch(`/api/v1${path}`, { ...options, headers, credentials: 'include' })
  if (response.status === 401 && accessToken && path !== '/auth/login' && path !== '/auth/refresh') {
    const refreshed = await fetch('/api/v1/auth/refresh', { method: 'POST', credentials: 'include' })
    if (refreshed.ok) {
      const data = await refreshed.json()
      accessToken = data.access_token
      headers.set('Authorization', `Bearer ${accessToken}`)
      response = await fetch(`/api/v1${path}`, { ...options, headers, credentials: 'include' })
    } else {
      accessToken = null
      sessionExpiredHandler?.()
    }
  }
  if (!response.ok) {
    let detail = `HTTP ${response.status}`
    try {
      const body = await response.json()
      detail = body.detail || detail
    } catch {}
    throw new Error(detail)
  }
  if (response.status === 204) return undefined as T
  const contentType = response.headers.get('content-type') || ''
  if (!contentType.includes('application/json')) return response as unknown as T
  return response.json()
}

export function idempotencyKey() {
  return crypto.randomUUID()
}
