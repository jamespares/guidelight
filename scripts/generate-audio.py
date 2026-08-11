#!/usr/bin/env python3
"""Regenerate the CEFR diagnostic audio (dictation/listening clips).

Reads scripts/audio-manifest.json (key/text/voice/rate per clip, emitted by
scripts/generate-items.js) and writes mp3s to public/cefr-audio/ using
Microsoft Edge TTS. These are fixed-content clips shipped as static assets, so
the running app never depends on a live TTS provider for the diagnostic.

Setup (isolated venv, not committed):

    python3 -m venv scripts/.venv-audio
    scripts/.venv-audio/bin/pip install edge-tts

Run:

    scripts/.venv-audio/bin/python scripts/generate-audio.py
"""
import asyncio
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
MANIFEST = ROOT / 'scripts' / 'audio-manifest.json'
OUT_DIR = ROOT / 'public' / 'cefr-audio'


async def generate() -> None:
    try:
        import edge_tts
    except ImportError:
        sys.exit('edge-tts not installed — create the venv shown in the docstring first')

    entries = json.loads(MANIFEST.read_text())
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    for entry in entries:
        out = OUT_DIR / Path(entry['key']).name
        print(f"{entry['key']} -> {out.name} ({entry['voice']} {entry['rate']})")
        communicate = edge_tts.Communicate(entry['text'], entry['voice'], rate=entry['rate'])
        await communicate.save(str(out))
    print(f'wrote {len(entries)} files to {OUT_DIR}')


if __name__ == '__main__':
    asyncio.run(generate())
