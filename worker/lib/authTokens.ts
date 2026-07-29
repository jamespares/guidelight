import type { Env } from '../types'
import { generateId } from './auth'

export type AuthTokenPurpose = 'verify_email' | 'magic_link' | 'password_reset'

const TTL_MINUTES: Record<AuthTokenPurpose, number> = {
  verify_email: 60,
  password_reset: 60,
  magic_link: 15,
}

/** Max emails of a given purpose per teacher within the window. */
const RATE_LIMIT = 5
const RATE_WINDOW_MINUTES = 15

function bytesToHex(bytes: ArrayBuffer | Uint8Array): string {
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)
  return [...arr].map((b) => b.toString(16).padStart(2, '0')).join('')
}

/** URL-safe random token (raw value emailed to user). */
export function generateRawToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32))
  return bytesToHex(bytes)
}

export async function hashToken(raw: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(raw))
  return bytesToHex(digest)
}

function expiresAtIso(purpose: AuthTokenPurpose): string {
  const d = new Date()
  d.setMinutes(d.getMinutes() + TTL_MINUTES[purpose])
  return d.toISOString()
}

/** Returns false if this teacher recently received too many emails of this purpose. */
export async function checkAuthEmailRateLimit(
  env: Env,
  teacherId: string,
  purpose: AuthTokenPurpose,
): Promise<boolean> {
  const row = await env.DB.prepare(
    `SELECT COUNT(*) as c FROM auth_tokens
     WHERE teacher_id = ? AND purpose = ?
       AND created_at >= datetime('now', ?)`,
  )
    .bind(teacherId, purpose, `-${RATE_WINDOW_MINUTES} minutes`)
    .first<{ c: number }>()
  return (row?.c ?? 0) < RATE_LIMIT
}

/** Invalidate unused tokens of the same purpose for this teacher, then create a new one. */
export async function createAuthToken(
  env: Env,
  teacherId: string,
  purpose: AuthTokenPurpose,
): Promise<string> {
  const raw = generateRawToken()
  const token_hash = await hashToken(raw)
  const id = generateId()
  const expires_at = expiresAtIso(purpose)

  await env.DB.prepare(
    `UPDATE auth_tokens SET used_at = datetime('now')
     WHERE teacher_id = ? AND purpose = ? AND used_at IS NULL`,
  )
    .bind(teacherId, purpose)
    .run()

  await env.DB.prepare(
    `INSERT INTO auth_tokens (id, teacher_id, purpose, token_hash, expires_at)
     VALUES (?, ?, ?, ?, ?)`,
  )
    .bind(id, teacherId, purpose, token_hash, expires_at)
    .run()

  return raw
}

export async function consumeAuthToken(
  env: Env,
  raw: string,
  purpose: AuthTokenPurpose,
): Promise<{ teacherId: string } | null> {
  const token_hash = await hashToken(raw)
  const row = await env.DB.prepare(
    `SELECT id, teacher_id, expires_at, used_at FROM auth_tokens
     WHERE token_hash = ? AND purpose = ?`,
  )
    .bind(token_hash, purpose)
    .first<{
      id: string
      teacher_id: string
      expires_at: string
      used_at: string | null
    }>()

  if (!row || row.used_at) return null
  if (new Date(row.expires_at) < new Date()) return null

  await env.DB.prepare(`UPDATE auth_tokens SET used_at = datetime('now') WHERE id = ?`)
    .bind(row.id)
    .run()

  return { teacherId: row.teacher_id }
}
