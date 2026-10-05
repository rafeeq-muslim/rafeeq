"""Build content/units.json and content/lessons/*.json from the lesson specs.

Card text is never typed by hand: every card line is cut out of the cleaned site
snapshot (tools/source/{ar,en,tl}.txt, made by linearize.py) by line number and,
when needed, by start/end markers. The only edits a spec can make are:
  * drop=[...]   remove an exact substring (recorded in the lesson's `dropped` list);
  * J(...)       join a line to the previous one with a space instead of a newline
                 (used where the site broke one sentence over two blocks);
  * a leading list bullet ("•", "*", "-") is removed (list numbers stay).
After building, a coverage check proves that every letter of the lesson's site
section is in exactly one card, in `dropped`, or in a Quran verse moved to `quran`.

Usage: python3 tools/build.py   (from content/ or anywhere)
"""
import json, os, re, sys, unicodedata

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
sys.path.insert(0, HERE)
LANGS = ('ar', 'en', 'tl')
SITE = 'https://newmuslimguideline.com'


# ---------------------------------------------------------------- spec helpers
class S:
    """A piece of one source line: from marker `a` (inclusive) to marker `b` (inclusive)."""
    def __init__(self, line, a=None, b=None, drop=(), why=None):
        self.line, self.a, self.b, self.drop, self.why = line, a, b, tuple(drop), why


class D:
    """A drop with its own reason: D('text', why) or D((start, end), why)."""
    def __init__(self, item, why):
        self.item, self.why = item, why


class Q:
    """A whole source line (or a marked part) that is only the Quran verse of this card:
    it adds no text; the verse is shown from the Quran database (card['quran'])."""
    def __init__(self, line, a=None, b=None):
        self.line, self.a, self.b = line, a, b


LBL = 'step number label (LRN-01 rule 3: no step number on the card)'


class J:
    """Join this piece to the previous one with a single space (same sentence)."""
    def __init__(self, item):
        self.item = item


def T(ar, en, tl):
    return {'ar': ar, 'en': en, 'tl': tl}


class C:
    """A card. ar/en/tl: list of line numbers, S(...) or J(...)."""
    def __init__(self, kind, ref, ar, en, tl, img=None, q=None):
        self.kind, self.ref, self.img, self.q = kind, ref, img, q
        self.spec = {'ar': ar, 'en': en, 'tl': tl}


class O:
    def __init__(self, text, cards, key=False):
        self.text, self.cards, self.key = text, cards, key


class Ex:
    def __init__(self, type_, obj, cards, prompt, **kw):
        self.type, self.obj, self.cards, self.prompt, self.kw = type_, obj, cards, prompt, kw


def choose(obj, cards, prompt, options):
    """options[0] is the correct one."""
    return Ex('choose', obj, cards, prompt, options=options)


def order(obj, cards, prompt, items):
    """items are given in the correct order."""
    return Ex('order', obj, cards, prompt, items=items)


def match(obj, cards, prompt, pairs):
    return Ex('match', obj, cards, prompt, pairs=pairs)


class X:
    """Lesson-level drop of (part of) a source line that is not shown in any card."""
    def __init__(self, lang, line, a=None, b=None, reason='', card=None):
        self.lang, self.line, self.a, self.b, self.reason = lang, line, a, b, reason
        self.card = card


class L:
    def __init__(self, id, title, source, ranges, cards, objectives, exercises,
                 xdrops=(), notes='', review_of=None):
        self.id, self.title, self.source, self.ranges = id, title, source, ranges
        self.cards, self.objectives, self.exercises = cards, objectives, exercises
        self.xdrops, self.notes = list(xdrops), notes
        self.unit, self.order = id.split('-')[0], int(id.split('-l')[1])


