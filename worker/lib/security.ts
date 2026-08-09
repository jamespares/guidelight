import type { Env } from '../types'

export function withSecurityHeaders(response: Response, _env: Env): Response {
  const secured = new Response(response.body, response)
  secured.headers.set('Strict-Transport-Security', 'max-age=63072000; includeSubDomains; preload')
  secured.headers.set(
    'Content-Security-Policy',
    "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://js.stripe.com; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self' https://api.stripe.com; frame-src https://js.stripe.com https://hooks.stripe.com; child-src https://js.stripe.com; base-uri 'self'; form-action 'self';",
  )
  secured.headers.set('X-Frame-Options', 'DENY')
  secured.headers.set('X-Content-Type-Options', 'nosniff')
  secured.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin')
  secured.headers.set(
    'Permissions-Policy',
    'accelerometer=(), camera=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), payment=(), usb=()',
  )
  return secured
}

export function corsPreflight(request: Request, env: Env): Response | null {
  if (request.method !== 'OPTIONS') return null
  const origin = env.APP_URL || 'http://localhost:5173'
  return new Response(null, {
    headers: {
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Stripe-Signature',
      'Access-Control-Allow-Credentials': 'true',
    },
  })
}

export function checkBodySize(request: Request, maxBytes = 2_000_000): Response | null {
  const contentLength = request.headers.get('Content-Length')
  if (contentLength && Number(contentLength) > maxBytes) {
    return new Response(JSON.stringify({ error: 'Payload too large' }), {
      status: 413,
      headers: { 'Content-Type': 'application/json' },
    })
  }
  return null
}
