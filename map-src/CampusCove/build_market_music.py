import array
import math
import os
import random
import subprocess
import tempfile
import wave

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.normpath(os.path.join(HERE, "..", "..", "front", "public", "assets", "music", "town_market.mp3"))

RATE = 44100
BPM = 116
BEAT = 60.0 / BPM
BAR = 4 * BEAT
PROGRESSION = [
    (48, [60, 64, 67]),
    (43, [59, 62, 67]),
    (45, [57, 60, 64]),
    (41, [57, 60, 65]),
]
ROUNDS = 4
MELODY = [
    [(0, 72, 1), (1, 74, 1), (2, 76, 1.5), (3.5, 74, 0.5)],
    [(0, 74, 1), (1, 71, 1), (2, 67, 2)],
    [(0, 72, 1), (1, 76, 1), (2, 79, 1), (3, 76, 1)],
    [(0, 77, 1.5), (1.5, 76, 0.5), (2, 74, 1), (3, 72, 1)],
]
LENGTH = int(ROUNDS * len(PROGRESSION) * BAR * RATE)

rng = random.Random(11)
mix = array.array("f", [0.0]) * LENGTH


def hz(midi):
    return 440.0 * 2 ** ((midi - 69) / 12)


def add(start_s, samples):
    start = int(start_s * RATE)
    for i, v in enumerate(samples):
        mix[(start + i) % LENGTH] += v


def accordion(midi, dur, gain):
    f = hz(midi)
    n = int((dur + 0.08) * RATE)
    out = [0.0] * n
    for i in range(n):
        t = i / RATE
        env = min(1.0, t / 0.03) * (1 if t < dur else math.exp(-(t - dur) * 40))
        phase = 2 * math.pi * f * t + 0.004 * math.sin(2 * math.pi * 5.5 * t) * f
        out[i] = gain * env * (math.sin(phase) + 0.45 * math.sin(3 * phase) + 0.25 * math.sin(5 * phase) + 0.12 * math.sin(2.003 * phase))
    return out


def pluck(midi, dur, gain):
    period = int(RATE / hz(midi))
    buf = [rng.uniform(-1, 1) for _ in range(period)]
    n = int((dur + 0.4) * RATE)
    out = [0.0] * n
    for i in range(n):
        j = i % period
        nxt = buf[(j + 1) % period]
        out[i] = gain * buf[j]
        buf[j] = 0.497 * (buf[j] + nxt)
    return out


def bass(midi, dur, gain):
    f = hz(midi)
    n = int((dur + 0.1) * RATE)
    w = 2 * math.pi * f / RATE
    return [gain * min(1.0, i / RATE / 0.01) * math.exp(-i / RATE * 4.0) * (math.sin(w * i) + 0.2 * math.sin(2 * w * i)) for i in range(n)]


def shaker(gain, length=0.09):
    n = int(length * RATE)
    out = [0.0] * n
    hp = prev = 0.0
    for i in range(n):
        x = rng.uniform(-1, 1)
        hp = 0.85 * (hp + x - prev)
        prev = x
        out[i] = gain * hp * math.exp(-i / RATE * 45)
    return out


for r in range(ROUNDS):
    for b, (root, chord) in enumerate(PROGRESSION):
        t0 = (r * len(PROGRESSION) + b) * BAR
        for beat in range(4):
            add(t0 + beat * BEAT, bass(root + (7 if beat % 2 else 0), BEAT * 0.8, 0.08))
            for k, note in enumerate(chord):
                add(t0 + beat * BEAT + BEAT / 2 + k * 0.006, pluck(note, BEAT * 0.4, 0.07))
            add(t0 + beat * BEAT, shaker(0.05 if beat % 2 else 0.03))
            add(t0 + beat * BEAT + BEAT / 2, shaker(0.02))
        if r > 0:
            for start, note, length in MELODY[b]:
                add(t0 + start * BEAT, accordion(note if r % 2 else note - 12, length * BEAT * 0.95, 0.09))
        else:
            add(t0, accordion(chord[0], BAR * 0.95, 0.025))

wet = array.array("f", [0.0]) * LENGTH
for delay_ms, feedback in ((31.3, 0.7), (37.9, 0.68), (43.1, 0.66)):
    d = int(delay_ms * RATE / 1000)
    buf = array.array("f", [0.0]) * d
    pos = 0
    for warm in (True, False):
        for i in range(LENGTH):
            y = buf[pos]
            buf[pos] = mix[i] + y * feedback
            pos = (pos + 1) % d
            if not warm:
                wet[i] += y * 0.08
peak = max(abs(mix[i] + wet[i]) for i in range(LENGTH))
scale = 0.5 / peak

os.makedirs(os.path.dirname(OUT), exist_ok=True)
with tempfile.TemporaryDirectory() as work:
    wav_path = os.path.join(work, "town_market.wav")
    pcm = array.array("h", (int(max(-1.0, min(1.0, (mix[i] + wet[i]) * scale)) * 32767) for i in range(LENGTH)))
    with wave.open(wav_path, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(RATE)
        w.writeframes(pcm.tobytes())
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", wav_path, "-codec:a", "libmp3lame", "-q:a", "6", OUT], check=True)
print("music", os.path.relpath(OUT, HERE), f"{LENGTH / RATE:.1f}s")
