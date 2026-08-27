#!/usr/bin/env python3
"""Generate the IELTS listening mock-test audio (one mp3 per part).

Reads scripts/ielts-audio-manifest.json (produced by
scripts/export-ielts-audio-manifest.mjs, so it always matches
src/data/ielts/listeningTest1.ts) and writes part mp3s to
public/ielts-listening/<test>/ using Microsoft Edge TTS, with ffmpeg for
silence gaps and concatenation. These are fixed-content clips shipped as
static assets, so the app never depends on a live TTS provider.

Setup (isolated venv, not committed):

    python3 -m venv scripts/.venv-audio
    scripts/.venv-audio/bin/pip install edge-tts

Run:

    node scripts/export-ielts-audio-manifest.mjs
    scripts/.venv-audio/bin/python scripts/generate-ielts-audio.py
"""
import asyncio
import json
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
MANIFEST = ROOT / 'scripts' / 'ielts-audio-manifest.json'

SAMPLE_RATE = 24000
CHANNELS = 1
BITRATE = '64k'
CONCURRENCY = 6


def run(cmd: list[str]) -> None:
    proc = subprocess.run(cmd, capture_output=True)
    if proc.returncode != 0:
        raise RuntimeError(f"{' '.join(cmd)}\n{proc.stderr.decode()[-500:]}")


def to_wav(mp3: Path, wav: Path) -> None:
    run(['ffmpeg', '-y', '-i', str(mp3), '-ar', str(SAMPLE_RATE), '-ac', str(CHANNELS), str(wav)])


def silence_wav(path: Path, seconds: float) -> None:
    run([
        'ffmpeg', '-y', '-f', 'lavfi', '-i', 'anullsrc=r=24000:cl=mono',
        '-t', f'{seconds:.2f}', str(path),
    ])


async def synthesise(entries: list[dict], tmp: Path) -> list[Path]:
    """TTS every line (bounded concurrency) and return wav paths in order."""
    try:
        import edge_tts
    except ImportError:
        sys.exit('edge-tts not installed — create the venv shown in the docstring first')

    wavs: list[Path | None] = [None] * len(entries)
    sem = asyncio.Semaphore(CONCURRENCY)

    async def one(i: int, entry: dict) -> None:
        async with sem:
            mp3 = tmp / f'line-{i}.mp3'
            await edge_tts.Communicate(entry['text'], entry['voice']).save(str(mp3))
            wav = tmp / f'line-{i}.wav'
            await asyncio.to_thread(to_wav, mp3, wav)
            wavs[i] = wav

    await asyncio.gather(*(one(i, e) for i, e in enumerate(entries)))
    return [w for w in wavs if w is not None]


async def generate() -> None:
    manifest = json.loads(MANIFEST.read_text())
    out_dir = ROOT / manifest['outDir']
    out_dir.mkdir(parents=True, exist_ok=True)

    with tempfile.TemporaryDirectory() as tmp_s:
        tmp = Path(tmp_s)
        silences: dict[float, Path] = {}

        def silence(seconds: float) -> Path:
            key = round(seconds, 2)
            if key not in silences:
                path = tmp / f'silence-{key}.wav'
                silence_wav(path, key)
                silences[key] = path
            return silences[key]

        for part in manifest['parts']:
            lines = part['lines']
            print(f"part {part['part']}: {len(lines)} lines")
            wavs = await synthesise(lines, tmp)
            concat = tmp / f"concat-{part['part']}.txt"
            with concat.open('w') as fh:
                for wav, entry in zip(wavs, lines):
                    gap = float(entry.get('gap', 0))
                    if gap > 0:
                        fh.write(f"file '{silence(gap)}'\n")
                    fh.write(f"file '{wav}'\n")
                fh.write(f"file '{silence(1.0)}'\n")
            joined = tmp / f"part-{part['part']}.wav"
            run(['ffmpeg', '-y', '-f', 'concat', '-safe', '0', '-i', str(concat), '-c', 'copy', str(joined)])
            out = out_dir / part['file']
            run([
                'ffmpeg', '-y', '-i', str(joined), '-ar', str(SAMPLE_RATE), '-ac', str(CHANNELS),
                '-codec:a', 'libmp3lame', '-b:a', BITRATE, str(out),
            ])
            print(f'  -> {out.relative_to(ROOT)} ({out.stat().st_size // 1024} KB)')
            for f in tmp.glob('line-*'):
                f.unlink()

    print(f'done — audio written to {out_dir.relative_to(ROOT)}')


if __name__ == '__main__':
    asyncio.run(generate())
