import os
import subprocess
import sys
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.normpath(os.path.join(HERE, "..", "..", "front", "public", "assets", "sfx", "skating"))

SOUNDS = [
    ("push", "swish/blade", 0.35, None, 3),
    ("brake", "swipe/cloth", 0.55, None, 1),
    ("fall", "pro_impact/short", 0.6, None, 1),
    ("bump", "pro_pop_in/knock", 0.16, None, 1),
    ("start", "pro_notify/ding_2296", 0.26, None, 1),
]


def main():
    earshot_python = os.environ.get("EARSHOT_PYTHON")
    if not earshot_python:
        sys.exit("Set EARSHOT_PYTHON to the python of an Earshot install (e.g. ~/tools/earshot/.venv/bin/python).")
    os.makedirs(OUT, exist_ok=True)
    with tempfile.TemporaryDirectory() as work:
        for name, sound_id, dur, pitch, seed in SOUNDS:
            wav = os.path.join(work, f"{name}.wav")
            mp3 = os.path.join(OUT, f"{name}.mp3")
            args = [earshot_python, "-m", "earshot", "sfx", "render", sound_id, "-o", wav, "--dur", str(dur), "--seed", str(seed)]
            if pitch:
                args += ["--pitch", pitch]
            subprocess.run(args, check=True)
            subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", wav, "-ac", "1", "-ar", "44100", "-codec:a", "libmp3lame", "-q:a", "4", mp3], check=True)
            print("sfx", os.path.relpath(mp3, HERE))


main()
