import type { Env, Role, SessionUser } from '../types'
import {
  clearSessionCookie,
  error,
  generateId,
  hashPassword,
  json,
  parseCookies,
  sessionCookie,
  sessionExpiry,
  verifyPassword,
} from './auth'
import {
  checkAuthEmailRateLimit,
  consumeAuthToken,
  createAuthToken,
} from './authTokens'
import {
  appUrl,
  sendMagicLinkEmail,
  sendPasswordResetEmail,
  sendVerifyEmail,
} from './email'

function wantsSecureCookie(request: Request): boolean {
  return new URL(request.url).protocol === 'https:'
}

export async function getSession(env: Env, request: Request): Promise<SessionUser | null> {
  const cookies = parseCookies(request.headers.get('Cookie'))
  const sid = cookies.session
  if (!sid) return null

  const session = await env.DB.prepare(
    `SELECT id, user_id, role, expires_at FROM sessions WHERE id = ?`,
  )
    .bind(sid)
    .first<{ id: string; user_id: string; role: Role; expires_at: string }>()

  if (!session) return null
  if (new Date(session.expires_at) < new Date()) {
    await env.DB.prepare(`DELETE FROM sessions WHERE id = ?`).bind(sid).run()
    return null
  }

  if (session.role === 'teacher') {
    const t = await env.DB.prepare(
      `SELECT id, name, email, email_verified FROM teachers WHERE id = ?`,
    )
      .bind(session.user_id)
      .first<{ id: string; name: string; email: string; email_verified: number }>()
    if (!t) return null
    // Unverified teachers cannot use the dashboard
    if (!t.email_verified) {
      await env.DB.prepare(`DELETE FROM sessions WHERE id = ?`).bind(sid).run()
      return null
    }
    return { id: t.id, role: 'teacher', name: t.name, email: t.email }
  }

  const s = await env.DB.prepare(`SELECT id, display_name, username FROM students WHERE id = ?`)
    .bind(session.user_id)
    .first<{ id: string; display_name: string; username: string }>()
  if (!s) return null
  return { id: s.id, role: 'student', name: s.display_name, username: s.username }
}

export async function requireRole(
  env: Env,
  request: Request,
  role: Role,
): Promise<SessionUser | Response> {
  const user = await getSession(env, request)
  if (!user) return error('Unauthorized', 401)
  if (user.role !== role) return error('Forbidden', 403)
  return user
}

export async function createSession(
  env: Env,
  userId: string,
  role: Role,
): Promise<{ id: string; expiresAt: string }> {
  const id = generateId()
  const expiresAt = sessionExpiry()
  await env.DB.prepare(
    `INSERT INTO sessions (id, user_id, role, expires_at) VALUES (?, ?, ?, ?)`,
  )
    .bind(id, userId, role, expiresAt)
    .run()
  return { id, expiresAt }
}

async function invalidateTeacherSessions(env: Env, teacherId: string): Promise<void> {
  await env.DB.prepare(`DELETE FROM sessions WHERE user_id = ? AND role = 'teacher'`)
    .bind(teacherId)
    .run()
}

const GENERIC_SENT =
  'If that email is registered, we sent a link. Check your inbox (and spam folder).'

