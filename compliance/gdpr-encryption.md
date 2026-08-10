# Guidelight GDPR Encryption & Data Security Summary

Last updated: 2026-08-09

## Controller / Processor Roles

- **Controller**: Guidelight (the app operator).
- **Processor**: Cloudflare, Inc. provides the infrastructure (Workers, D1, R2, Email). Cloudflare’s Data Processing Addendum (DPA) is accepted at the account level.
- **Sub-processors**: Stripe, Inc. for billing/payment data; Workers AI providers for model inference.

## Encryption in Transit

- All traffic between users and Guidelight is encrypted with TLS 1.2+.
- Cloudflare SSL/TLS mode is set to **Full (strict)** for `getguidelight.com` and `www.getguidelight.com`.
- **Always Use HTTPS** is enabled; HTTP requests are redirected to HTTPS.
- The application sets `Strict-Transport-Security` (HSTS), `X-Content-Type-Options`, `X-Frame-Options`, and `Referrer-Policy` headers on every response.

## Encryption at Rest

| Data Store | Service | Encryption Standard | Managed By |
|------------|---------|---------------------|------------|
| User & application data | Cloudflare D1 | AES-256-GCM at rest | Cloudflare |
| Cached TTS audio files | Cloudflare R2 | AES-256-GCM at rest | Cloudflare |
| Application secrets | Wrangler Secrets | Encrypted at rest | Cloudflare |
| Passwords | Application layer | PBKDF2-SHA-256, 600,000 iterations | Guidelight |

Cloudflare D1 and R2 encryption is automatic, cannot be disabled, and requires no customer configuration.

## Secrets Management

- Stripe API keys (`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`) are stored as encrypted Wrangler secrets, not in source control or `wrangler.jsonc`.
- Local development uses `.dev.vars` (gitignored) with test keys only.

## Access Controls

- Session-based authentication with HttpOnly, SameSite=Lax, Secure-on-HTTPS cookies.
- Teachers verify email before accessing the dashboard.
- Students authenticate with usernames/passwords and can only see their own data.
- Row-level ownership checks ensure teachers can only access their own classes, students, and tasks.
- Rate limiting protects auth endpoints.

## Data Subject Rights

- **Export**: Teachers can request a full account export at `/api/account/export`.
- **Deletion**: Teachers can delete their account and all associated data at `/api/account/delete`.
- **Audit**: Security-relevant events are logged to the `audit_events` table.

## Compliance Certifications

Cloudflare D1 and R2 are covered by Cloudflare’s SOC 2 and ISO 27001 certifications. See the [Cloudflare Trust Hub](https://www.cloudflare.com/trust-hub/) for the latest reports.

## Document Retention

- DPA acceptance record: stored in this `compliance/` directory.
- SSL/TLS configuration: managed in the Cloudflare dashboard for the `getguidelight.com` zone.
