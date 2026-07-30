# Guidelight

AI-infused homework and assessment on Cloudflare Workers, D1, and Workers AI.

## Develop

```bash
npm install
npm run db:migrate
npm run dev
```

## Deploy

Create a remote D1 database, put its id in `wrangler.jsonc`, then:

```bash
npx wrangler d1 migrations apply guidelight --remote
npm run deploy
```

Deployed via Cloudflare Workers CI (builds on push to `main`).

## Support email (Cloudflare Email Routing)

Inbound `support@getguidelight.com` uses Cloudflare Email Routing (dashboard only — no Worker handler). Outbound auth mail stays on `auth@getguidelight.com`.

1. Cloudflare dashboard → **Email** / **Email Service** → **Email Routing** for `getguidelight.com`.
2. Onboard the domain (Cloudflare adds MX + SPF/DKIM TXT records).
3. **Destination addresses** → add and verify the inbox where you read support mail.
4. **Routing rule**: local part `support` → **Send to an email** → that destination.
5. Test from a different account than the destination (same-account loops are often dropped).

Do not add an inbound rule for `auth@` unless you want bounce noise there.
