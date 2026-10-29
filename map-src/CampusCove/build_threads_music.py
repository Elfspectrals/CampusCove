import array
import math
import os
import random
import subprocess
import tempfile
import wave

# Background music of the Cove Threads clothing store: a quiet lo-fi loop (soft electric piano, bass, pad, brushes
# and a few bell notes). Pure Python synthesis, so it needs nothing but ffmpeg; the loop is seamless (the reverb
# tail wraps around to the start). The front plays it non-positional and low (game/storeMusic.ts).

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.normpath(os.path.join(HERE, "..", "..", "front", "public", "assets", "music", "cove_threads.mp3"))

RATE = 44100
BPM = 72
BEAT = 60.0 / BPM
BAR = 4 * BEAT
# (bass, chord voicing) per bar: Fmaj7 | Am7 | Bb6/9 | C9sus4, played four times
PROGRESSION = [
    (41, [53, 57, 60, 64]),
    (45, [52, 55, 57, 60]),
    (46, [50, 53, 55, 60]),
    (48, [53, 55, 58, 62]),
]
ROUNDS = 4
PENTATONIC = [65, 67, 69, 72, 74, 77]
LENGTH = int(ROUNDS * len(PROGRESSION) * BAR * RATE)

rng = random.Random(7)
mix = array.array("f", [0.0]) * LENGTH


def hz(midi):
    return 440.0 * 2 ** ((midi - 69) / 12)


def add(start_s, samples):
    """Adds a rendered note at start_s, wrapping past the end so the loop has no seam."""
    start = int(start_s * RATE)
    for i, v in enumerate(samples):
        mix[(start + i) % LENGTH] += v


def epiano(midi, dur, gain):
    f = hz(midi)
    n = int((dur + 1.5) * RATE)
    out = [0.0] * n
    w = 2 * math.pi * f / RATE
    for i in range(n):
        t = i / RATE
        env = math.exp(-t * 1.6) * (1 if t < dur else math.exp(-(t - dur) * 6))
        bell = math.exp(-t * 7) * 0.25
        out[i] = gain * env * (math.sin(w * i + bell * math.sin(w * 7 * i)) + 0.18 * math.sin(2 * w * i))
    return out


def bass(midi, dur, gain):
    f = hz(midi)
    n = int((dur + 0.3) * RATE)
    w = 2 * math.pi * f / RATE
    out = [0.0] * n
    for i in range(n):
        t = i / RATE
        env = min(1.0, t / 0.02) * math.exp(-t * 0.9) * (1 if t < dur else math.exp(-(t - dur) * 12))
        out[i] = gain * env * (math.sin(w * i) + 0.12 * math.sin(2 * w * i))
    return out


def pad(notes, dur, gain):
    n = int(dur * RATE)
    out = [0.0] * n
    for midi in notes:
        for detune in (-0.004, 0.004):
            w = 2 * math.pi * hz(midi + 12) * (1 + detune) / RATE
            for i in range(n):
                t = i / RATE
                env = min(1.0, t / 1.2, (dur - t) / 1.0)
                out[i] += gain * env * (math.sin(w * i) + 0.3 * math.sin(2 * w * i))
    return out


def brush(gain, length=0.18):
    n = int(length * RATE)
    out = [0.0] * n
    lp = 0.0
    for i in range(n):
        lp += 0.35 * (rng.uniform(-1, 1) - lp)
        out[i] = gain * lp * math.exp(-i / RATE * 22)
    return out


def bell(midi, gain):
    f = hz(midi)
    n = int(2.2 * RATE)
    w = 2 * math.pi * f / RATE
    return [gain * math.exp(-i / RATE * 2.4) * (math.sin(w * i) + 0.2 * math.exp(-i / RATE * 9) * math.sin(3 * w * i)) for i in range(n)]


for r in range(ROUNDS):
    for b, (root, chord) in enumerate(PROGRESSION):
        t0 = (r * len(PROGRESSION) + b) * BAR
        for k, note in enumerate(chord):
            add(t0 + k * 0.025, epiano(note, BEAT * 2.2, 0.075))
            add(t0 + BEAT * 2.5 + k * 0.02, epiano(note, BEAT * 1.2, 0.045))
        add(t0, bass(root, BEAT * 1.8, 0.22))
        add(t0 + BEAT * 2, bass(root + 7 if b % 2 else root, BEAT * 1.6, 0.18))
        add(t0, pad(chord, BAR, 0.008))
        for beat in range(4):
            add(t0 + beat * BEAT + BEAT / 2, brush(0.025, 0.08))
            if beat % 2:
                add(t0 + beat * BEAT, brush(0.07))
        if r % 2:
            for step in sorted(rng.sample(range(8), 3)):
                add(t0 + step * BEAT / 2, bell(rng.choice(PENTATONIC), 0.05))

# soft room (Schroeder combs) and a gentle low-pass for the lo-fi feel
wet = array.array("f", [0.0]) * LENGTH
for delay_ms, feedback in ((29.7, 0.78), (37.1, 0.76), (41.1, 0.74), (43.7, 0.72)):
    d = int(delay_ms * RATE / 1000)
    buf = array.array("f", [0.0]) * d
    pos = 0
    # the first pass only fills the comb, so the second one starts with the tail of the loop's end
    for warm in (True, False):
        for i in range(LENGTH):
            y = buf[pos]
            buf[pos] = mix[i] + y * feedback
            pos = (pos + 1) % d
            if not warm:
                wet[i] += y * 0.12
lp = 0.0
peak = 0.0
for i in range(LENGTH):
    lp += 0.28 * (mix[i] + wet[i] - lp)
    mix[i] = lp
    peak = max(peak, abs(lp))
scale = 0.5 / peak

os.makedirs(os.path.dirname(OUT), exist_ok=True)
with tempfile.TemporaryDirectory() as work:
    wav_path = os.path.join(work, "cove_threads.wav")
    pcm = array.array("h", (int(max(-1.0, min(1.0, v * scale)) * 32767) for v in mix))
    with wave.open(wav_path, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(RATE)
        w.writeframes(pcm.tobytes())
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", wav_path, "-codec:a", "libmp3lame", "-q:a", "6", OUT], check=True)
print("music", os.path.relpath(OUT, HERE), f"{LENGTH / RATE:.1f}s")
