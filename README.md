# Guidelight

AI-infused homework and assessment on Cloudflare Workers, D1, and Workers AI (Kimi K2.6).

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
