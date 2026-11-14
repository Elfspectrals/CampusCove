import math
import os
import random
import struct
import subprocess
import tempfile
import wave

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.normpath(os.path.join(HERE, "..", "..", "front", "public", "assets", "sfx", "gym"))
RATE = 44100
PEAK = 0.89


def envelope(t, attack, decay):
    rise = min(1.0, t / attack) if attack > 0 else 1.0
    return rise * math.exp(-t / decay)


def basketball_bounce(seconds):
    rnd = random.Random(3)
    out, body, shell = [], 0.0, 0.0
    for i in range(int(seconds * RATE)):
        t = i / RATE
        body += 2 * math.pi * (120 + 60 * math.exp(-t / 0.02)) / RATE
        shell += 2 * math.pi * 520 / RATE
        slap = (rnd.random() * 2 - 1) * envelope(t, 0.0004, 0.003)
        out.append(math.sin(body) * envelope(t, 0.002, 0.05) + 0.45 * math.sin(shell) * envelope(t, 0.001, 0.07) + 0.6 * slap)
    return out


def thump(seconds, f_start, f_end, body_decay, slap, slap_decay, seed):
    rnd = random.Random(seed)
    out, phase, low = [], 0.0, 0.0
    for i in range(int(seconds * RATE)):
        t = i / RATE
        freq = f_end + (f_start - f_end) * math.exp(-t / 0.03)
        phase += 2 * math.pi * freq / RATE
        body = math.sin(phase) * envelope(t, 0.002, body_decay)
        noise = rnd.random() * 2 - 1
        low += 0.35 * (noise - low)
        out.append(body + slap * (noise - low) * envelope(t, 0.0005, slap_decay))
    return out


def write_wav(path, samples):
    peak = max(abs(s) for s in samples) or 1.0
    with wave.open(path, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(RATE)
        w.writeframes(b"".join(struct.pack("<h", int(s / peak * PEAK * 32767)) for s in samples))


SOUNDS = {
    "bounce": lambda: basketball_bounce(0.3),
    "kick": lambda: thump(0.25, 160, 85, 0.035, 1.1, 0.009, 5),
}


def main():
    os.makedirs(OUT, exist_ok=True)
    with tempfile.TemporaryDirectory() as work:
        for name, build in SOUNDS.items():
            wav = os.path.join(work, f"{name}.wav")
            write_wav(wav, build())
            mp3 = os.path.join(OUT, f"{name}.mp3")
            subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", wav, "-ac", "1", "-ar", "44100", "-codec:a", "libmp3lame", "-q:a", "4", mp3], check=True)
            print("sfx", os.path.relpath(mp3, HERE))


main()
