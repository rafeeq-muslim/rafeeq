"""PLT-11 R5: the size of every whole-surah recitation file, measured with HEAD.

Adds `sizes` (surah number -> bytes, from Content-Length) to each recitation in
content/discover/recitations.json, so the app can show a surah's size before
it plays (PLT-11 R5) and the download center can show it before a download
(PLT-12). Read-only HEAD requests; nothing is downloaded.

Usage: python3 content/tools/recitation_sizes.py
Run it again after `python -m app.knowledge.recitation --fetch` (that rewrites
the file without sizes).
"""

import json
import os
import sys
import urllib.request
from concurrent.futures import ThreadPoolExecutor

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FILE = os.path.join(ROOT, "discover", "recitations.json")


def head_size(url: str) -> int | None:
    req = urllib.request.Request(url, method="HEAD", headers={"User-Agent": "Rafeeq size check (PLT-11)"})
    for _ in range(3):
        try:
            with urllib.request.urlopen(req, timeout=30) as r:
                n = r.headers.get("Content-Length")
                return int(n) if n and n.isdigit() else None
        except OSError:
            continue
    return None


def main() -> int:
    with open(FILE, encoding="utf-8") as f:
        data = json.load(f)
    missing = []
    for rec in data["recitations"]:
        suras = rec["suras"]
        with ThreadPoolExecutor(8) as pool:
            sizes = dict(zip(suras, pool.map(head_size, suras.values())))
        missing += [f"{rec['id']} sura {s}" for s, n in sizes.items() if n is None]
        rec["sizes"] = {s: n for s, n in sorted(sizes.items(), key=lambda kv: int(kv[0])) if n is not None}
        total = sum(rec["sizes"].values())
        print(f"{rec['id']}: {len(rec['sizes'])}/{len(suras)} suras, {total / 1e6:,.1f} MB")
    with open(FILE, "w", encoding="utf-8") as f:
        f.write(json.dumps(data, ensure_ascii=False, indent=1) + "\n")
    if missing:
        print("no size for: " + ", ".join(missing), file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
