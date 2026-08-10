/** Password hashing + session helpers using Web Crypto (Workers-compatible). */

// Cloudflare Workers' native PBKDF2 supports iteration counts up to 100,000.
// Newer hashes use this limit. Legacy hashes (up to 600,000) are verified with a
// pure-JS PBKDF2-HMAC-SHA256 fallback and then transparently re-hashed on login.
const PBKDF2_ITERATIONS = 100_000
const LEGACY_MAX_ITERATIONS = 600_000
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

async function pbkdf2HmacSha256Js(
  password: Uint8Array,
  salt: Uint8Array,
  iterations: number,
  dkLen: number,
): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    'raw',
    password,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const blocks = Math.ceil(dkLen / 32)
  const out = new Uint8Array(blocks * 32)
  for (let i = 1; i <= blocks; i++) {
    const saltIdx = new Uint8Array(salt.length + 4)
    saltIdx.set(salt)
    new DataView(saltIdx.buffer).setUint32(salt.length, i, false)
    let u = new Uint8Array(await crypto.subtle.sign('HMAC', key, saltIdx))
    const t = new Uint8Array(u)
    for (let j = 2; j <= iterations; j++) {
      u = new Uint8Array(await crypto.subtle.sign('HMAC', key, u))
      for (let k = 0; k < 32; k++) t[k] ^= u[k]
    }
    out.set(t, (i - 1) * 32)
  }
  return out.slice(0, dkLen)
}

export async function verifyPassword(
  password: string,
  stored: string,
): Promise<{ valid: boolean; newHash?: string }> {
  const parts = stored.split('$')
  if (parts.length !== 4 || parts[0] !== 'pbkdf2') return { valid: false }
  const iterations = Number(parts[1])
  const salt = hexToBytes(parts[2])
  const expected = parts[3]
  const passwordBytes = new TextEncoder().encode(password)

  let derived: ArrayBuffer
  if (iterations <= PBKDF2_ITERATIONS) {
    const keyMaterial = await crypto.subtle.importKey(
      'raw',
      passwordBytes,
      'PBKDF2',
      false,
      ['deriveBits'],
    )
    derived = await crypto.subtle.deriveBits(
      { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
      keyMaterial,
      256,
    )
  } else if (iterations <= LEGACY_MAX_ITERATIONS) {
    derived = (await pbkdf2HmacSha256Js(passwordBytes, salt, iterations, 32)).buffer
  } else {
    return { valid: false }
  }

  const valid = bytesToHex(derived) === expected
  if (!valid) return { valid: false }

  if (iterations > PBKDF2_ITERATIONS) {
    return { valid: true, newHash: await hashPassword(password) }
  }
  return { valid: true }
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
  const alphabetSize = chars.length
  const rejectLimit = Math.floor(256 / alphabetSize) * alphabetSize
  const out: string[] = []
  let bytes = crypto.getRandomValues(new Uint8Array(length * 2))
  let i = 0
  while (out.length < length) {
    if (i >= bytes.length) {
      bytes = crypto.getRandomValues(new Uint8Array(length * 2))
      i = 0
    }
    const b = bytes[i++]
    if (b < rejectLimit) {
      out.push(chars[b % alphabetSize])
    }
  }
  return out.join('')
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
