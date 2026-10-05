#!/usr/bin/env python3
"""Structural check for a Rafeeq feature document (docs/templates/feature.md).

Usage: python check_feature.py path/to/XXX-NN-name.md [path/to/personas.md]

Checks structure only: ID and title, header table, required sections, story
format (and persona, if personas.md is given), rules with examples in
بافتراض / عندما / فإن form, at least one error/edge example, and size.
It does not judge content quality. Exit code 0 = no blocking issues.
"""
import re
import sys
from pathlib import Path

DOMAINS = {"LRN", "MOT", "KNW", "CMP", "PRC", "PLT", "ORG"}
SECTIONS = ["القصة", "لماذا", "القواعد والأمثلة", "خارج النطاق", "أسئلة مفتوحة"]
HEADER_COLS = ["المجال", "المالك", "الأولوية", "الحالة"]


def section(text, name):
    m = re.search(rf"^##\s*{name}\s*$(.*?)(?=^##\s|\Z)", text, re.M | re.S)
    return m.group(1) if m else None


def check(text, personas=None):
    errors, warnings = [], []

    m = re.search(r"^#\s*([A-Z]{3})-(\d{2})\s*:\s*(.+)$", text, re.M)
    if not m:
        errors.append("العنوان لا يبدأ بمعرّف الميزة بصيغة '# XXX-NN: الاسم'")
        fid = None
    else:
        fid = f"{m.group(1)}-{m.group(2)}"
        if m.group(1) not in DOMAINS:
            errors.append(f"رمز المجال {m.group(1)} غير معروف (المعروف: {', '.join(sorted(DOMAINS))})")
        if "[" in m.group(3):
            errors.append("اسم الميزة ما زال نصًا مؤقتًا")

    header = re.search(r"^\|\s*المجال\s*\|.*\n\|[-\s|]+\|\n\|(.*)\|", text, re.M)
    if not header:
        errors.append("جدول الرأس مفقود (المجال | المالك | الأولوية | الحالة)")
    else:
        cells = [c.strip() for c in header.group(1).split("|")]
        for col, val in zip(HEADER_COLS, cells):
            if not val or val.startswith("[") or val == "___" or "/" in val and col in ("الأولوية", "الحالة"):
                errors.append(f"حقل الرأس «{col}» فارغ أو لم يُختر منه شيء")
        if len(cells) > 2 and cells[2] and not re.match(r"P[123]", cells[2]):
            warnings.append("الأولوية ليست P1 أو P2 أو P3")

    for s in SECTIONS:
        if section(text, s) is None:
            errors.append(f"قسم مفقود: ## {s}")

    story = section(text, "القصة") or ""
    if not re.search(r"بصفتي.+أريد.+حتى", story, re.S):
        errors.append("القصة لا تتبع «بصفتي … أريد … حتى …»")
    elif personas:
        names = set(re.findall(r"^##\s*\d*\.?\s*([^\s(—:]+)", personas, re.M))
        # Full multi-word names too (e.g. «عضو الفريق»), up to the dash or a note.
        names |= {n.strip() for n in re.findall(r"^##\s*\d*\.?\s*([^—(*\n]+)", personas, re.M)}
        bold = re.search(r"بصفتي\s+\*\*([^*]+)\*\*", story)
        # «بصفتي أبي عبدالله» is the grammatical form of «أبو عبدالله».
        who = re.sub(r"^(أبي|أبا)\s", "أبو ", bold.group(1).strip()) if bold else ""
        if bold and names and who not in names:
            warnings.append(f"الشخصية «{bold.group(1).strip()}» غير موجودة في personas.md")

    why = section(text, "لماذا") or ""
    if "**المشكلة:**" not in why:
        errors.append("سطر «المشكلة» مفقود في قسم لماذا")
    if "**مؤشر النجاح:**" not in why:
        errors.append("سطر «مؤشر النجاح» مفقود في قسم لماذا")

    rules_text = section(text, "القواعد والأمثلة") or ""
    rules = list(re.finditer(r"^###\s*القاعدة\s*(\d+)\s*:\s*(.+)$", rules_text, re.M))
    if not rules:
        errors.append("لا توجد قواعد بصيغة '### القاعدة N: …'")
    if len(rules) > 6:
        warnings.append(f"عدد القواعد {len(rules)}؛ أكثر من 6 قد يعني أن الميزة تُقسَّم")
    total_examples, error_examples = 0, 0
    for i, r in enumerate(rules):
        start = r.end()
        end = rules[i + 1].start() if i + 1 < len(rules) else len(rules_text)
        body = rules_text[start:end]
        if "[" in r.group(2):
            errors.append(f"القاعدة {r.group(1)} ما زالت نصًا مؤقتًا")
        exs = re.findall(r"^\s*-\s*\*\*مثال([^*]*)\*\*(.*)$", body, re.M)
        if not exs:
            errors.append(f"القاعدة {r.group(1)} بلا أمثلة")
        for kind, content in exs:
            total_examples += 1
            if "خطأ" in kind or "حد" in kind:
                error_examples += 1
            if not ("بافتراض" in content and "عندما" in content and "فإن" in content):
                errors.append(f"القاعدة {r.group(1)}: مثال لا يتبع «بافتراض … عندما … فإن …»")
            if "…" in content or "[" in content:
                errors.append(f"القاعدة {r.group(1)}: مثال ما زال نصًا مؤقتًا")
    if rules and error_examples == 0:
        errors.append("لا يوجد أي مثال لحالة خطأ (اكتب «مثال (خطأ):» مرة واحدة على الأقل)")
    if total_examples > 15:
        warnings.append(f"عدد الأمثلة {total_examples}؛ أكثر من 15 قد يعني أن الميزة تُقسَّم")

    return fid, len(rules), total_examples, errors, warnings


def main():
    if len(sys.argv) not in (2, 3):
        print(__doc__)
        sys.exit(2)
    path = Path(sys.argv[1])
    personas = Path(sys.argv[2]).read_text(encoding="utf-8") if len(sys.argv) == 3 else None
    fid, nr, ne, errors, warnings = check(path.read_text(encoding="utf-8"), personas)
    print(f"الملف: {path.name} | الميزة: {fid or '؟'} | القواعد: {nr} | الأمثلة: {ne}")
    if errors:
        print(f"\nمشكلات حاجبة ({len(errors)}):")
        for e in errors:
            print(f"  ✗ {e}")
    if warnings:
        print(f"\nتنبيهات ({len(warnings)}):")
        for w in warnings:
            print(f"  ! {w}")
    if not errors:
        print("\nالبنية سليمة. راجع قائمة الجودة في docs/agents/writing-features.md للحكم على المحتوى.")
    sys.exit(1 if errors else 0)


if __name__ == "__main__":
    main()
