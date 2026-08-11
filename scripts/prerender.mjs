#!/usr/bin/env node
/**
 * Prerender the public routes to static HTML.
 *
 * Runs after `vite build` and `vite build --ssr src/entry-server.tsx --config vite.ssr.config.ts`:
 *   1. reads the built dist/client/index.html as the template,
 *   2. renders each public route with the SSR bundle,
 *   3. swaps in per-route <title>/description/canonical/OG tags + JSON-LD,
 *   4. writes dist/client/<route>/index.html (and overwrites index.html for '/').
 *
 * Cloudflare Assets serves these files directly; unknown routes still fall
 * back to the SPA. Every replacement is asserted exactly once, so a template
 * change that breaks a marker fails the build loudly instead of shipping
 * silent regressions.
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const root = path.resolve(import.meta.dirname, '..')
const template = await readFile(path.join(root, 'dist/client/index.html'), 'utf8')
const ssr = await import(pathToFileURL(path.join(root, 'dist/ssr/entry-server.js')).href)
const { renderRoute, PRERENDER_ROUTES, routeJsonLd, siteJsonLd } = ssr

function escapeHtml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function jsonLdScript(data) {
  const json = JSON.stringify(data).replace(/</g, '\\u003c')
  return `<script type="application/ld+json">${json}</script>`
}

const metaTag = (attr, name) => new RegExp(`<meta\\s+${attr}="${name}"\\s+content="[^"]*"\\s*/>`)

/** [regex, content-for-route, kind, label] — content is the attribute/text value to stamp in. */
function headFor(route, canonical) {
  return [
    [/<title>[^<]*<\/title>/, route.title, 'title', 'title'],
    [metaTag('name', 'description'), route.description, 'meta', 'description'],
    [/<link\s+rel="canonical"\s+href="[^"]*"\s*\/>/, canonical, 'canonical', 'canonical'],
    [metaTag('property', 'og:title'), route.title, 'meta', 'og:title'],
    [metaTag('property', 'og:description'), route.description, 'meta', 'og:description'],
    [metaTag('property', 'og:url'), canonical, 'meta', 'og:url'],
    [metaTag('name', 'twitter:title'), route.title, 'meta', 'twitter:title'],
    [metaTag('name', 'twitter:description'), route.description, 'meta', 'twitter:description'],
  ]
}

function stamp(html, regex, value, kind, label) {
  const matches = [...html.matchAll(new RegExp(regex.source, regex.flags.includes('g') ? regex.flags : regex.flags + 'g'))]
  if (matches.length !== 1) {
    throw new Error(`prerender: expected exactly 1 match for ${label}, found ${matches.length}`)
  }
  const m = matches[0]
  const original = m[0]
  let next
  if (kind === 'title') {
    next = `<title>${escapeHtml(value)}</title>`
  } else if (kind === 'canonical') {
    next = `<link rel="canonical" href="${value}" />`
  } else {
    next = original.replace(/content="[^"]*"/, `content="${escapeHtml(value)}"`)
  }
  return html.slice(0, m.index) + next + html.slice(m.index + original.length)
}

/** Replace exactly one occurrence of a literal string, failing loudly otherwise. */
function replaceOnce(html, from, to, label) {
  const first = html.indexOf(from)
  if (first === -1) throw new Error(`prerender: marker not found (${label}): ${from}`)
  if (html.indexOf(from, first + from.length) !== -1) {
    throw new Error(`prerender: marker not unique (${label}): ${from}`)
  }
  return html.slice(0, first) + to + html.slice(first + from.length)
}

const defaults = PRERENDER_ROUTES.find((r) => r.path === '/')
if (!defaults) throw new Error('prerender: PRERENDER_ROUTES must include /')

// The template head is authored with the landing defaults; verify it matches
// seo.ts before replacing anything, so drift between the two fails the build.
for (const [regex, value, , label] of headFor(defaults, 'https://getguidelight.com/')) {
  const m = template.match(regex)
  if (!m) throw new Error(`prerender: template head is missing the ${label} tag`)
  if (!m[0].includes(escapeHtml(value))) {
    throw new Error(`prerender: template ${label} is out of sync with src/lib/seo.ts:\n  template: ${m[0]}\n  expected: ${escapeHtml(value)}`)
  }
}

for (const route of PRERENDER_ROUTES) {
  let html = template
  const canonical = `https://getguidelight.com${route.path === '/' ? '/' : route.path}`

  for (const [regex, value, kind, label] of headFor(route, canonical)) {
    html = stamp(html, regex, value, kind, `${route.path} ${label}`)
  }

  const jsonLd = [...siteJsonLd(), ...routeJsonLd(route.path)].map(jsonLdScript).join('')
  html = replaceOnce(html, '</head>', `${jsonLd}</head>`, `${route.path} </head>`)

  const body = renderRoute(route.path)
  html = replaceOnce(
    html,
    '<div id="root"></div>',
    `<div id="root">${body}</div>`,
    `${route.path} root`,
  )

  // Flat .html files: Cloudflare Assets (auto-trailing-slash) serves them at
  // the clean URL with no redirect, so the canonical URL is served directly.
  const outFile =
    route.path === '/'
      ? path.join(root, 'dist/client/index.html')
      : path.join(root, 'dist/client', `${route.path}.html`)
  await mkdir(path.dirname(outFile), { recursive: true })
  await writeFile(outFile, html)
  console.log(`prerendered ${route.path} -> ${path.relative(root, outFile)}`)
}
