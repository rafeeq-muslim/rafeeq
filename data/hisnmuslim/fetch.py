#!/usr/bin/env python3
"""Fetch Hisn al-Muslim (حصن المسلم) data from the public hisnmuslim.com API.

Saves every JSON file byte-for-byte as served (text is never modified), under
raw/<lang>/. Audio is optional (--audio) and goes to audio/, which is
git-ignored: the repo keeps only text and the audio URLs inside the JSON.

Usage:
    python data/hisnmuslim/fetch.py            # text only (ar, en)
    python data/hisnmuslim/fetch.py --audio    # also download per-dhikr MP3s
"""
import json
import re
import subprocess
import sys
import time
from pathlib import Path

BASE = "https://www.hisnmuslim.com/api"
HERE = Path(__file__).resolve().parent
LANGS = {"ar": "العربية", "en": "English"}


def get(url, tries=6):
    # curl uses the system certificate store, which some Python installs lack.
    url = url.replace("http://", "https://")
    for attempt in range(tries):
        r = subprocess.run(
            ["curl", "-sSfL", "--max-time", "120", "-A", "rafeeq-fetch/1.0", url],
            capture_output=True,
        )
        if r.returncode == 0:
            return r.stdout
        time.sleep(2 ** attempt)  # the server drops bursts of requests
    raise RuntimeError(f"failed after {tries} tries: {url}")


def get_cached(url, path):
    if path.exists():
        return path.read_bytes()
    data = get(url)
    save(path, data)
    time.sleep(0.5)
    return data


def load(raw):
    """Parse a served file without changing what is saved on disk.

    Known source defects: raw tabs inside strings (strict=False), and en/126.json
    whose chapter-title key lacks its closing quote (repaired in memory only).
    """
    text = raw.decode("utf-8-sig")
    try:
        return json.loads(text, strict=False)
    except json.JSONDecodeError:
        fixed = re.sub(r'^(\s*"[^"\r\n]*):\s*$', r'\1":', text, count=1, flags=re.M)
        return json.loads(fixed, strict=False)


def save(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(data)


def main():
    with_audio = "--audio" in sys.argv
    index = get(f"{BASE}/husn.json")
    save(HERE / "raw" / "husn.json", index)
    audio_urls = set()
    for lang, key in LANGS.items():
        chapters_raw = get(f"{BASE}/{lang}/husn_{lang}.json")
        save(HERE / "raw" / lang / f"husn_{lang}.json", chapters_raw)
        chapters = load(chapters_raw)[key]
        for ch in chapters:
            raw = get_cached(ch["TEXT"], HERE / "raw" / lang / f"{ch['ID']}.json")
            audio_urls.add(ch["AUDIO_URL"])
            for items in load(raw).values():
                for item in items:
                    if item.get("AUDIO"):
                        audio_urls.add(item["AUDIO"])
        print(f"{lang}: {len(chapters)} chapters")
    print(f"audio files referenced: {len(audio_urls)}")
    if with_audio:
        failed = []
        for url in sorted(audio_urls):
            name = url.rsplit("/audio/", 1)[-1]
            if name.rsplit("/", 1)[-1].startswith("."):  # source has links with no file name
                failed.append(url)
                continue
            try:
                get_cached(url, HERE / "audio" / name)
            except RuntimeError:
                failed.append(url)
        print("audio downloaded to", HERE / "audio")
        for url in failed:
            print("  not downloaded:", url)


if __name__ == "__main__":
    main()
