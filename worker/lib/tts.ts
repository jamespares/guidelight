/**
 * Text-to-speech for listening questions, via Cloudflare Workers AI.
 * Model: Deepgram Aura-2 (@cf/deepgram/aura-2-en) — neuron-billed, works out
 * of the box with no AI Gateway billing setup, keeping the runtime path on a
 * single first-party provider. (Fixed-content audio, e.g. the CEFR diagnostic,
 * is pre-generated offline with Edge TTS instead — see scripts/generate-audio.py.)
 * Audio is cached in R2 by content hash so identical scripts are free to reuse.
 * Everything runs through the Cloudflare binding — no external calls, so this
 * works wherever the Worker is reachable (including mainland China).
 */
import type { Env } from '../types'
import { recordAiUsage, type AiMeterContext } from './billing'

export const TTS_MODEL = '@cf/deepgram/aura-2-en'

/**
 * Curated voices offered in the teacher UI. `id` is the stable identifier the
 * client sends; `auraSpeaker` is the Aura-2 speaker it maps to.
 */
export const TTS_VOICES = [
  { id: 'English_expressive_narrator', label: 'Expressive narrator', auraSpeaker: 'orpheus' },
  { id: 'English_calm_narrator', label: 'Calm narrator', auraSpeaker: 'luna' },
  { id: 'English_friendly_teacher', label: 'Friendly teacher', auraSpeaker: 'athena' },
  { id: 'English_male_narrator', label: 'Male narrator', auraSpeaker: 'odysseus' },
] as const

export const DEFAULT_TTS_VOICE = TTS_VOICES[0].id

const MAX_TEXT_CHARS = 10_000 // app-level cap, matches the /api/tts route limit
const TIMEOUT_MS = 15_000

export function isValidVoice(voice: string): boolean {
  return (TTS_VOICES as readonly { id: string }[]).some((v) => v.id === voice)
}

async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input))
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

export async function ttsCacheKey(model: string, text: string, voice: string): Promise<string> {
  return `tts/${await sha256Hex(`${model}|${voice}|${text}`)}.mp3`
}

/** Normalise the various Workers AI TTS response shapes to raw mp3 bytes. */
async function toMp3Bytes(result: unknown): Promise<Uint8Array> {
  if (result instanceof ReadableStream) {
    const res = new Response(result)
    return new Uint8Array(await res.arrayBuffer())
  }
  if (result instanceof ArrayBuffer) return new Uint8Array(result)
  if (result instanceof Uint8Array) return result
  if (result && typeof result === 'object') {
    const r = result as Record<string, unknown>
    if (typeof r.audio === 'string') {
      const bin = atob(r.audio)
      const bytes = new Uint8Array(bin.length)
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
      return bytes
    }
  }
  throw new Error('Unexpected TTS response shape')
}

async function runTtsModel(env: Env, text: string, auraSpeaker: string): Promise<Uint8Array> {
  // Aura-2 accepts text/speaker/encoding only — there is no speed parameter.
  const call = env.AI.run(TTS_MODEL, { text, speaker: auraSpeaker, encoding: 'mp3' })
  const timeout = new Promise<never>((_, reject) => {
    setTimeout(() => reject(new Error('TTS request timed out')), TIMEOUT_MS)
  })
  const bytes = await toMp3Bytes(await Promise.race([call, timeout]))
  if (bytes.length < 1_000) throw new Error('TTS returned suspiciously small audio')
  return bytes
}

/**
 * Synthesise speech and store it in R2. Returns the object key on success, or
 * `{ error }` on failure — callers should leave audioUrl unset so the
 * student's browser speechSynthesis fallback still works.
 * `speed` is accepted for API compatibility but unused: Aura-2 has no speed
 * parameter.
 */
export async function synthesizeSpeech(
  env: Env,
  input: {
    text: string
    voice?: string
    speed?: number
    meter?: AiMeterContext
  },
): Promise<{ key: string; cached: boolean } | { error: string }> {
  if (!env.AUDIO) return { error: 'AUDIO bucket not bound' }
  const text = input.text.trim().slice(0, MAX_TEXT_CHARS)
  if (!text) return { error: 'empty text' }
  const voiceEntry =
    TTS_VOICES.find((v) => v.id === input.voice) ?? TTS_VOICES[0]

  const key = await ttsCacheKey(TTS_MODEL, text, voiceEntry.id)
  try {
    const existing = await env.AUDIO.head(key)
    if (existing) return { key, cached: true }
  } catch (err) {
    console.error('TTS cache head failed', err)
  }

  let bytes: Uint8Array
  try {
    bytes = await runTtsModel(env, text, voiceEntry.auraSpeaker)
  } catch (err) {
    console.error(`TTS model ${TTS_MODEL} failed`, err)
    return { error: err instanceof Error ? err.message : String(err) }
  }

  try {
    await env.AUDIO.put(key, bytes, {
      httpMetadata: { contentType: 'audio/mpeg' },
    })

    if (input.meter) {
      try {
        // Token approximation: ~4 chars per input token, no output tokens.
        // Aura-2 is actually priced per character — close enough for caps.
        await recordAiUsage(env, { ...input.meter, feature: 'tts' }, {
          model: TTS_MODEL,
          inputTokens: Math.max(1, Math.ceil(text.length / 4)),
          outputTokens: 0,
        })
      } catch (err) {
        console.error('recordAiUsage (tts) failed', err)
      }
    }

    return { key, cached: false }
  } catch (err) {
    console.error('synthesizeSpeech failed', err)
    return { error: err instanceof Error ? err.message : String(err) }
  }
}