# ---------------------------------------------------------------- source text
# Arabic and English: the aligned spreadsheet of the book (matches the printed editions);
# Tagalog: the official site's Filipino page. Step images: the site's Arabic page.
SOURCE_FILES = {'ar': 'ar_sheet.txt', 'en': 'en_sheet.txt', 'tl': 'tl.txt', 'site_ar': 'ar.txt'}


def load_sources():
    src = {}
    for key, name in SOURCE_FILES.items():
        with open(os.path.join(HERE, 'source', name), encoding='utf-8') as f:
            src[key] = [None] + f.read().split('\n')
    return src


SRC = load_sources()
with open(os.path.join(HERE, 'source', 'en.txt'), encoding='utf-8') as _f:
    SRC_SITE_EN = [None] + _f.read().split('\n')
with open(os.path.join(HERE, 'source', 'sheet_pages.json'), encoding='utf-8') as _f:
    SHEET_PAGES = {int(k): v for k, v in json.load(_f).items()}
MARKER = re.compile(r'^(## SECTION|\[TAB |\[IMG |#h2 )')


def body(lang, n):
    """The text of line n without its marker prefix."""
    line = SRC[lang][n]
    m = re.match(r'^(#h\d |\[NAV [^\]]*\] )', line)
    return line[m.end():] if m else line


def prefix_len(lang, n):
    return len(SRC[lang][n]) - len(body(lang, n))


def collapse(t):
    return re.sub(r'\s+', ' ', t).strip()


def _strip_marks(t):
    """Text without combining marks (harakat), with a map back to positions in t."""
    keep = [k for k, ch in enumerate(t) if unicodedata.category(ch) != 'Mn']
    return ''.join(t[k] for k in keep), keep


def find_loose(hay, needle, start=0):
    """str.find that ignores harakat order/presence (markers are typed without them)."""
    i = hay.find(needle, start)
    if i >= 0:
        return i
    h, hmap = _strip_marks(hay)
    n, _ = _strip_marks(needle)
    hs = next((k for k, pos in enumerate(hmap) if pos >= start), len(hmap))
    j = h.find(n, hs)
    return hmap[j] if j >= 0 else -1


def find_end(hay, needle, start=0):
    """End position (exclusive) of needle found loosely from start, or -1."""
    i = find_loose(hay, needle, start)
    if i < 0:
        return -1
    if hay.startswith(needle, i):
        return i + len(needle)
    h, hmap = _strip_marks(hay)
    n, _ = _strip_marks(needle)
    k = hmap.index(i)
    end = hmap[k + len(n) - 1] + 1
    while end < len(hay) and unicodedata.category(hay[end]) == 'Mn':
        end += 1
    return end


def find_once(hay, needle, where):
    i = find_loose(hay, needle)
    if i < 0:
        raise SystemExit(f'ERROR {where}: marker not found: {needle!r}\n  in: {hay[:200]!r}')
    if find_loose(hay, needle, i + 1) >= 0:
        raise SystemExit(f'ERROR {where}: marker not unique: {needle!r}')
    return i


