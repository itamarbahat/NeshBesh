"""
generate-sfx.py — fallback Python placeholder SFX generator.

Mirrors the DSP in `generate-sfx.ts` so projects without Node tooling can
regenerate the placeholder WAVs. Both scripts must produce comparable output.

Usage:
    python scripts/generate-sfx.py
"""
import math
import os
import random
import struct
import sys

SAMPLE_RATE = 44100
TWO_PI = math.pi * 2


def write_wav_mono(samples, out_path):
    n = len(samples)
    data_bytes = n * 2
    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    with open(out_path, "wb") as f:
        f.write(b"RIFF")
        f.write(struct.pack("<I", 36 + data_bytes))
        f.write(b"WAVE")
        f.write(b"fmt ")
        f.write(struct.pack("<I", 16))
        f.write(struct.pack("<H", 1))            # PCM
        f.write(struct.pack("<H", 1))            # mono
        f.write(struct.pack("<I", SAMPLE_RATE))
        f.write(struct.pack("<I", SAMPLE_RATE * 2))
        f.write(struct.pack("<H", 2))
        f.write(struct.pack("<H", 16))
        f.write(b"data")
        f.write(struct.pack("<I", data_bytes))
        for s in samples:
            v = max(-1.0, min(1.0, s))
            f.write(struct.pack("<h", int(round(v * 32767))))


def biquad_bandpass(input_signal, center_hz, q):
    w0 = TWO_PI * center_hz / SAMPLE_RATE
    cosw0 = math.cos(w0)
    sinw0 = math.sin(w0)
    alpha = sinw0 / (2 * q)
    b0, b1, b2 = alpha, 0, -alpha
    a0, a1, a2 = 1 + alpha, -2 * cosw0, 1 - alpha
    out = [0.0] * len(input_signal)
    x1 = x2 = y1 = y2 = 0.0
    for i, x0 in enumerate(input_signal):
        y0 = (b0 / a0) * x0 + (b1 / a0) * x1 + (b2 / a0) * x2 - (a1 / a0) * y1 - (a2 / a0) * y2
        out[i] = y0
        x2, x1 = x1, x0
        y2, y1 = y1, y0
    return out


def make_shake_loop():
    length = int(SAMPLE_RATE * 0.2)
    noise = [(random.random() * 2 - 1) * 0.9 for _ in range(length)]
    filtered = biquad_bandpass(noise, 2500.0, 2.0)
    xfade = int(SAMPLE_RATE * 0.005)
    for i in range(xfade):
        t = i / xfade
        filtered[i] = filtered[i] * t + filtered[length - xfade + i] * (1 - t)
    out = filtered[: length - xfade]
    peak = max((abs(x) for x in out), default=0.0)
    if peak > 0:
        g = 0.6 / peak
        out = [x * g for x in out]
    return out


def make_land_thud():
    length = int(SAMPLE_RATE * 0.25)
    out = [0.0] * length
    f = 80.0
    for i in range(length):
        t = i / SAMPLE_RATE
        env = math.exp(-t * 18)
        tone = math.sin(TWO_PI * f * t) * env
        click = (random.random() * 2 - 1) * math.exp(-t * 80) * 0.3
        out[i] = tone * 0.85 + click
    attack = int(SAMPLE_RATE * 0.005)
    for i in range(attack):
        out[i] *= i / attack
    return out


def make_checker_click():
    length = int(SAMPLE_RATE * 0.08)
    out = [0.0] * length
    f = 1800.0
    for i in range(length):
        t = i / SAMPLE_RATE
        env = math.exp(-t * 60)
        tone = math.sin(TWO_PI * f * t) * env
        noise = (random.random() * 2 - 1) * math.exp(-t * 200) * 0.4
        out[i] = tone * 0.6 + noise
    return out


def main():
    here = os.path.dirname(os.path.abspath(__file__))
    out_dir = os.path.join(here, "..", "assets", "sfx")
    targets = [
        ("dice-shake-loop.wav", make_shake_loop()),
        ("dice-land.wav", make_land_thud()),
        ("checker-click.wav", make_checker_click()),
    ]
    random.seed(0xBE5)  # deterministic placeholders
    for name, samples in targets:
        path = os.path.normpath(os.path.join(out_dir, name))
        write_wav_mono(samples, path)
        print(f"wrote {path} ({len(samples)} samples)", file=sys.stderr)


if __name__ == "__main__":
    main()
