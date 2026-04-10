#!/usr/bin/env python3
"""Generate game music tracks via Google Lyria 3 API."""

import json
import base64
import os
import subprocess
import time

API_KEY = os.environ.get("GEMINI_API_KEY", "")
OUTPUT_DIR = os.path.join(os.path.dirname(__file__), "..", "client", "public", "audio", "music")

TRACKS = [
    {
        "id": "victory",
        "model": "lyria-3-clip-preview",
        "prompt": "Compose a short victory fanfare for a retro JRPG, played after winning a battle. Style: 16-bit era Super Nintendo, triumphant and celebratory. Bright brass-like synth fanfare, ascending melody, resolving on a triumphant major chord. C major. 120 BPM. Should feel like a reward and celebration. Single play with a clear ending, do not loop. No vocals. 10 seconds."
    },
    {
        "id": "defeat",
        "model": "lyria-3-clip-preview",
        "prompt": "Compose a short game over defeat theme for a retro JRPG. Style: 16-bit era, somber and final. Descending melody on synth strings, ending on a low sustained minor chord. D minor. Slow tempo 60 BPM. Should feel like the end of a journey. Single play with a fade out ending. No vocals. 10 seconds."
    },
    {
        "id": "levelup",
        "model": "lyria-3-clip-preview",
        "prompt": "Compose a very short level up celebration jingle for a retro 16-bit JRPG. Quick ascending chiptune arpeggio, bright and rewarding, like gaining power. C major resolving to G major. Very fast, energetic. 3 to 4 seconds total. No vocals."
    },
    {
        "id": "inn",
        "model": "lyria-3-clip-preview",
        "prompt": "Compose a short rest and healing jingle for a retro JRPG inn. Style: 16-bit era. Gentle harp or bell arpeggio, warm and soothing, like waking up refreshed after a good night's rest. F major. Peaceful. 5 seconds. No vocals."
    },
    {
        "id": "quest",
        "model": "lyria-3-clip-preview",
        "prompt": "Compose a short quest complete fanfare for a retro JRPG. Style: 16-bit era. Brief triumphant melody, slightly different from the victory fanfare, more of an achievement feel. Bright synth brass. E-flat major. 5 seconds. No vocals."
    },
    {
        "id": "title",
        "model": "lyria-3-pro-preview",
        "prompt": "Compose an original instrumental JRPG title screen theme. Style: 16-bit era Super Nintendo RPG, similar in feel to classic Japanese role-playing games like Chrono Trigger or Final Fantasy VI but completely original. Warm, inviting, slightly epic. Use synthesized orchestral instruments including strings, flute, harp, and soft timpani. Key of D major. Moderate tempo around 100 BPM. Should feel like the beginning of a grand adventure, nostalgic yet hopeful. The ending should transition smoothly back to the beginning for seamless looping. No vocals. 90 seconds."
    },
    {
        "id": "overworld",
        "model": "lyria-3-pro-preview",
        "prompt": "Compose an original instrumental overworld exploration theme for a retro JRPG. Style: 16-bit era, adventurous and hopeful. Imagine walking across green fields, through forests, and past villages on an epic quest. Bright melody on synth flute or lead, supported by warm pad strings and light snare percussion. Key of G major. Walking tempo around 110 BPM. Uplifting and optimistic. Must loop seamlessly at the end. No vocals. 2 minutes."
    },
    {
        "id": "battle",
        "model": "lyria-3-pro-preview",
        "prompt": "Compose an original instrumental battle theme for a turn-based JRPG. Style: 16-bit era, intense and driving. Fast tempo 150 to 160 BPM. Driving synth bass line, urgent string-like pads, aggressive synth lead melody with fast arpeggios, punchy electronic drums. A minor key. Should feel like a dangerous fight that demands quick thinking and strategy. Must loop seamlessly. No vocals. 90 seconds."
    },
    {
        "id": "boss",
        "model": "lyria-3-pro-preview",
        "prompt": "Compose an original instrumental boss battle theme for a retro JRPG final boss encounter. Style: 16-bit era but grander and more dramatic than normal battles. Open with a dramatic organ-like synth or heavy chord intro, then erupt into fast aggressive combat music. Tempo 160 to 170 BPM. D minor key. Heavy driving drums, ominous deep synth pads, racing arpeggiated synth lines. Must feel desperate, epic, and climactic. Loop seamlessly at the end. No vocals. 2 minutes."
    },
    {
        "id": "shop",
        "model": "lyria-3-clip-preview",
        "prompt": "Compose an instrumental shop theme for a retro JRPG. Style: 16-bit era. Cheerful, bouncy, slightly jazzy. Like browsing wares in a cozy village shop. Plucky synth melody, light bass, gentle percussion. C major. 120 BPM. Pleasant background music. Loop seamlessly. No vocals. 30 seconds."
    },
]


def generate_track(track):
    """Generate a single music track via Lyria API."""
    model = track["model"]
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={API_KEY}"

    payload = {
        "contents": [{"parts": [{"text": track["prompt"]}]}],
        "generationConfig": {"responseModalities": ["AUDIO"]}
    }

    req_file = f"/tmp/lyria-req-{track['id']}.json"
    resp_file = f"/tmp/lyria-resp-{track['id']}.json"

    with open(req_file, "w") as f:
        json.dump(payload, f)

    result = subprocess.run([
        "curl", "-s", "-o", resp_file, "-w", "%{http_code}",
        "-X", "POST", url,
        "-H", "Content-Type: application/json",
        "-d", f"@{req_file}"
    ], capture_output=True, text=True, timeout=180)

    status = result.stdout.strip()
    if status != "200":
        print(f"  ERROR: HTTP {status}")
        with open(resp_file) as f:
            try:
                d = json.load(f)
                if "error" in d:
                    print(f"  {d['error'].get('message', '')[:200]}")
            except:
                pass
        return False

    with open(resp_file) as f:
        data = json.load(f)

    if "error" in data:
        print(f"  ERROR: {data['error'].get('message', '')[:200]}")
        return False

    parts = data.get("candidates", [{}])[0].get("content", {}).get("parts", [])
    for part in parts:
        if "inlineData" in part:
            audio_data = base64.b64decode(part["inlineData"]["data"])
            mime = part["inlineData"].get("mimeType", "audio/wav")
            ext = "wav" if "wav" in mime else "mp3" if "mp3" in mime else "ogg" if "ogg" in mime else "wav"

            output_path = os.path.join(OUTPUT_DIR, f"{track['id']}.{ext}")
            with open(output_path, "wb") as f:
                f.write(audio_data)
            print(f"  Saved: {output_path} ({len(audio_data) // 1024} KB, {mime})")
            return True

    print("  ERROR: No audio data in response")
    # Check for text response
    for part in parts:
        if "text" in part:
            print(f"  Model said: {part['text'][:200]}")
    return False


def main():
    if not API_KEY:
        print("ERROR: GEMINI_API_KEY not set")
        return

    os.makedirs(OUTPUT_DIR, exist_ok=True)
    print(f"Generating {len(TRACKS)} music tracks...\n")

    success = 0
    for track in TRACKS:
        print(f"[{track['id']}] ({track['model']})...")
        if generate_track(track):
            success += 1
        # Rate limit: wait between requests
        time.sleep(2)

    print(f"\nDone: {success}/{len(TRACKS)} tracks generated.")


if __name__ == "__main__":
    main()