# ---------------------------------------------------------------- building
class Builder:
    def __init__(self):
        self.cover = {l: {} for l in LANGS}   # lang -> line -> [owner per char]
        self.problems = []
        self.verse_log = []
        self.review_mode = False   # review cards repeat text taught earlier: not counted again

    def mark(self, lang, n, s, e, owner):
        arr = self.cover[lang].setdefault(n, [None] * len(SRC[lang][n]))
        off = prefix_len(lang, n)
        for i in range(s + off, e + off):
            if arr[i] is not None and arr[i] != owner:
                self.problems.append(f'{lang}:{n} char {i} covered twice ({arr[i]} / {owner})')
            arr[i] = owner

    def piece(self, lang, item, owner, card_id, dropped):
        """Resolve one spec item to (text, joiner, line, end)."""
        joiner = '\n'
        if isinstance(item, J):
            joiner, item = ' ', item.item
        if isinstance(item, Q):
            n, text = item.line, body(lang, item.line)
            s = find_once(text, item.a, owner) if item.a else 0
            e = (text.find(item.b, s) + len(item.b)) if item.b else len(text)
            self.mark(lang, n, s, e, owner + ':quran')
            self.verse_log.append(f'{owner} {lang}:{n} (verse-only piece) :: {text[s:e]}')
            return None, joiner, n, e
        if isinstance(item, int):
            item = S(item)
        n, text = item.line, body(lang, item.line)
        where = f'{owner} {lang}:{n}'
        s = find_once(text, item.a, where) if item.a else 0
        if item.b:
            e = find_end(text, item.b, s)
            if e < 0:
                raise SystemExit(f'ERROR {where}: end marker not found: {item.b!r}')
        else:
            e = len(text)
        seg = text[s:e]
        if not self.review_mode:
            self.mark(lang, n, s, e, owner)
        for d in item.drop:
            why = item.why or 'transliteration'
            if isinstance(d, D):
                d, why = d.item, d.why
            if isinstance(d, tuple):            # (start marker, end marker), inclusive
                i = find_once(seg, d[0], where + ' drop')
                j = seg.find(d[1], i)
                if j < 0:
                    raise SystemExit(f'ERROR {where}: drop end not found: {d[1]!r}')
                d = seg[i:j + len(d[1])]
            else:
                find_once(seg, d, where + ' drop')
            if why == 'transliteration' and '(' in d:
                why = ('transliteration, dropped together with its meaning in brackets '
                       '(rules 1.4; LRN-01 rule 4: adhkar are learned by listening)')
            dropped.append({'lang': lang, 'card': card_id, 'text': collapse(d),
                            'reason': why})
            seg = seg.replace(d, '\x00', 1)
        # spacing is tidied only where text was dropped: no space before . , ; : )
        seg = re.sub(r'\s*\x00\s*([.,;:)])', r'\1', seg)
        seg = re.sub(r'\s*\x00\s*', ' ', seg)
        seg = collapse(seg)
        seg = re.sub(r'^[•*\-–]\s*(?=\D)', '', seg)   # list bullet (•, *, -) at the start; numbers stay
        return seg, joiner, n, e

    def build_lesson(self, les, unit_titles):
        lid = les.id
        dropped, cards = [], []
        last_piece = {}
        rows_used = set()
        for ci, c in enumerate(les.cards, 1):
            cid = f'{lid}-c{ci}'
            text = {}
            self.review_mode = c.kind == 'review'
            for lang in LANGS:
                out = ''
                end = None
                for item in c.spec[lang]:
                    seg, joiner, n, e = self.piece(lang, item, cid, cid, dropped)
                    if seg is None:          # verse-only piece
                        continue
                    out = seg if not out else out + joiner + seg
                    end = (n, e)
                    if lang == 'ar':
                        rows_used.add(n)
                text[lang] = out
                last_piece[(cid, lang)] = end
            self.review_mode = False
            img = None
            if c.img:
                img = SITE + tab_image(c.img)
            q = None
            if c.q:
                sura, a, b = c.q
                q = {'sura': sura, 'ayat': [a, b]}
            cards.append({'id': cid, 'kind': c.kind, 'text': text, 'image_url': img,
                          'quran': q, 'source_ref': c.ref})
        for x in les.xdrops:
            text = body(x.lang, x.line)
            s = find_once(text, x.a, f'{lid} xdrop') if x.a else 0
            e = (text.find(x.b, s) + len(x.b)) if x.b else len(text)
            self.mark(x.lang, x.line, s, e, f'{lid}-x')
            dropped.append({'lang': x.lang, 'card': f'{lid}-c{x.card}' if x.card else None,
                            'text': collapse(text[s:e]), 'reason': x.reason})
        # verses: the uncovered run right after a verse card's last piece
        for card in cards:
            if not card['quran']:
                continue
            for lang in LANGS:
                end = last_piece.get((card['id'], lang))
                if end is None:
                    continue
                n, e = end
                self.claim_verse(lang, n, e, card, lid)
        objectives = []
        for oi, o in enumerate(les.objectives, 1):
            objectives.append({'id': f'{lid}-o{oi}', 'text': o.text,
                               'cards': [f'{lid}-c{k}' for k in o.cards], 'key': o.key})
        exercises = []
        for ei, x in enumerate(les.exercises, 1):
            eid = f'{lid}-e{ei}'
            ex = {'id': eid, 'type': x.type,
                  'objectives': [o if isinstance(o, str) else f'{lid}-o{o}' for o in x.obj],
                  'cards': [f'{lid}-c{k}' for k in x.cards], 'prompt': x.prompt}
            if x.type == 'choose':
                opts = x.kw['options']
                k = len(opts)
                pos = (ei + len(lid)) % k            # where the correct option goes
                order_ = opts[1:pos + 1] + [opts[0]] + opts[pos + 1:]
                ids = 'abcdefgh'
                ex['options'] = [{'id': ids[i], 'text': t} for i, t in enumerate(order_)]
                ex['answer'] = ids[pos]
            elif x.type == 'order':
                items = [{'id': f's{i}', 'text': t} for i, t in enumerate(x.kw['items'], 1)]
                shown = items[::-1]
                r = ei % len(shown)
                shown = shown[r:] + shown[:r]
                if [i['id'] for i in shown] == [i['id'] for i in items]:
                    shown = shown[1:] + shown[:1]
                ex['items'] = shown
                ex['answer'] = [i['id'] for i in items]
            elif x.type == 'match':
                pairs = x.kw['pairs']
                left = [{'id': f'l{i}', 'text': p[0]} for i, p in enumerate(pairs, 1)]
                right = [{'id': f'r{i}', 'text': p[1]} for i, p in enumerate(pairs, 1)]
                r = 1 + ei % (len(right) - 1) if len(right) > 1 else 0
                ex['left'] = left
                ex['right'] = right[r:] + right[:r]
                ex['answer'] = [[f'l{i}', f'r{i}'] for i in range(1, len(pairs) + 1)]
            exercises.append(ex)
        pages = sorted({int(SHEET_PAGES[r]) for r in rows_used if SHEET_PAGES.get(r, '').isdigit()})
        source = dict(les.source)
        if pages:
            source['page'] = f'p. {pages[0]}' if len(pages) == 1 else f'p. {pages[0]}–{pages[-1]}'
            source['sheet_rows'] = f'{min(rows_used)}–{max(rows_used)}'
        return {
            'id': lid, 'unit': les.unit, 'order': les.order, 'title': les.title,
            'source': source,
            'review_status': {'ar': 'in_review', 'en': 'in_review', 'tl': 'in_review'},
            'cards': cards, 'objectives': objectives, 'exercises': exercises,
            'dropped': dropped, 'notes': les.notes,
        }

    def claim_verse(self, lang, n, e, card, lid):
        arr = self.cover[lang].setdefault(n, [None] * len(SRC[lang][n]))
        off = prefix_len(lang, n)
        i = e + off
        j = i
        while j < len(arr) and arr[j] is None:
            j += 1
        gap = SRC[lang][n][i:j]
        if gap.strip():
            for k in range(i, j):
                arr[k] = card['id'] + ':quran'
            self.verse_log.append(f"{card['id']} {lang}:{n} {card['quran']} :: {gap.strip()}")
            return
        # the verse is on the next line(s) (e.g. Al-Fatiha in Arabic)
        m = n + 1
        if m < len(SRC[lang]) and not MARKER.match(SRC[lang][m]) and m not in self.cover[lang]:
            self.cover[lang][m] = [card['id'] + ':quran'] * len(SRC[lang][m])
            self.verse_log.append(f"{card['id']} {lang}:{m} {card['quran']} :: {SRC[lang][m]}")
            return
        self.problems.append(f"{card['id']} {lang}: card has quran {card['quran']} but no verse text follows it")

    def check_coverage(self, les):
        for lang in LANGS:
            for a, b in les.ranges[lang]:
                for n in range(a, b + 1):
                    line = SRC[lang][n]
                    if MARKER.match(line) or line.startswith('[NAV'):
                        continue
                    arr = self.cover[lang].get(n, [None] * len(line))
                    off = prefix_len(lang, n)
                    miss = [i for i in range(off, len(line))
                            if arr[i] is None and unicodedata.category(line[i])[0] in 'LN']
                    if miss:
                        self.problems.append(
                            f'{les.id} {lang}:{n} not covered: {line[miss[0]:miss[0] + 60]!r}')


