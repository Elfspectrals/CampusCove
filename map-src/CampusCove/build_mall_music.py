import array
import math
import os
import random
import subprocess
import tempfile
import wave

# Background music of the Cove Parkview Mall walkways: a bright, easy lounge loop (vibraphone chords and melody,
# round bass, shaker and rim, a thin string pad). Same pure-Python synthesis as build_threads_music.py, seamless
# loop (the room tail wraps around). The front plays it non-positional and low while the player walks the mall
# (GameView: mallMusic), not inside the shops.

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.normpath(os.path.join(HERE, "..", "..", "front", "public", "assets", "music", "cove_mall.mp3"))

RATE = 44100
BPM = 104
BEAT = 60.0 / BPM
BAR = 4 * BEAT
# (bass, chord voicing) per bar: Cmaj9 | Am9 | Dm9 | G13, played four times
PROGRESSION = [
    (48, [60, 64, 67, 71, 74]),
    (45, [60, 64, 67, 71, 72]),
    (50, [60, 62, 65, 69, 72]),
    (43, [59, 62, 65, 69, 72]),
]
ROUNDS = 4
MELODY = [72, 74, 76, 79, 81, 84, 86]
LENGTH = int(ROUNDS * len(PROGRESSION) * BAR * RATE)

rng = random.Random(11)
mix = array.array("f", [0.0]) * LENGTH


def hz(midi):
    return 440.0 * 2 ** ((midi - 69) / 12)


def add(start_s, samples):
    start = int(start_s * RATE)
    for i, v in enumerate(samples):
        mix[(start + i) % LENGTH] += v


def vibes(midi, dur, gain):
    f = hz(midi)
    n = int((dur + 1.2) * RATE)
    w = 2 * math.pi * f / RATE
    trem = 2 * math.pi * 5.5 / RATE
    out = [0.0] * n
    for i in range(n):
        t = i / RATE
        env = math.exp(-t * 2.2) * (1 if t < dur else math.exp(-(t - dur) * 5))
        shimmer = 0.85 + 0.15 * math.sin(trem * i)
        out[i] = gain * env * shimmer * (math.sin(w * i) + 0.35 * math.exp(-t * 6) * math.sin(4 * w * i) + 0.08 * math.sin(10 * w * i) * math.exp(-t * 9))
    return out


def bass(midi, dur, gain):
    f = hz(midi)
    n = int((dur + 0.25) * RATE)
    w = 2 * math.pi * f / RATE
    out = [0.0] * n
    for i in range(n):
        t = i / RATE
        env = min(1.0, t / 0.015) * math.exp(-t * 1.4) * (1 if t < dur else math.exp(-(t - dur) * 14))
        out[i] = gain * env * (math.sin(w * i) + 0.2 * math.sin(2 * w * i) + 0.05 * math.sin(3 * w * i))
    return out


def strings(notes, dur, gain):
    n = int(dur * RATE)
    out = [0.0] * n
    for midi in notes:
        for detune in (-0.005, 0.0, 0.005):
            w = 2 * math.pi * hz(midi) * (1 + detune) / RATE
            for i in range(n):
                t = i / RATE
                env = min(1.0, t / 0.9, (dur - t) / 0.8)
                out[i] += gain * env * (math.sin(w * i) + 0.4 * math.sin(2 * w * i) + 0.15 * math.sin(3 * w * i))
    return out


def shaker(gain, length=0.09):
    n = int(length * RATE)
    out = [0.0] * n
    hp_prev = 0.0
    prev = 0.0
    for i in range(n):
        x = rng.uniform(-1, 1)
        hp = x - prev + 0.6 * hp_prev
        prev, hp_prev = x, hp
        out[i] = gain * hp * math.exp(-i / RATE * 45)
    return out


def rim(gain):
    n = int(0.06 * RATE)
    w = 2 * math.pi * 820 / RATE
    return [gain * math.exp(-i / RATE * 60) * (math.sin(w * i) + 0.5 * rng.uniform(-1, 1)) for i in range(n)]


for r in range(ROUNDS):
    for b, (root, chord) in enumerate(PROGRESSION):
        t0 = (r * len(PROGRESSION) + b) * BAR
        for k, note in enumerate(chord):
            add(t0 + BEAT * 0.5 + k * 0.018, vibes(note, BEAT * 1.4, 0.05))
            add(t0 + BEAT * 2.5 + k * 0.018, vibes(note, BEAT * 1.2, 0.038))
        add(t0, bass(root, BEAT * 0.9, 0.2))
        add(t0 + BEAT * 1.5, bass(root, BEAT * 0.4, 0.14))
        add(t0 + BEAT * 2, bass(root + 7, BEAT * 0.9, 0.17))
        add(t0 + BEAT * 3.5, bass(root + 12 if b % 2 else root + 5, BEAT * 0.4, 0.13))
        add(t0, strings(chord[1:4], BAR, 0.006))
        for step in range(8):
            add(t0 + step * BEAT / 2, shaker(0.05 if step % 2 == 0 else 0.03))
        for beat in (1, 3):
            add(t0 + beat * BEAT, rim(0.06))
        if r >= 1:
            steps = sorted(rng.sample(range(8), 3 if r < 3 else 4))
            for step in steps:
                add(t0 + step * BEAT / 2 + 0.01, vibes(rng.choice(MELODY), BEAT * 0.9, 0.07))

wet = array.array("f", [0.0]) * LENGTH
for delay_ms, feedback in ((23.3, 0.72), (31.9, 0.7), (37.3, 0.68), (44.9, 0.66)):
    d = int(delay_ms * RATE / 1000)
    buf = array.array("f", [0.0]) * d
    pos = 0
    for warm in (True, False):
        for i in range(LENGTH):
            y = buf[pos]
            buf[pos] = mix[i] + y * feedback
            pos = (pos + 1) % d
            if not warm:
                wet[i] += y * 0.1
lp = 0.0
peak = 0.0
for i in range(LENGTH):
    lp += 0.42 * (mix[i] + wet[i] - lp)
    mix[i] = lp
    peak = max(peak, abs(lp))
scale = 0.5 / peak

os.makedirs(os.path.dirname(OUT), exist_ok=True)
with tempfile.TemporaryDirectory() as work:
    wav_path = os.path.join(work, "cove_mall.wav")
    pcm = array.array("h", (int(max(-1.0, min(1.0, v * scale)) * 32767) for v in mix))
    with wave.open(wav_path, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(RATE)
        w.writeframes(pcm.tobytes())
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", wav_path, "-codec:a", "libmp3lame", "-q:a", "6", OUT], check=True)
print("music", os.path.relpath(OUT, HERE), f"{LENGTH / RATE:.1f}s")
