#!/usr/bin/env node
/**
 * Export the IELTS listening test transcript + voice casting as a JSON
 * manifest for scripts/generate-ielts-audio.py.
 *
 * Bundles src/data/ielts/listeningTest1.ts with esbuild (the same pattern as
 * scripts/cefr-e2e.mjs) so the manifest always matches the shipped content,
 * then writes scripts/ielts-audio-manifest.json.
 *
 * Run: node scripts/export-ielts-audio-manifest.mjs
 */
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { build } from 'esbuild'

const root = path.resolve(import.meta.dirname, '..')

const tmp = mkdtempSync(path.join(tmpdir(), 'ielts-manifest-'))
const entry = path.join(tmp, 'entry.ts')
writeFileSync(
  entry,
  `export { LISTENING_TEST_1 } from '${path.join(root, 'src/data/ielts/listeningTest1.ts')}'`,
)
const bundle = path.join(tmp, 'bundle.mjs')
await build({
  entryPoints: [entry],
  outfile: bundle,
  bundle: true,
  format: 'esm',
  platform: 'node',
  logLevel: 'silent',
})
const { LISTENING_TEST_1 } = await import(pathToFileURL(bundle).href)

/** Speaker id -> Edge TTS voice. Mixed GB/AU/US/NZ accents, as in the real exam. */
const VOICES = {
  narrator: 'en-GB-LibbyNeural',
  r: 'en-GB-SoniaNeural',
  d: 'en-GB-RyanNeural',
  m: 'en-AU-NatashaNeural',
  mia: 'en-US-AvaNeural',
  tom: 'en-GB-ThomasNeural',
  l: 'en-NZ-MitchellNeural',
}

/** Default gaps (seconds): same-speaker follow-on vs speaker change. */
const SAME_SPEAKER_GAP = 0.5
const NEW_SPEAKER_GAP = 0.9

const manifest = {
  test: LISTENING_TEST_1.slug,
  outDir: `public/ielts-listening/${LISTENING_TEST_1.slug}`,
  voices: VOICES,
  parts: LISTENING_TEST_1.parts.map((part) => {
    const lines = []
    let prevSpeaker = null
    for (const line of part.transcript) {
      const voice = VOICES[line.speaker]
      if (!voice) throw new Error(`no voice cast for speaker "${line.speaker}"`)
      let gap =
        prevSpeaker === null ? 0 : prevSpeaker === line.speaker ? SAME_SPEAKER_GAP : NEW_SPEAKER_GAP
      if (line.pauseBefore) gap += line.pauseBefore
      lines.push({ speaker: line.speaker, voice, gap, text: line.text })
      prevSpeaker = line.speaker
    }
    return { part: part.part, file: `part-${part.part}.mp3`, lines }
  }),
}

const out = path.join(root, 'scripts', 'ielts-audio-manifest.json')
writeFileSync(out, JSON.stringify(manifest, null, 2) + '\n')
const total = manifest.parts.reduce((n, p) => n + p.lines.length, 0)
console.log(`wrote ${out} (${manifest.parts.length} parts, ${total} lines)`)
