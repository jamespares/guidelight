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

## AI stack, China & offline behaviour

- All AI runs server-side through the Workers AI binding — the browser never calls an external AI provider, so the app works anywhere the Cloudflare custom domain is reachable (including mainland China, with or without a VPN).
- Chat/generation/marking: `@cf/moonshotai/kimi-k2.6` (see `worker/lib/ai.ts`). Listening-question audio: MiniMax Speech 2.8 Turbo with automatic fallback to Deepgram Aura-2 (`worker/lib/tts.ts`), cached in the `guidelight-audio` R2 bucket by content hash so repeat scripts are free.
- MiniMax is a third-party model on Workers AI: it needs **AI Gateway → Unified Billing** enabled with credits on the account, otherwise it fails with `2021: Invalid User Credentials` and Aura-2 serves the audio instead.
- Student playback falls back to on-device speech synthesis if generated audio is missing or unreachable.
- One-time setup for TTS audio: `npx wrangler r2 bucket create guidelight-audio`.
- End-to-end AI quality check (against local `wrangler dev`, demo seed required):

```bash
npm run db:demo:seed:local
npx wrangler dev        # in another terminal
npm run test:ai
```

## Support email (Cloudflare Email Routing)

Inbound `support@getguidelight.com` uses Cloudflare Email Routing (dashboard only — no Worker handler). Outbound auth mail stays on `auth@getguidelight.com`.

1. Cloudflare dashboard → **Email** / **Email Service** → **Email Routing** for `getguidelight.com`.
2. Onboard the domain (Cloudflare adds MX + SPF/DKIM TXT records).
3. **Destination addresses** → add and verify the inbox where you read support mail.
4. **Routing rule**: local part `support` → **Send to an email** → that destination.
5. Test from a different account than the destination (same-account loops are often dropped).

Do not add an inbound rule for `auth@` unless you want bounce noise there.