def tab_image(tab):
    lines = SRC['site_ar']
    i = lines.index(f'[TAB {tab}]')
    for j in range(i + 1, len(lines)):
        if lines[j].startswith('[TAB ') or lines[j].startswith('## SECTION'):
            break
        if lines[j].startswith('[IMG '):
            return lines[j][5:-1]
    raise SystemExit(f'ERROR: no image in {tab}')


def main():
    from spec_units import UNITS
    import spec_u1, spec_u2, spec_u3, spec_u4, spec_u5, spec_u6
    lessons = (spec_u1.LESSONS + spec_u2.LESSONS + spec_u3.LESSONS + spec_u4.LESSONS
               + spec_u5.LESSONS + spec_u6.LESSONS)
    b = Builder()
    out = []
    for les in lessons:
        out.append(b.build_lesson(les, UNITS))
    for les in lessons:
        b.check_coverage(les)
    os.makedirs(os.path.join(ROOT, 'lessons'), exist_ok=True)
    for doc in out:
        with open(os.path.join(ROOT, 'lessons', f"{doc['id']}.json"), 'w', encoding='utf-8') as f:
            json.dump(doc, f, ensure_ascii=False, indent=2)
            f.write('\n')
    units = []
    for u in UNITS:
        u = dict(u)
        u['lessons'] = [d['id'] for d in out if d['unit'] == u['id']]
        units.append(u)
    with open(os.path.join(ROOT, 'units.json'), 'w', encoding='utf-8') as f:
        json.dump(units, f, ensure_ascii=False, indent=2)
        f.write('\n')
    # Book text that no PRD lesson covers (kept, with its source, for the reviewer to place)
    unplaced = [{
        'id': 'istinja', 'site_section': 'أتعلم الوضوء › tab3_10', 'page_ar': '74',
        'why_unplaced': ('LRN-01 gives u1-l4 pages 67–73 (steps 5–8 and the nullifiers); this paragraph is on p. 74, '
                         'after the nullifiers, and is not in the spreadsheet. Text from the official site.'),
        'image_url': SITE + tab_image('tab3_10'),
        'text': {'ar': body('site_ar', 276), 'en': SRC_SITE_EN[286], 'tl': body('tl', 254)},
        'review_status': {'ar': 'in_review', 'en': 'in_review', 'tl': 'in_review'},
    }]
    with open(os.path.join(ROOT, 'unplaced.json'), 'w', encoding='utf-8') as f:
        json.dump(unplaced, f, ensure_ascii=False, indent=2)
        f.write('\n')
    with open(os.path.join(HERE, 'verses_moved_to_quran_field.txt'), 'w', encoding='utf-8') as f:
        f.write('\n'.join(b.verse_log) + '\n')
    if b.problems:
        print('\n'.join(b.problems))
        print(f'{len(b.problems)} build problem(s)')
        sys.exit(1)
    print(f'built {len(out)} lessons, {sum(len(d["cards"]) for d in out)} cards')


if __name__ == '__main__':
    import build          # run inside the module the specs import (one set of classes)
    build.main()
