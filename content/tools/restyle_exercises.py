"""Apply the Sharia reviewer's exercise style (2026-10-06) to the unit spec files.

Style: questions ask about meaning, never about recalling the lesson's wording; no
sentence-fragment ordering; every choice question has at least three options; prompts
never say "as in the lesson". Run on the unchanged spec files (git checkout tools/spec_u*.py first), then `python3 tools/build.py` and `python3 tools/validate.py`.

Edits are located with the syntax tree of each spec file, so only exercise prompts,
option lists and whole exercises named in PATCHES are touched.
"""
import ast
import re
import sys
from pathlib import Path

from restyle_patches import PATCHES

HERE = Path(__file__).parent

CLEAN = {
    "ar": [r"\s*كما في الدرس", r"\s*كما ذكر الدرس", r"\s*المذكورة في الدرس", r"\s+في الدرس"],
    "en": [r",?\s*as the lesson says", r",?\s*as in the lesson", r"\s+in the lesson"],
    "tl": [r",?\s*ayon sa aralin", r"\s+sa aralin"],
}


def clean_prompt(text, lang):
    for pat in CLEAN[lang]:
        text = re.sub(pat, "", text)
    return text


def offsets(raw):
    """Byte offsets: ast reports col_offset in UTF-8 bytes."""
    starts = [0]
    for line in raw.splitlines(keepends=True):
        starts.append(starts[-1] + len(line))
    return lambda node: (starts[node.lineno - 1] + node.col_offset, starts[node.end_lineno - 1] + node.end_col_offset)


def lesson_calls(tree):
    for node in ast.walk(tree):
        if isinstance(node, ast.Call) and getattr(node.func, "id", None) == "L":
            yield node.args[0].value, node.args[6]


def restyle(path):
    src = path.read_text(encoding="utf8")
    raw = src.encode("utf8")
    span = offsets(raw)
    tree = ast.parse(src)
    edits = []
    for lid, exlist in lesson_calls(tree):
        patch = PATCHES.get(lid, {})
        for i, call in enumerate(exlist.elts, start=1):
            kind = call.func.id
            p = patch.get(i, {})
            if "replace" in p:
                a, b = span(call)
                edits.append((a, b, p["replace"]))
                continue
            prompt = call.args[2]
            if "prompt" in p:
                a, b = span(prompt)
                edits.append((a, b, p["prompt"]))
            else:
                for lang_node, lang in zip(prompt.args, ("ar", "en", "tl")):
                    new = clean_prompt(lang_node.value, lang)
                    if new != lang_node.value:
                        a, b = span(lang_node)
                        edits.append((a, b, repr(new)))
            if kind == "choose":
                options = call.args[3]
                extra = p.get("add", [])
                if len(options.elts) + len(extra) < 3:
                    sys.exit(f"{lid} exercise {i}: fewer than three options and no addition")
                if extra:
                    a, b = span(options)
                    edits.append((b - 1, b - 1, "".join(f", {x}" for x in extra)))
    for a, b, text in sorted(edits, reverse=True):
        raw = raw[:a] + text.encode("utf8") + raw[b:]
    src = raw.decode("utf8")
    ast.parse(src)
    path.write_text(src, encoding="utf8")
    return len(edits)


if __name__ == "__main__":
    for unit in sys.argv[1:]:
        n = restyle(HERE / f"spec_{unit}.py")
        print(f"spec_{unit}.py: {n} edits")
