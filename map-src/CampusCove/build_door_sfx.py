import os
import subprocess
import sys
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.normpath(os.path.join(HERE, "..", "..", "front", "public", "assets", "sfx", "door"))

# Earshot's bank has no door recordings, so each door sound is layered from bank parts:
# (sound id, delay ms, weight relative to the loudest layer, seed)
SOUNDS = {
    "lock": [
        [("toggle/latch", 0, 1.0, 1), ("click/thock", 45, 0.6, 1)],
        [("toggle/latch", 0, 1.0, 2), ("click/thock", 50, 0.55, 2)],
    ],
    "unlock": [
        [("click/thock", 0, 0.55, 3), ("toggle/latch", 40, 1.0, 3)],
        [("click/thock", 0, 0.5, 4), ("toggle/latch", 45, 1.0, 4)],
    ],
    # someone tries the handle of a locked door: the latch knocks against the strike plate a few times
    "rattle": [
        [("toggle/latch", 0, 0.8, 1), ("toggle/latch", 95, 1.0, 2), ("toggle/latch", 200, 0.7, 3), ("tap/knuckle", 0, 0.35, 1)],
        [("toggle/latch", 0, 1.0, 4), ("toggle/latch", 110, 0.75, 5), ("toggle/latch", 190, 0.85, 6), ("tap/knuckle", 110, 0.3, 2)],
        [("toggle/latch", 0, 0.9, 7), ("toggle/latch", 80, 0.7, 8), ("toggle/latch", 175, 1.0, 9), ("toggle/latch", 270, 0.5, 10)],
    ],
    "open": [
        [("click/thock", 0, 0.7, 1), ("swish/soft", 60, 0.45, 1)],
        [("click/thock", 0, 0.65, 2), ("swish/soft", 70, 0.4, 2)],
    ],
    "close": [
        [("whoosh_big/thump", 0, 1.0, 1), ("toggle/latch", 35, 0.6, 11)],
        [("whoosh_big/thump", 0, 0.95, 2), ("toggle/latch", 40, 0.55, 12)],
    ],
}


LAYER_PEAK_DB = -7
# a few ms of fade at both ends (the tail one through areverse), so no sound starts or stops on a click
EDGE_FADES = ",afade=t=in:d=0.002,areverse,afade=t=in:d=0.015,areverse"
# mp3 smears a transient on the first sample onto it: start every sound after a little silence
LEAD_IN_MS = 5


def render(earshot_python, sound_id, wav, seed, weight):
    subprocess.run(
        [earshot_python, "-m", "earshot", "sfx", "render", sound_id, "-o", wav, "--seed", str(seed), "--weight", str(weight), "--peak", str(LAYER_PEAK_DB), "--sr", "44100"],
        check=True,
        stdout=subprocess.DEVNULL,
    )


def mix(layers, mp3):
    inputs = []
    chains = []
    for i, (wav, delay_ms) in enumerate(layers):
        inputs += ["-i", wav]
        chains.append(f"[{i}:a]adelay={delay_ms + LEAD_IN_MS}:all=1[l{i}]")
    labels = "".join(f"[l{i}]" for i in range(len(layers)))
    # layers render at LAYER_PEAK_DB, so even overlapping ones stay under full scale after mp3 encoding
    graph = ";".join(chains) + f";{labels}amix=inputs={len(layers)}:normalize=0{EDGE_FADES}[out]"
    subprocess.run(
        ["ffmpeg", "-y", "-loglevel", "error", *inputs, "-filter_complex", graph, "-map", "[out]",
         "-ac", "1", "-ar", "44100", "-codec:a", "libmp3lame", "-q:a", "4", mp3],
        check=True,
    )


def main():
    earshot_python = os.environ.get("EARSHOT_PYTHON")
    if not earshot_python:
        sys.exit("Set EARSHOT_PYTHON to the python of an Earshot install (e.g. ~/tools/earshot/.venv/bin/python).")
    os.makedirs(OUT, exist_ok=True)
    with tempfile.TemporaryDirectory() as work:
        for name, variants in SOUNDS.items():
            for index, layers in enumerate(variants, start=1):
                rendered = []
                for layer_index, (sound_id, delay_ms, weight, seed) in enumerate(layers):
                    wav = os.path.join(work, f"{name}_{index}_{layer_index}.wav")
                    render(earshot_python, sound_id, wav, seed, weight)
                    rendered.append((wav, delay_ms))
                mp3 = os.path.join(OUT, f"{name}_{index}.mp3")
                mix(rendered, mp3)
                print("sfx", os.path.relpath(mp3, HERE))


main()
