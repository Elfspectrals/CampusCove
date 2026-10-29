import os
import subprocess
import sys
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.normpath(os.path.join(HERE, "..", "..", "front", "public", "assets", "sfx", "punch"))

SOUNDS = [
    ("whoosh", "fit/whoosh.short/bamboo_swish", 0.28, (1, 2, 3)),
    ("impact", "fit/land.light/fingertip_book", 0.3, (1, 2, 3)),
]


def main():
    earshot_python = os.environ.get("EARSHOT_PYTHON")
    if not earshot_python:
        sys.exit("Set EARSHOT_PYTHON to the python of an Earshot install (e.g. ~/tools/earshot/.venv/bin/python).")
    os.makedirs(OUT, exist_ok=True)
    with tempfile.TemporaryDirectory() as work:
        for name, sound_id, dur, seeds in SOUNDS:
            for index, seed in enumerate(seeds, start=1):
                wav = os.path.join(work, f"{name}_{index}.wav")
                mp3 = os.path.join(OUT, f"{name}_{index}.mp3")
                subprocess.run([earshot_python, "-m", "earshot", "sfx", "render", sound_id, "-o", wav, "--dur", str(dur), "--seed", str(seed)], check=True)
                subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", wav, "-ac", "1", "-ar", "44100", "-codec:a", "libmp3lame", "-q:a", "4", mp3], check=True)
                print("sfx", os.path.relpath(mp3, HERE))


main()
