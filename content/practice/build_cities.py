#!/usr/bin/env python3
"""Build the offline city list for PRC-01 (frontend/src/app/practice/cities.json).

Source: GeoNames (CC BY 4.0, https://www.geonames.org), `cities15000.txt` and
the per-country `alternatenames/<CC>.zip` files for Arabic and Tagalog names.
Downloaded team-side only; the app never calls GeoNames.

Kept:
- the persona countries (docs/personas.md: KSA and the Gulf, the Philippines,
  Ethiopia, Eritrea, Sri Lanka, India, Nepal): every city of 100,000+ people;
- other countries with many Muslims or likely readers: cities of 500,000+;
- every national capital in those countries;
- never a city above 48° N or S (PRC-01 «خارج النطاق», owner decision 2026-10-05).

Usage: python3 content/practice/build_cities.py <dir with cities15000.txt and alternatenames/*.zip>
"""

import io
import json
import sys
import zipfile
from pathlib import Path

PERSONA = {"SA", "AE", "KW", "QA", "BH", "OM", "PH", "ET", "ER", "LK", "IN", "NP"}
OTHERS = set(
    "YE IQ SY LB PS JO EG SD MA DZ TN LY TR PK BD AF ID MY SG NG KE TZ UG SO GH SN ZA US CA AU FR ES IT BR MX".split()
)
MAX_LAT = 48.0
OUT = Path(__file__).resolve().parents[2] / "frontend/src/app/practice/cities.json"


def alt_names(src: Path, cc: str) -> dict[int, dict[str, str]]:
    """geonameid -> {lang: name}, preferring preferred/short, never historic or colloquial."""
    z = src / "alternatenames" / f"{cc}.zip"
    if not z.exists():
        z = src / f"{cc}.zip"
    if not z.exists():
        return {}
    best: dict[tuple[int, str], tuple[int, str]] = {}
    with zipfile.ZipFile(z) as zf, zf.open(f"{cc}.txt") as f:
        for line in io.TextIOWrapper(f, encoding="utf-8"):
            p = line.rstrip("\n").split("\t")
            if len(p) < 8 or p[2] not in ("ar", "tl"):
                continue
            if (len(p) > 7 and p[7] == "1") or (len(p) > 6 and p[6] == "1"):  # historic / colloquial
                continue
            score = (2 if p[4] == "1" else 0) + (1 if p[5] == "1" else 0)
            key = (int(p[1]), p[2])
            if key not in best or score > best[key][0]:
                best[key] = (score, p[3].strip())
    out: dict[int, dict[str, str]] = {}
    for (gid, lang), (_, name) in best.items():
        out.setdefault(gid, {})[lang] = name
    return out


def main(src: Path) -> None:
    rows = []
    for line in (src / "cities15000.txt").read_text(encoding="utf-8").splitlines():
        p = line.split("\t")
        gid, name, ascii_name, lat, lng, fcode, cc, pop, tz = (
            int(p[0]),
            p[1],
            p[2],
            float(p[4]),
            float(p[5]),
            p[7],
            p[8],
            int(p[14] or 0),
            p[17],
        )
        if cc not in PERSONA | OTHERS or abs(lat) > MAX_LAT or not tz:
            continue
        floor = 100_000 if cc in PERSONA else 500_000
        if pop < floor and fcode != "PPLC":
            continue
        rows.append({"id": gid, "en": name, "ascii": ascii_name, "c": cc, "lat": round(lat, 5), "lng": round(lng, 5), "tz": tz, "p": pop, "cap": fcode == "PPLC"})
    names: dict[int, dict[str, str]] = {}
    for cc in sorted({r["c"] for r in rows}):
        names.update(alt_names(src, cc))
    cities = []
    for r in sorted(rows, key=lambda r: -r["p"]):
        n = {"en": r["en"]}
        n.update({k: v for k, v in names.get(r["id"], {}).items() if v})
        if r["ascii"] != r["en"]:
            n["ascii"] = r["ascii"]
        city = {"id": str(r["id"]), "n": n, "c": r["c"], "lat": r["lat"], "lng": r["lng"], "tz": r["tz"], "p": r["p"]}
        if r["cap"]:
            city["cap"] = 1
        cities.append(city)
    OUT.write_text(json.dumps(cities, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    print(f"{len(cities)} cities → {OUT} ({OUT.stat().st_size // 1024} KB)")


if __name__ == "__main__":
    main(Path(sys.argv[1]))
