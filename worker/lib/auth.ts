/** Password hashing + session helpers using Web Crypto (Workers-compatible). */

const PBKDF2_ITERATIONS = 100_000
const SESSION_DAYS = 14

function bytesToHex(bytes: ArrayBuffer | Uint8Array): string {
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)
  return [...arr].map((b) => b.toString(16).padStart(2, '0')).join('')
}

function hexToBytes(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2)
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16)
  }
  return out
}

export function generateId(): string {
  return crypto.randomUUID()
}

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveBits'],
  )
  const derived = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
    keyMaterial,
    256,
  )
  return `pbkdf2$${PBKDF2_ITERATIONS}$${bytesToHex(salt)}$${bytesToHex(derived)}`
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split('$')
  if (parts.length !== 4 || parts[0] !== 'pbkdf2') return false
  const iterations = Number(parts[1])
  const salt = hexToBytes(parts[2])
  const expected = parts[3]
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveBits'],
  )
  const derived = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
    keyMaterial,
    256,
  )
  return bytesToHex(derived) === expected
}

export function sessionExpiry(): string {
  const d = new Date()
  d.setDate(d.getDate() + SESSION_DAYS)
  return d.toISOString()
}

export function parseCookies(header: string | null): Record<string, string> {
  if (!header) return {}
  return Object.fromEntries(
    header.split(';').map((c) => {
      const [k, ...rest] = c.trim().split('=')
      return [k, decodeURIComponent(rest.join('=') || '')]
    }),
  )
}

export function sessionCookie(id: string, expiresAt: string, secure = false): string {
  // Secure only on HTTPS so local Vite/HTTP sessions still work
  const parts = [
    `session=${encodeURIComponent(id)}`,
    `Path=/`,
    `HttpOnly`,
    `SameSite=Lax`,
    `Expires=${new Date(expiresAt).toUTCString()}`,
  ]
  if (secure) parts.push('Secure')
  return parts.join('; ')
}

export function clearSessionCookie(secure = false): string {
  const parts = ['session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0']
  if (secure) parts.push('Secure')
  return parts.join('; ')
}

/** Minimise PII: "James Pares" → "James P." */
export function minimiseName(raw: string): string {
  const parts = raw.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return 'Student'
  if (parts.length === 1) return parts[0]
  const first = parts[0]
  const lastInitial = parts[parts.length - 1][0]?.toUpperCase() ?? ''
  return `${first} ${lastInitial}.`
}

/** Parse pasted name block into unique minimised display names. */
export function parseNameBlock(text: string): string[] {
  return text
    .split(/[\n,;]+/)
    .map((l) => l.replace(/^\d+[\).\-\s]+/, '').trim())
    .filter(Boolean)
    .map(minimiseName)
}

export function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '')
    .slice(0, 12)
}

export function randomPassword(length = 8): string {
  const chars = 'abcdefghjkmnpqrstuvwxyz23456789'
  const bytes = crypto.getRandomValues(new Uint8Array(length))
  return [...bytes].map((b) => chars[b % chars.length]).join('')
}

export function json(data: unknown, status = 200, headers: HeadersInit = {}): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  })
}

export function error(message: string, status = 400): Response {
  return json({ error: message }, status)
}
