#!/usr/bin/env python3
"""Add UI strings to the three dictionaries at once.

Usage: python3 scripts/i18n-add.py keys.json
keys.json: {"key": {"ar": "...", "en": "...", "tl": "..."}}
Inserts before the closing `}` of each dictionary; existing keys are replaced.
"""
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent / "src/app/i18n"
new = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))
for lang in ("ar", "en", "tl"):
    f = ROOT / f"{lang}.ts"
    s = f.read_text(encoding="utf-8")
    for key, vals in new.items():
        line = f"  {json.dumps(key)}: {json.dumps(vals[lang], ensure_ascii=False)},"
        pat = re.compile(rf'^  {re.escape(json.dumps(key))}: .*,$', re.M)
        if pat.search(s):
            s = pat.sub(lambda _: line, s)
        else:
            i = s.rstrip().rfind("}")
            s = s[:i].rstrip() + "\n" + line + "\n" + s[i:]
    f.write_text(s, encoding="utf-8")
print(f"{len(new)} keys")
