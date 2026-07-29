import type { Env } from '../types'

const DEFAULT_FROM = 'auth@getguidelight.com'
const DEFAULT_APP_URL = 'https://getguidelight.com'

/**
 * Light-theme brand tokens (email clients often force white canvases).
 * Matches app .light: silver field + navy primary — never teal.
 */
const C = {
  pageBg: '#e8eef6',
  cardBg: '#ffffff',
  border: '#d0d7e2',
  text: '#121a2b',
  muted: '#5b6578',
  brand: '#101828',
  buttonBg: '#121a2b',
  buttonFg: '#f0f4f8',
  link: '#1d2939',
} as const

export function appUrl(env: Env, request?: Request): string {
  if (env.APP_URL) return env.APP_URL.replace(/\/$/, '')
  if (request) {
    const url = new URL(request.url)
    return `${url.protocol}//${url.host}`
  }
  return DEFAULT_APP_URL
}

export function authFromEmail(env: Env): string {
  return env.AUTH_FROM_EMAIL || DEFAULT_FROM
}

export async function sendAuthEmail(
  env: Env,
  opts: { to: string; subject: string; html: string; text: string },
): Promise<void> {
  if (!env.EMAIL?.send) {
    console.warn('[email] EMAIL binding missing — logging instead:', opts.subject, opts.to)
    console.warn(opts.text)
    return
  }
  await env.EMAIL.send({
    from: authFromEmail(env),
    to: opts.to,
    subject: opts.subject,
    html: opts.html,
    text: opts.text,
  })
}

const STAR_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 32 32" role="img" aria-hidden="true" style="display:inline-block;vertical-align:middle;margin-right:8px">
  <path fill="${C.brand}" d="M16 1.2 L18.2 11.8 L28.8 10.2 L20.5 16 L28.8 21.8 L18.2 20.2 L16 30.8 L13.8 20.2 L3.2 21.8 L11.5 16 L3.2 10.2 L13.8 11.8 Z"/>
</svg>`

function wrapHtml(opts: {
  title: string
  body: string
  ctaLabel: string
  link: string
  expiryNote: string
}): string {
  // Escape for HTML attributes and text
  const href = opts.link
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
  const linkText = opts.link
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')

  // Bulletproof button: bgcolor + inline style on both td and a (Outlook/Gmail)
  const button = `
<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 24px;">
  <tr>
    <td align="left" bgcolor="${C.buttonBg}" style="background-color:${C.buttonBg};border-radius:8px;mso-padding-alt:12px 22px;">
      <a href="${href}" target="_blank"
         style="display:inline-block;padding:12px 22px;font-family:'Segoe UI',Helvetica,Arial,sans-serif;font-size:14px;font-weight:600;line-height:1.2;color:${C.buttonFg} !important;text-decoration:none;border-radius:8px;background-color:${C.buttonBg};">
        ${opts.ctaLabel}
      </a>
    </td>
  </tr>
</table>`

  return `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="color-scheme" content="light only" />
  <meta name="supported-color-schemes" content="light only" />
  <title>${opts.title}</title>
  <style>
    :root { color-scheme: light only; }
    a { color: ${C.link}; }
  </style>
</head>
<body style="margin:0;padding:0;background-color:${C.pageBg};">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${C.pageBg}" style="background-color:${C.pageBg};">
    <tr>
      <td align="center" style="padding:40px 16px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:480px;">
          <tr>
            <td style="padding:0 4px 20px;">
              <a href="https://getguidelight.com" style="text-decoration:none;color:${C.brand};">
                ${STAR_SVG}<span style="font-family:Georgia,'Times New Roman',serif;font-size:22px;font-weight:600;letter-spacing:-0.02em;color:${C.brand};vertical-align:middle;">Guidelight</span>
              </a>
            </td>
          </tr>
          <tr>
            <td bgcolor="${C.cardBg}" style="background-color:${C.cardBg};border:1px solid ${C.border};border-radius:10px;padding:32px 28px;">
              <h1 style="margin:0 0 12px;font-family:Georgia,'Times New Roman',serif;font-size:24px;font-weight:600;letter-spacing:-0.02em;line-height:1.25;color:${C.text};">${opts.title}</h1>
              <p style="margin:0 0 24px;font-family:'Segoe UI',Helvetica,Arial,sans-serif;font-size:15px;line-height:1.55;color:${C.muted};">${opts.body}</p>
              ${button}
              <p style="margin:0 0 8px;font-family:'Segoe UI',Helvetica,Arial,sans-serif;font-size:12px;line-height:1.5;color:${C.muted};">Or paste this link into your browser:</p>
              <p style="margin:0 0 20px;font-family:ui-monospace,Menlo,Consolas,monospace;font-size:11px;line-height:1.5;word-break:break-all;"><a href="${href}" style="color:${C.link};text-decoration:underline;">${linkText}</a></p>
              <p style="margin:0;font-family:'Segoe UI',Helvetica,Arial,sans-serif;font-size:12px;line-height:1.5;color:${C.muted};">${opts.expiryNote}</p>
            </td>
          </tr>
          <tr>
            <td style="padding:24px 4px 0;font-family:'Segoe UI',Helvetica,Arial,sans-serif;font-size:12px;line-height:1.5;color:${C.muted};">
              Guidelight · If you did not request this, you can ignore this email.
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`
}

export async function sendVerifyEmail(
  env: Env,
  to: string,
  link: string,
): Promise<void> {
  const text = `Verify your Guidelight teacher account:\n\n${link}\n\nThis link expires in 1 hour.`
  await sendAuthEmail(env, {
    to,
    subject: 'Verify your Guidelight email',
    text,
    html: wrapHtml({
      title: 'Verify your email',
      body: 'Welcome to Guidelight. Click the button below to verify your teacher account and open your dashboard.',
      ctaLabel: 'Verify email',
      link,
      expiryNote: 'This link expires in 1 hour.',
    }),
  })
}

export async function sendMagicLinkEmail(
  env: Env,
  to: string,
  link: string,
): Promise<void> {
  const text = `Sign in to Guidelight:\n\n${link}\n\nThis link expires in 15 minutes.`
  await sendAuthEmail(env, {
    to,
    subject: 'Your Guidelight sign-in link',
    text,
    html: wrapHtml({
      title: 'Sign in to Guidelight',
      body: 'Click the button below to sign in to your teacher account. No password needed.',
      ctaLabel: 'Sign in',
      link,
      expiryNote: 'This link expires in 15 minutes.',
    }),
  })
}

export async function sendPasswordResetEmail(
  env: Env,
  to: string,
  link: string,
): Promise<void> {
  const text = `Reset your Guidelight password:\n\n${link}\n\nThis link expires in 1 hour.`
  await sendAuthEmail(env, {
    to,
    subject: 'Reset your Guidelight password',
    text,
    html: wrapHtml({
      title: 'Reset your password',
      body: 'We received a request to reset your Guidelight teacher password. Choose a new password with the button below.',
      ctaLabel: 'Reset password',
      link,
      expiryNote: 'This link expires in 1 hour. If you did not request a reset, ignore this email.',
    }),
  })
}