export async function handleAuth(env: Env, request: Request, path: string): Promise<Response | null> {
  const secure = wantsSecureCookie(request)
  const base = appUrl(env, request)

  if (path === '/api/auth/me' && request.method === 'GET') {
    const user = await getSession(env, request)
    return json({ user })
  }

  if (path === '/api/auth/logout' && request.method === 'POST') {
    const cookies = parseCookies(request.headers.get('Cookie'))
    if (cookies.session) {
      await env.DB.prepare(`DELETE FROM sessions WHERE id = ?`).bind(cookies.session).run()
    }
    return json({ ok: true }, 200, { 'Set-Cookie': clearSessionCookie(secure) })
  }

  // —— Teacher register (no session until email verified) ——
  if (path === '/api/auth/teacher/register' && request.method === 'POST') {
    const body = (await request.json()) as { email?: string; password?: string; name?: string }
    if (!body.email || !body.password || !body.name) return error('Missing fields')
    if (body.password.length < 8) return error('Password must be at least 8 characters')

    const email = body.email.trim().toLowerCase()
    const existing = await env.DB.prepare(`SELECT id FROM teachers WHERE email = ?`)
      .bind(email)
      .first()
    if (existing) return error('Email already registered', 409)

    const id = generateId()
    const password_hash = await hashPassword(body.password)
    await env.DB.prepare(
      `INSERT INTO teachers (id, email, password_hash, name, email_verified)
       VALUES (?, ?, ?, ?, 0)`,
    )
      .bind(id, email, password_hash, body.name.trim())
      .run()

    const allowed = await checkAuthEmailRateLimit(env, id, 'verify_email')
    if (allowed) {
      const raw = await createAuthToken(env, id, 'verify_email')
      const link = `${base}/verify-email?token=${encodeURIComponent(raw)}`
      try {
        await sendVerifyEmail(env, email, link)
      } catch (err) {
        console.error('[auth] verify email send failed', err)
      }
    }

    return json(
      {
        ok: true,
        needsVerification: true,
        message: 'Check your email to verify your account before signing in.',
      },
      201,
    )
  }

  // —— Resend verification ——
  if (path === '/api/auth/teacher/resend-verification' && request.method === 'POST') {
    const body = (await request.json()) as { email?: string }
    if (!body.email) return error('Missing email')
    const email = body.email.trim().toLowerCase()

    const teacher = await env.DB.prepare(
      `SELECT id, email_verified FROM teachers WHERE email = ?`,
    )
      .bind(email)
      .first<{ id: string; email_verified: number }>()

    // Always generic — no enumeration
    if (teacher && !teacher.email_verified) {
      const allowed = await checkAuthEmailRateLimit(env, teacher.id, 'verify_email')
      if (allowed) {
        const raw = await createAuthToken(env, teacher.id, 'verify_email')
        const link = `${base}/verify-email?token=${encodeURIComponent(raw)}`
        try {
          await sendVerifyEmail(env, email, link)
        } catch (err) {
          console.error('[auth] resend verify failed', err)
        }
      }
    }
    return json({ ok: true, message: GENERIC_SENT })
  }

  // —— Verify email ——
  if (path === '/api/auth/teacher/verify-email' && request.method === 'POST') {
    const body = (await request.json()) as { token?: string }
    if (!body.token) return error('Missing token')

    const consumed = await consumeAuthToken(env, body.token.trim(), 'verify_email')
    if (!consumed) return error('Invalid or expired verification link', 400)

    const teacher = await env.DB.prepare(`SELECT id, email, name FROM teachers WHERE id = ?`)
      .bind(consumed.teacherId)
      .first<{ id: string; email: string; name: string }>()
    if (!teacher) return error('Account not found', 404)

    await env.DB.prepare(
      `UPDATE teachers SET email_verified = 1, email_verified_at = datetime('now') WHERE id = ?`,
    )
      .bind(teacher.id)
      .run()

    const session = await createSession(env, teacher.id, 'teacher')
    return json(
      {
        user: {
          id: teacher.id,
          role: 'teacher',
          name: teacher.name,
          email: teacher.email,
        },
      },
      200,
      { 'Set-Cookie': sessionCookie(session.id, session.expiresAt, secure) },
    )
  }

  // —— Teacher password login ——
  if (path === '/api/auth/teacher/login' && request.method === 'POST') {
    const body = (await request.json()) as { email?: string; password?: string }
    if (!body.email || !body.password) return error('Missing fields')

    const teacher = await env.DB.prepare(
      `SELECT id, email, name, password_hash, email_verified FROM teachers WHERE email = ?`,
    )
      .bind(body.email.trim().toLowerCase())
      .first<{
        id: string
        email: string
        name: string
        password_hash: string
        email_verified: number
      }>()

    if (!teacher || !(await verifyPassword(body.password, teacher.password_hash))) {
      return error('Invalid email or password', 401)
    }

    if (!teacher.email_verified) {
      return json(
        {
          error: 'Email not verified',
          code: 'EMAIL_NOT_VERIFIED',
          message: 'Please verify your email before signing in. You can resend the verification link.',
        },
        403,
      )
    }

    const session = await createSession(env, teacher.id, 'teacher')
    return json(
      { user: { id: teacher.id, role: 'teacher', name: teacher.name, email: teacher.email } },
      200,
      { 'Set-Cookie': sessionCookie(session.id, session.expiresAt, secure) },
    )
  }

  // —— Magic link request ——
  if (path === '/api/auth/teacher/magic-link' && request.method === 'POST') {
    const body = (await request.json()) as { email?: string }
    if (!body.email) return error('Missing email')
    const email = body.email.trim().toLowerCase()

    const teacher = await env.DB.prepare(
      `SELECT id, email_verified FROM teachers WHERE email = ?`,
    )
      .bind(email)
      .first<{ id: string; email_verified: number }>()

    if (teacher?.email_verified) {
      const allowed = await checkAuthEmailRateLimit(env, teacher.id, 'magic_link')
      if (allowed) {
        const raw = await createAuthToken(env, teacher.id, 'magic_link')
        const link = `${base}/login/teacher?magic=${encodeURIComponent(raw)}`
        try {
          await sendMagicLinkEmail(env, email, link)
        } catch (err) {
          console.error('[auth] magic link send failed', err)
        }
      }
    }
    return json({ ok: true, message: GENERIC_SENT })
  }

  // —— Magic link exchange ——
  if (path === '/api/auth/teacher/magic-link/consume' && request.method === 'POST') {
    const body = (await request.json()) as { token?: string }
    if (!body.token) return error('Missing token')

    const consumed = await consumeAuthToken(env, body.token.trim(), 'magic_link')
    if (!consumed) return error('Invalid or expired sign-in link', 400)

    const teacher = await env.DB.prepare(
      `SELECT id, email, name, email_verified FROM teachers WHERE id = ?`,
    )
      .bind(consumed.teacherId)
      .first<{ id: string; email: string; name: string; email_verified: number }>()
    if (!teacher || !teacher.email_verified) return error('Account not found', 404)

    const session = await createSession(env, teacher.id, 'teacher')
    return json(
      {
        user: {
          id: teacher.id,
          role: 'teacher',
          name: teacher.name,
          email: teacher.email,
        },
      },
      200,
      { 'Set-Cookie': sessionCookie(session.id, session.expiresAt, secure) },
    )
  }

  // —— Forgot password ——
  if (path === '/api/auth/teacher/forgot-password' && request.method === 'POST') {
    const body = (await request.json()) as { email?: string }
    if (!body.email) return error('Missing email')
    const email = body.email.trim().toLowerCase()

    const teacher = await env.DB.prepare(`SELECT id FROM teachers WHERE email = ?`)
      .bind(email)
      .first<{ id: string }>()

    if (teacher) {
      const allowed = await checkAuthEmailRateLimit(env, teacher.id, 'password_reset')
      if (allowed) {
        const raw = await createAuthToken(env, teacher.id, 'password_reset')
        const link = `${base}/reset-password?token=${encodeURIComponent(raw)}`
        try {
          await sendPasswordResetEmail(env, email, link)
        } catch (err) {
          console.error('[auth] reset email send failed', err)
        }
      }
    }
    return json({ ok: true, message: GENERIC_SENT })
  }

  // —— Reset password ——
  if (path === '/api/auth/teacher/reset-password' && request.method === 'POST') {
    const body = (await request.json()) as { token?: string; password?: string }
    if (!body.token || !body.password) return error('Missing fields')
    if (body.password.length < 8) return error('Password must be at least 8 characters')

    const consumed = await consumeAuthToken(env, body.token.trim(), 'password_reset')
    if (!consumed) return error('Invalid or expired reset link', 400)

    const password_hash = await hashPassword(body.password)
    await env.DB.prepare(`UPDATE teachers SET password_hash = ? WHERE id = ?`)
      .bind(password_hash, consumed.teacherId)
      .run()

    // Invalidate all existing sessions after password change
    await invalidateTeacherSessions(env, consumed.teacherId)

    const teacher = await env.DB.prepare(`SELECT id, email, name, email_verified FROM teachers WHERE id = ?`)
      .bind(consumed.teacherId)
      .first<{ id: string; email: string; name: string; email_verified: number }>()

    if (teacher?.email_verified) {
      const session = await createSession(env, teacher.id, 'teacher')
      return json(
        {
          user: {
            id: teacher.id,
            role: 'teacher',
            name: teacher.name,
            email: teacher.email,
          },
        },
        200,
        { 'Set-Cookie': sessionCookie(session.id, session.expiresAt, secure) },
      )
    }

    return json({
      ok: true,
      message: 'Password updated. Please verify your email, then sign in.',
    })
  }

  if (path === '/api/auth/student/login' && request.method === 'POST') {
    const body = (await request.json()) as { username?: string; password?: string }
    if (!body.username || !body.password) return error('Missing fields')

    const student = await env.DB.prepare(
      `SELECT id, display_name, username, password_hash FROM students WHERE username = ?`,
    )
      .bind(body.username.trim())
      .first<{
        id: string
        display_name: string
        username: string
        password_hash: string
      }>()

    if (!student || !(await verifyPassword(body.password, student.password_hash))) {
      return error('Invalid username or password', 401)
    }

    const session = await createSession(env, student.id, 'student')
    return json(
      {
        user: {
          id: student.id,
          role: 'student',
          name: student.display_name,
          username: student.username,
        },
      },
      200,
      { 'Set-Cookie': sessionCookie(session.id, session.expiresAt, secure) },
    )
  }

  return null
}
