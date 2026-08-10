/**
 * Text-to-speech for listening questions, via Cloudflare Workers AI.
 * Primary: MiniMax Speech 2.8 Turbo (expressive, 40+ languages) — third-party
 * model, requires AI Gateway Unified Billing credits on the account.
 * Fallback: Deepgram Aura-2 (Workers AI neuron-billed, works out of the box).
 * Audio is cached in R2 by content hash so identical scripts are free to reuse.
 * Everything runs through the Cloudflare binding — no external calls, so this
 * works wherever the Worker is reachable (including mainland China).
 */
import type { Env } from '../types'
import { recordAiUsage, type AiMeterContext } from './billing'

export const TTS_MODEL = 'minimax/speech-2.8-turbo'
const TTS_FALLBACK_MODEL = '@cf/deepgram/aura-2-en'

/**
 * Curated voices offered in the teacher UI. `id` is the MiniMax voice;
 * `auraSpeaker` is the closest Aura-2 speaker used when falling back.
 */
export const TTS_VOICES = [
  { id: 'English_expressive_narrator', label: 'Expressive narrator', auraSpeaker: 'orpheus' },
  { id: 'English_calm_narrator', label: 'Calm narrator', auraSpeaker: 'luna' },
  { id: 'English_friendly_teacher', label: 'Friendly teacher', auraSpeaker: 'athena' },
  { id: 'English_male_narrator', label: 'Male narrator', auraSpeaker: 'odysseus' },
] as const

export const DEFAULT_TTS_VOICE = TTS_VOICES[0].id

const MAX_TEXT_CHARS = 10_000 // MiniMax limit on Workers AI
const TIMEOUT_MS = 15_000

export function isValidVoice(voice: string): boolean {
  return (TTS_VOICES as readonly { id: string }[]).some((v) => v.id === voice)
}

async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input))
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

export async function ttsCacheKey(model: string, text: string, voice: string, speed: number): Promise<string> {
  return `tts/${await sha256Hex(`${model}|${voice}|${speed}|${text}`)}.mp3`
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

async function runTtsModel(
  env: Env,
  model: string,
  text: string,
  voiceId: string,
  auraSpeaker: string,
  speed: number,
): Promise<Uint8Array> {
  const params =
    model === TTS_MODEL
      ? { format: 'mp3', text, voice_id: voiceId, speed, volume: 1, pitch: 0 }
      : { text, speaker: auraSpeaker, encoding: 'mp3' }
  const call = env.AI.run(model, params)
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
  const speed =
    typeof input.speed === 'number' && input.speed >= 0.5 && input.speed <= 2 ? input.speed : 1

  // Try MiniMax first (best quality), then Aura-2 (always available).
  let bytes: Uint8Array | null = null
  let modelUsed = TTS_MODEL
  let lastError = 'unknown'
  for (const model of [TTS_MODEL, TTS_FALLBACK_MODEL]) {
    const key = await ttsCacheKey(model, text, voiceEntry.id, speed)
    try {
      const existing = await env.AUDIO.head(key)
      if (existing) return { key, cached: true }
    } catch (err) {
      console.error('TTS cache head failed', err)
    }
    try {
      bytes = await runTtsModel(env, model, text, voiceEntry.id, voiceEntry.auraSpeaker, speed)
      modelUsed = model
      break
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err)
      console.error(`TTS model ${model} failed`, err)
    }
  }
  if (!bytes) return { error: lastError }

  const key = await ttsCacheKey(modelUsed, text, voiceEntry.id, speed)
  try {
    await env.AUDIO.put(key, bytes, {
      httpMetadata: { contentType: 'audio/mpeg' },
    })

    if (input.meter) {
      try {
        // Token approximation: ~4 chars per input token, no output tokens.
        // Both models are actually priced per character — close enough for caps.
        await recordAiUsage(env, { ...input.meter, feature: 'tts' }, {
          model: modelUsed,
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
