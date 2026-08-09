import type { Env, Role, SessionUser } from '../types'
import { generateId } from './auth'

export async function logAudit(
  env: Env,
  opts: {
    actorId: string
    actorRole: Role
    action: string
    resourceType?: string
    resourceId?: string
    ip?: string
    userAgent?: string
  },
): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO audit_events (
       id, actor_id, actor_role, action, resource_type, resource_id, ip, user_agent
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      generateId(),
      opts.actorId,
      opts.actorRole,
      opts.action,
      opts.resourceType ?? null,
      opts.resourceId ?? null,
      opts.ip ?? null,
      opts.userAgent ?? null,
    )
    .run()
}

function clientInfo(request: Request | undefined): { ip?: string; userAgent?: string } {
  if (!request) return {}
  return {
    ip: request.headers.get('CF-Connecting-IP') || request.headers.get('X-Forwarded-For') || undefined,
    userAgent: request.headers.get('User-Agent') || undefined,
  }
}

export function logAuth(
  env: Env,
  action: string,
  user: SessionUser | null,
  request?: Request,
): Promise<void> {
  const info = clientInfo(request)
  return logAudit(env, {
    actorId: user?.id ?? 'anonymous',
    actorRole: user?.role ?? 'teacher',
    action,
    ...info,
  })
}

export function logSensitiveRead(
  env: Env,
  action: string,
  user: SessionUser,
  request: Request,
  resourceType: string,
  resourceId: string,
): Promise<void> {
  const info = clientInfo(request)
  return logAudit(env, {
    actorId: user.id,
    actorRole: user.role,
    action,
    resourceType,
    resourceId,
    ...info,
  })
}
