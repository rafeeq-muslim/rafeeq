#!/usr/bin/env python3
"""Structural check for a Rafeeq feature PRD (Arabic, Template B).

Usage: python check_prd.py path/to/Fnn-name.md

Checks structure only (header fields, sections, problem formula, solution
options, FAC count, stories and their acceptance criteria). It does not judge
content quality; read the readiness checklist in the guide as well.
Exit code 0 = no blocking issues, 1 = blocking issues found.
"""
import re
import sys
from pathlib import Path

HEADER_FIELDS = ["الأصل", "تحرّك", "المالك", "الحالة", "الأولوية", "الوقت المحدد"]
SECTIONS = [
    (r"^##\s*1\.\s*لماذا", "## 1. لماذا"),
    (r"^##\s*2\.\s*معايير قبول الميزة", "## 2. معايير قبول الميزة"),
    (r"^##\s*3\.\s*قصص المستخدم", "## 3. قصص المستخدم"),
    (r"^##\s*4\.\s*المتطلبات التقنية", "## 4. المتطلبات التقنية"),
]


def check(text: str):
    errors, warnings = [], []
    lines = text.splitlines()

    # Feature ID from the title
    m = re.search(r"^#\s*(F\d{2})\b", text, re.M)
    fid = m.group(1) if m else None
    if not fid:
        errors.append("العنوان لا يبدأ بمعرّف الميزة بصيغة '# Fnn: ...'")

    # Header table fields
    for field in HEADER_FIELDS:
        row = re.search(rf"^\|\s*{field}\s*\|\s*(.*?)\s*\|", text, re.M)
        if not row:
            errors.append(f"حقل الرأس مفقود: {field}")
        elif row.group(1).strip() in ("", "___", "PAC-n"):
            errors.append(f"حقل الرأس فارغ: {field}")
    moves = re.search(r"^\|\s*تحرّك\s*\|\s*(.*?)\s*\|", text, re.M)
    if moves and not re.search(r"PAC-\d|نجم الشمال", moves.group(1)):
        errors.append("حقل «تحرّك» لا يذكر PAC-n ولا نجم الشمال")

    # Sections
    for pattern, label in SECTIONS:
        if not re.search(pattern, text, re.M):
            errors.append(f"قسم مفقود: {label}")

    # Problem formula
    prob = re.search(r"\*\*المشكلة:\*\*(.+)", text)
    if not prob:
        errors.append("سطر «المشكلة» مفقود في قسم لماذا")
    else:
        p = prob.group(1)
        if "يصعب" not in p or "لأن" not in p:
            errors.append("المشكلة لا تتبع الصيغة: [المستخدم] يصعب عليه [المهمة] لأن [السبب]، مما يكلّف [الأثر]")
        if "مما يكلّف" not in p and "مما يكلف" not in p:
            warnings.append("المشكلة لا تذكر الأثر («مما يكلّف ...»)")

    if not re.search(r"\*\*الهدف الفرعي:\*\*", text):
        errors.append("سطر «الهدف الفرعي» مفقود")
    if not re.search(r"\*\*ما لن نفعله:\*\*", text):
        errors.append("سطر «ما لن نفعله» مفقود")

    # Solution options table (at least 3 rows, one chosen)
    sol = re.search(r"الحلول التي نوقشت(.*?)(?:\n---|\n## )", text, re.S)
    if not sol:
        errors.append("جدول «الحلول التي نوقشت» مفقود")
    else:
        rows = [l for l in sol.group(1).splitlines() if l.strip().startswith("|") and "---" not in l]
        options = max(len(rows) - 1, 0)  # minus header
        if options < 3:
            errors.append(f"الحلول المناقشة {options}؛ المطلوب ثلاثة على الأقل")
        if "المختار" not in sol.group(1):
            errors.append("لم يُحدَّد الحل المختار في جدول الحلول")

    # FAC count
    facs = re.findall(r"\*\*FAC-\d+:\*\*", text)
    if not 3 <= len(facs) <= 5:
        (errors if len(facs) < 3 else warnings).append(f"عدد معايير الميزة {len(facs)}؛ المطلوب من 3 إلى 5")

    # Stories
    story_iter = list(re.finditer(r"^###\s*(F\d{2})-S(\d+)\s*:(.*)$", text, re.M))
    if not story_iter:
        errors.append("لا توجد قصص بصيغة '### Fnn-Sn: ...'")
    n = len(story_iter)
    if n and n < 3:
        warnings.append(f"عدد القصص {n}؛ أقل من 3 يعني غالبًا أنها تُدمج في ميزة أخرى")
    if n > 12:
        errors.append(f"عدد القصص {n}؛ أكثر من 12 يعني أن الميزة تُقسَّم")

    for i, sm in enumerate(story_iter):
        sid = f"{sm.group(1)}-S{sm.group(2)}"
        if fid and sm.group(1) != fid:
            errors.append(f"{sid}: معرّف القصة لا يطابق معرّف الميزة {fid}")
        start = sm.end()
        end = story_iter[i + 1].start() if i + 1 < n else len(text)
        nxt = re.search(r"^##\s", text[start:end], re.M)
        body = text[start:start + nxt.start()] if nxt else text[start:end]
        if not re.search(r"بصفتي.+أريد.+حتى", body):
            errors.append(f"{sid}: جملة القصة لا تتبع «بصفتي … أريد … حتى …»")
        must = "Must" in sm.group(3)
        for ac, label in (("AC1", "المسار الناجح"), ("AC2", "خطأ"), ("AC3", "صلاحيات")):
            line = re.search(rf"\*\*{ac}[^*]*\*\*(.*)", body)
            if not line:
                (errors if must else warnings).append(f"{sid}: معيار {ac} ({label}) مفقود")
                continue
            content = line.group(1)
            if ac != "AC3" or "لا صلاحيات خاصة" not in content:
                if not ("بافتراض" in content and "عندما" in content and "فإن" in content):
                    if "تسري قواعد" not in content and "لا يستطيع" not in content:
                        warnings.append(f"{sid}: {ac} لا يتبع صيغة «بافتراض … عندما … فإن …»")

    # Uncertainty markers present at all
    if not re.search(r"[✅💬⚠️]", text):
        warnings.append("لا توجد رموز ثقة (✅ 💬 ⚠️) في الوثيقة")

    return fid, n, errors, warnings


def main():
    if len(sys.argv) != 2:
        print(__doc__)
        sys.exit(2)
    path = Path(sys.argv[1])
    fid, n, errors, warnings = check(path.read_text(encoding="utf-8"))
    print(f"الملف: {path.name} | الميزة: {fid or '؟'} | القصص: {n}")
    if errors:
        print(f"\nمشكلات حاجبة ({len(errors)}):")
        for e in errors:
            print(f"  ✗ {e}")
    if warnings:
        print(f"\nتنبيهات ({len(warnings)}):")
        for w in warnings:
            print(f"  ! {w}")
    if not errors:
        print("\nالبنية سليمة. راجع قائمة الجاهزية في الدليل §10 للحكم على المحتوى.")
    sys.exit(1 if errors else 0)


if __name__ == "__main__":
    main()
