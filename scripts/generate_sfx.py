#!/usr/bin/env python3
"""Generate retro sound effects using simple waveform synthesis.

Creates 8-bit/16-bit style SFX without external dependencies.
"""

import struct
import math
import os
import random

OUTPUT_DIR = os.path.join(os.path.dirname(__file__), "..", "client", "public", "audio", "sfx")
SAMPLE_RATE = 22050


def write_wav(filename, samples, sample_rate=SAMPLE_RATE):
    """Write samples as a 16-bit mono WAV file."""
    path = os.path.join(OUTPUT_DIR, filename)
    n = len(samples)
    data = struct.pack(f"<{n}h", *[max(-32768, min(32767, int(s * 32767))) for s in samples])

    with open(path, "wb") as f:
        # WAV header
        f.write(b"RIFF")
        f.write(struct.pack("<I", 36 + len(data)))
        f.write(b"WAVE")
        f.write(b"fmt ")
        f.write(struct.pack("<IHHIIHH", 16, 1, 1, sample_rate, sample_rate * 2, 2, 16))
        f.write(b"data")
        f.write(struct.pack("<I", len(data)))
        f.write(data)

    print(f"  {filename} ({len(data) // 1024} KB)")


def square_wave(freq, duration, volume=0.3, decay=True):
    """Generate a square wave with optional decay."""
    samples = []
    n = int(SAMPLE_RATE * duration)
    for i in range(n):
        t = i / SAMPLE_RATE
        val = volume if math.sin(2 * math.pi * freq * t) > 0 else -volume
        if decay:
            val *= max(0, 1 - t / duration)
        samples.append(val)
    return samples


def noise(duration, volume=0.3, decay=True):
    """Generate white noise with decay."""
    samples = []
    n = int(SAMPLE_RATE * duration)
    for i in range(n):
        t = i / SAMPLE_RATE
        val = (random.random() * 2 - 1) * volume
        if decay:
            val *= max(0, 1 - t / duration)
        samples.append(val)
    return samples


def sweep(freq_start, freq_end, duration, volume=0.3, wave="square"):
    """Frequency sweep."""
    samples = []
    n = int(SAMPLE_RATE * duration)
    for i in range(n):
        t = i / SAMPLE_RATE
        progress = t / duration
        freq = freq_start + (freq_end - freq_start) * progress
        if wave == "square":
            val = volume if math.sin(2 * math.pi * freq * t) > 0 else -volume
        else:
            val = volume * math.sin(2 * math.pi * freq * t)
        val *= max(0, 1 - progress * 0.5)
        samples.append(val)
    return samples


def arpeggio(notes, note_dur=0.05, volume=0.3):
    """Quick arpeggio of notes."""
    samples = []
    for freq in notes:
        samples.extend(square_wave(freq, note_dur, volume, decay=False))
    # Add decay to the tail
    tail = int(len(samples) * 0.3)
    for i in range(tail):
        idx = len(samples) - tail + i
        samples[idx] *= 1 - (i / tail)
    return samples


def mix(a, b):
    """Mix two sample arrays."""
    length = max(len(a), len(b))
    result = []
    for i in range(length):
        va = a[i] if i < len(a) else 0
        vb = b[i] if i < len(b) else 0
        result.append(max(-1, min(1, va + vb)))
    return result


def main():
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    random.seed(42)  # deterministic
    print(f"Generating sound effects...\n")

    # Sword slash: quick noise burst with pitch sweep
    write_wav("slash.wav", mix(
        noise(0.15, 0.4),
        sweep(800, 200, 0.12, 0.2)
    ))

    # Spell cast: ascending sweep with shimmer
    write_wav("spell.wav", mix(
        sweep(200, 1200, 0.3, 0.25, "sine"),
        arpeggio([523, 659, 784, 1047], 0.06, 0.15)
    ))

    # Fire spell: noise burst + low rumble
    write_wav("fire.wav", mix(
        noise(0.25, 0.35),
        sweep(150, 50, 0.25, 0.3)
    ))

    # Ice spell: high shimmer + crackle
    write_wav("ice.wav", mix(
        sweep(2000, 800, 0.2, 0.2, "sine"),
        noise(0.15, 0.15)
    ))

    # Lightning: sharp crack + buzz
    write_wav("lightning.wav", mix(
        noise(0.05, 0.5),
        square_wave(120, 0.15, 0.3)
    ))

    # Heal: gentle ascending chime
    write_wav("heal.wav", arpeggio([523, 659, 784, 1047, 1319], 0.08, 0.2))

    # Critical hit: sharp impact + ring
    write_wav("crit.wav", mix(
        noise(0.05, 0.5),
        sweep(1500, 500, 0.2, 0.3, "sine")
    ))

    # Enemy hit: short thud
    write_wav("hit.wav", mix(
        noise(0.08, 0.4),
        sweep(300, 100, 0.08, 0.3)
    ))

    # Party hit: slightly different thud
    write_wav("party_hit.wav", mix(
        noise(0.1, 0.35),
        sweep(400, 150, 0.1, 0.25)
    ))

    # Miss: whoosh
    write_wav("miss.wav", sweep(600, 200, 0.15, 0.2))

    # Enemy death: descending + explosion
    write_wav("death.wav", mix(
        sweep(800, 50, 0.3, 0.3),
        noise(0.2, 0.25)
    ))

    # Menu select: quick blip
    write_wav("select.wav", square_wave(880, 0.06, 0.25, decay=False))

    # Menu cursor: softer blip
    write_wav("cursor.wav", square_wave(660, 0.04, 0.15, decay=False))

    # Door open: low creak
    write_wav("door.wav", sweep(200, 400, 0.2, 0.2))

    # Treasure: ascending chime (like finding something)
    write_wav("treasure.wav", arpeggio([440, 554, 659, 880, 1108], 0.06, 0.25))

    # Error: low buzz
    write_wav("error.wav", square_wave(150, 0.15, 0.3))

    # Encounter: dramatic sweep
    write_wav("encounter.wav", mix(
        sweep(200, 2000, 0.2, 0.3),
        noise(0.1, 0.2)
    ))

    # Flee: quick descending
    write_wav("flee.wav", sweep(1000, 200, 0.15, 0.25))

    # Save: confirming chime
    write_wav("save.wav", arpeggio([523, 659, 784, 1047], 0.1, 0.2))

    # Potion: bubble sound
    write_wav("potion.wav", mix(
        arpeggio([300, 400, 500, 600], 0.04, 0.15),
        sweep(200, 600, 0.15, 0.1, "sine")
    ))

    # Equip: metallic clank
    write_wav("equip.wav", mix(
        noise(0.04, 0.4),
        square_wave(800, 0.08, 0.25)
    ))

    print(f"\nDone! All SFX saved to {OUTPUT_DIR}")


if __name__ == "__main__":
    main()
