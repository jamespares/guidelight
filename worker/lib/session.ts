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
    const t = await env.DB.prepare(`SELECT id, name, email FROM teachers WHERE id = ?`)
      .bind(session.user_id)
      .first<{ id: string; name: string; email: string }>()
    if (!t) return null
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

export async function handleAuth(env: Env, request: Request, path: string): Promise<Response | null> {
  if (path === '/api/auth/me' && request.method === 'GET') {
    const user = await getSession(env, request)
    return json({ user })
  }

  if (path === '/api/auth/logout' && request.method === 'POST') {
    const cookies = parseCookies(request.headers.get('Cookie'))
    if (cookies.session) {
      await env.DB.prepare(`DELETE FROM sessions WHERE id = ?`).bind(cookies.session).run()
    }
    return json({ ok: true }, 200, { 'Set-Cookie': clearSessionCookie() })
  }

  if (path === '/api/auth/teacher/register' && request.method === 'POST') {
    const body = (await request.json()) as { email?: string; password?: string; name?: string }
    if (!body.email || !body.password || !body.name) return error('Missing fields')
    if (body.password.length < 8) return error('Password must be at least 8 characters')

    const existing = await env.DB.prepare(`SELECT id FROM teachers WHERE email = ?`)
      .bind(body.email.trim())
      .first()
    if (existing) return error('Email already registered', 409)

    const id = generateId()
    const password_hash = await hashPassword(body.password)
    await env.DB.prepare(
      `INSERT INTO teachers (id, email, password_hash, name) VALUES (?, ?, ?, ?)`,
    )
      .bind(id, body.email.trim(), password_hash, body.name.trim())
      .run()

    const session = await createSession(env, id, 'teacher')
    return json(
      { user: { id, role: 'teacher', name: body.name.trim(), email: body.email.trim() } },
      201,
      { 'Set-Cookie': sessionCookie(session.id, session.expiresAt) },
    )
  }

  if (path === '/api/auth/teacher/login' && request.method === 'POST') {
    const body = (await request.json()) as { email?: string; password?: string }
    if (!body.email || !body.password) return error('Missing fields')

    const teacher = await env.DB.prepare(
      `SELECT id, email, name, password_hash FROM teachers WHERE email = ?`,
    )
      .bind(body.email.trim())
      .first<{ id: string; email: string; name: string; password_hash: string }>()

    if (!teacher || !(await verifyPassword(body.password, teacher.password_hash))) {
      return error('Invalid email or password', 401)
    }

    const session = await createSession(env, teacher.id, 'teacher')
    return json(
      { user: { id: teacher.id, role: 'teacher', name: teacher.name, email: teacher.email } },
      200,
      { 'Set-Cookie': sessionCookie(session.id, session.expiresAt) },
    )
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
      { 'Set-Cookie': sessionCookie(session.id, session.expiresAt) },
    )
  }

  return null
}
