"""Validate content/units.json, content/lessons/*.json and content/day-one-media.json.

Usage: python3 tools/validate.py        (exit code 0 = pass)

Checks (LRN-01, LRN-03, LRN-09, LRN-10 and docs/agents/rules.md 1.3-1.4):
  schema       every required field present; three languages on every text
  ids          unique everywhere; card/objective/exercise ids prefixed by their lesson
  references   exercises point at existing cards/objectives; answers point at existing ids
  coverage     every card in >= 1 exercise; every objective in >= 2 exercises of its lesson;
               2-4 objectives per lesson, exactly 2 marked key
  exercises    types choose/order/match only; order 3-8 items; match 2-4 pairs
  steps        wudu = 8 steps (u1-l3 + u1-l4), prayer = 12 steps (u1-l6 + u1-l7)
  safety       no Latin transliteration of Al-Fatiha/adhkar/Arabic phrases in en/tl;
               no Arabic script in en/tl except the honorifics ﷺ ﷻ; no verse text in cards
               (no ﴿ ﴾ in any card, no {...} in en/tl cards); quran refs well-formed
  fidelity     every card line is made only of pieces of the source text, in source order
               (ar/en: spreadsheet snapshot, tl: site snapshot) - nothing typed or reworded
  review       review_status present for ar/en/tl on every lesson
"""
import glob, json, os, re, sys, unicodedata

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import edits  # noqa: E402
ROOT = os.path.dirname(HERE)
LANGS = ('ar', 'en', 'tl')
errors, warnings = [], []


def err(msg):
    errors.append(msg)


def text3(obj, where, allow_empty=False):
    if not isinstance(obj, dict) or set(obj) != set(LANGS):
        err(f'{where}: needs exactly ar/en/tl, got {obj!r:.80}')
        return
    for l in LANGS:
        if not isinstance(obj[l], str):
            err(f'{where}.{l}: not a string')
        elif not obj[l].strip() and not allow_empty:
            err(f'{where}.{l}: empty')


# ------------------------------------------------------------------ safety patterns
TRANSLIT = re.compile(
    r"\b(allahu|akbar|allahuakbar|allahukbar|bismillah|subhan\w*|alhamdu\w*|hamdulillah|rabbana|rabbiy\w*|"
    r"rabbi ighfir|ighfir|sami\W*\s*allahu|liman hamidah|tahiyy\w*|at-?tahiy\w*|as-?salamu|assalamu|"
    r"a\W?uzu|auzu|billahi|ash-?shaytan|ar-?rajeem|rajeem|allahumma|la ilaha|illa ?allah|ashhadu|"
    r"asmaa|lawhul|mahfudh|hadath|ar-razzaq|ar-rahman|al-qadeer|as-samee|as-sami\b|as-salam\b|"
    r"al-baseer|al-wakeel|al-khaliq|al-lateef|al-kafi|al-ghaf\w*|ghayrak|jadduka|bihamdika|walakal|"
    r"wa barakatuh|rahmatullah|rahmatu-?llah|innaka|hameedun|majeed)\b", re.I)
ARABIC = re.compile(r'[؀-ۿݐ-ݿࢠ-ࣿﭐ-ﷹ﷼-﷿ﹰ-﻿]')


def plain(t):
    return ''.join(c for c in unicodedata.normalize('NFKD', t) if unicodedata.category(c) != 'Mn')


def check_lang_safety(lang, t, where):
    if lang == 'ar' or not t:
        return
    m = TRANSLIT.search(plain(t))
    if m:
        err(f'{where}.{lang}: transliteration "{m.group(0)}" in: {t[:90]!r}')
    a = ARABIC.search(t)
    if a:
        err(f'{where}.{lang}: Arabic script "{a.group(0)}" in en/tl text: {t[:90]!r}')


# ------------------------------------------------------------------ fidelity
def load_stream(name):
    with open(os.path.join(HERE, 'source', name), encoding='utf-8') as f:
        lines = f.read().split('\n')
    out = []
    for l in lines:
        l = re.sub(r'^(## SECTION.*|\[TAB .*|\[IMG .*)$', '', l)
        l = re.sub(r'^(#h\d |\[NAV [^\]]*\] )', '', l)
        out.append(l)
    return ' \n '.join(out)


STREAM = {'ar': load_stream('ar_sheet.txt'), 'en': load_stream('en_sheet.txt'), 'tl': load_stream('tl.txt')}


def pieces_of_source(line, stream):
    """True if `line` = source pieces in source order (pieces may be separated by dropped text,
    a list bullet, or a line break). Greedy longest-prefix matching."""
    p, rest, n = 0, line, 0
    while rest:
        rest = rest.lstrip()
        if not rest:
            break
        lo, hi, best = 1, len(rest), 0
        while lo <= hi:                         # longest prefix of rest found at/after p
            mid = (lo + hi) // 2
            if stream.find(rest[:mid], p) >= 0:
                best, lo = mid, mid + 1
            else:
                hi = mid - 1
        if best == 0:
            return False, rest[:40]
        chunk = rest[:best]
        if not any(ch.isalpha() for ch in chunk):   # list numbers / punctuation: no anchor
            rest = rest[best:]
            continue
        if n and len(chunk.strip()) < 3:
            return False, chunk                 # refuse tiny letter fragments stitched together
        idx = stream.find(chunk, p)
        if n and idx - p > 4000:
            return False, chunk                 # pieces must come from nearby source text
        p = idx + len(chunk)
        rest = rest[best:]
        n += 1
    return True, ''


# ------------------------------------------------------------------ main checks
def main():
    seen = set()
    units = json.load(open(os.path.join(ROOT, 'units.json'), encoding='utf-8'))
    lessons = {}
    for f in sorted(glob.glob(os.path.join(ROOT, 'lessons', '*.json'))):
        d = json.load(open(f, encoding='utf-8'))
        lessons[d.get('id')] = d
        if os.path.basename(f) != f"{d.get('id')}.json":
            err(f'{f}: file name does not match id')
    all_objectives = {o['id'] for d in lessons.values() for o in d.get('objectives', [])}

    # units
    if not isinstance(units, list) or len(units) != 6:
        err('units.json: expected a list of 6 units')
    listed = []
    for u in units:
        for k in ('id', 'order', 'title', 'badge_name', 'lessons', 'source_credit'):
            if k not in u:
                err(f"unit {u.get('id')}: missing {k}")
        for k in ('title', 'badge_name', 'source_credit'):
            text3(u.get(k), f"{u.get('id')}.{k}")
            for l in LANGS:
                check_lang_safety(l, (u.get(k) or {}).get(l, ''), f"{u.get('id')}.{k}")
        for lid in u.get('lessons', []):
            listed.append(lid)
            if lid not in lessons:
                err(f"unit {u['id']}: lesson {lid} has no file")
            elif lessons[lid]['unit'] != u['id']:
                err(f'{lid}: unit field does not match units.json')
    expected = {'u1': 7, 'u2': 4, 'u3': 3, 'u4': 4, 'u5': 3, 'u6': 4}
    for u in units:
        if len(u.get('lessons', [])) != expected.get(u['id']):
            err(f"unit {u['id']}: {len(u.get('lessons', []))} lessons, PRD says {expected.get(u['id'])}")
    if sorted(listed) != sorted(lessons):
        err('units.json lessons and lessons/*.json differ')

    counts = {}
    empty_verse_cards = []
    step_refs = {'wudu': set(), 'prayer': set()}
    for lid, d in lessons.items():
        for k in ('id', 'unit', 'order', 'title', 'source', 'review_status', 'cards', 'objectives',
                  'exercises', 'dropped', 'notes'):
            if k not in d:
                err(f'{lid}: missing {k}')
        text3(d.get('title'), f'{lid}.title')
        for l in LANGS:
            check_lang_safety(l, d['title'][l], f'{lid}.title')
        rs = d.get('review_status', {})
        if set(rs) != set(LANGS) or any(v not in ('in_review', 'approved', 'changes_requested') for v in rs.values()):
            err(f'{lid}: bad review_status {rs}')
        for k in ('site_section', 'page_ar'):
            if k not in d.get('source', {}):
                err(f'{lid}.source: missing {k}')

        # cards
        card_ids = []
        for c in d['cards']:
            cid = c.get('id', '?')
            if cid in seen:
                err(f'duplicate id {cid}')
            seen.add(cid)
            card_ids.append(cid)
            if not cid.startswith(lid + '-c'):
                err(f'{cid}: id not prefixed by lesson')
            if c.get('kind') not in ('text', 'step', 'review'):
                err(f'{cid}: bad kind {c.get("kind")}')
            for k in ('text', 'image_url', 'quran', 'source_ref'):
                if k not in c:
                    err(f'{cid}: missing {k}')
            q = c.get('quran')
            if q is not None:
                if not (isinstance(q, dict) and isinstance(q.get('sura'), int) and 1 <= q['sura'] <= 114
                        and isinstance(q.get('ayat'), list) and len(q['ayat']) == 2
                        and 1 <= q['ayat'][0] <= q['ayat'][1]):
                    err(f'{cid}: bad quran {q}')
            text3(c.get('text'), f'{cid}.text', allow_empty=q is not None)
            img = c.get('image_url')
            if img is not None and not str(img).startswith('https://newmuslimguideline.com/Areas/'):
                err(f'{cid}: image_url not from the site\'s Arabic page: {img}')
            for l in LANGS:
                t = edits.undo(c['text'][l], d.get('edited', []), cid, l)  # reviewer edits are recorded, not source
                if not t.strip():
                    empty_verse_cards.append(f'{cid}.{l}')
                check_lang_safety(l, t, cid)
                if '﴿' in t or '﴾' in t:
                    err(f'{cid}.{l}: Quran verse marks in card text')
                if l != 'ar' and ('{' in t or '}' in t):
                    err(f'{cid}.{l}: braces (verse quotation) in card text')
                for ln in ([] if c.get('authored') else t.split('\n')):  # authored notes: safety only
                    ok, bad = pieces_of_source(ln, STREAM[l])
                    if not ok:
                        err(f'{cid}.{l}: text not found in source near {bad!r}')
            ref = c.get('source_ref', '')
            m = re.fullmatch(r'step (\d+)', ref or '')
            if m and c['kind'] == 'step':
                if lid in ('u1-l3', 'u1-l4'):
                    step_refs['wudu'].add(int(m.group(1)))
                if lid in ('u1-l6', 'u1-l7'):
                    step_refs['prayer'].add(int(m.group(1)))

        # objectives
        objs = d['objectives']
        if not 2 <= len(objs) <= 4:
            err(f'{lid}: {len(objs)} objectives (need 2-4)')
        if sum(1 for o in objs if o.get('key')) != 2:
            err(f'{lid}: exactly 2 objectives must be key')
        for o in objs:
            if o['id'] in seen:
                err(f"duplicate id {o['id']}")
            seen.add(o['id'])
            if not o['id'].startswith(lid + '-o'):
                err(f"{o['id']}: id not prefixed by lesson")
            # unit 1 is served from content/units/unit-01, which carries its own names
            if not lid.startswith('u1-') and not all((o.get('label') or {}).get(lg, '').strip() for lg in ('ar', 'en', 'tl')):
                err(f"{o['id']}: needs a learner name (label) in ar, en and tl, in content/objective_labels.json")
            text3(o.get('text'), f"{o['id']}.text")
            for l in LANGS:
                check_lang_safety(l, o['text'][l], o['id'])
            for k in o.get('cards', []):
                if k not in card_ids:
                    err(f"{o['id']}: unknown card {k}")

        # exercises
        card_hits = {k: 0 for k in card_ids if not next(c for c in d['cards'] if c['id'] == k).get('authored')}
        obj_hits = {o['id']: 0 for o in objs}
        for x in d['exercises']:
            xid = x.get('id', '?')
            if xid in seen:
                err(f'duplicate id {xid}')
            seen.add(xid)
            if not xid.startswith(lid + '-e'):
                err(f'{xid}: id not prefixed by lesson')
            t = x.get('type')
            if t not in ('choose', 'order', 'match'):
                err(f'{xid}: bad type {t}')
            if not x.get('objectives') or not x.get('cards'):
                err(f'{xid}: needs objectives and cards')
            for o in x.get('objectives', []):
                if o not in all_objectives:
                    err(f'{xid}: unknown objective {o}')
                if o in obj_hits:
                    obj_hits[o] += 1
            for k in x.get('cards', []):
                if k not in card_hits:
                    err(f'{xid}: unknown card {k} (exercises may only use their own lesson\'s cards)')
                else:
                    card_hits[k] += 1
            text3(x.get('prompt'), f'{xid}.prompt')
            texts = [x.get('prompt', {})]
            if t == 'choose':
                opts = x.get('options', [])
                ids = [o['id'] for o in opts]
                if len(opts) < 2 or len(set(ids)) != len(ids):
                    err(f'{xid}: needs >= 2 options with unique ids')
                if x.get('answer') not in ids:
                    err(f'{xid}: answer {x.get("answer")} not an option')
                for o in opts:
                    text3(o.get('text'), f"{xid}.option.{o['id']}")
                    texts.append(o['text'])
            elif t == 'order':
                items = x.get('items', [])
                ids = [i['id'] for i in items]
                if not 3 <= len(items) <= 8:
                    err(f'{xid}: order needs 3-8 items, has {len(items)}')
                if sorted(x.get('answer', [])) != sorted(ids) or len(set(ids)) != len(ids):
                    err(f'{xid}: answer is not a permutation of the item ids')
                if x.get('answer') == ids:
                    warnings.append(f'{xid}: items are stored already in the answer order')
                for i in items:
                    text3(i.get('text'), f"{xid}.item.{i['id']}")
                    texts.append(i['text'])
            elif t == 'match':
                left, right = x.get('left', []), x.get('right', [])
                lids, rids = [i['id'] for i in left], [i['id'] for i in right]
                if not 2 <= len(left) <= 4 or len(left) != len(right):
                    err(f'{xid}: match needs 2-4 pairs')
                ans = x.get('answer', [])
                if sorted(a for a, _ in ans) != sorted(lids) or sorted(b for _, b in ans) != sorted(rids):
                    err(f'{xid}: answer pairs must use each left and right id exactly once')
                for i in left + right:
                    text3(i.get('text'), f"{xid}.{i['id']}")
                    texts.append(i['text'])
            for tx in texts:
                for l in LANGS:
                    check_lang_safety(l, (tx or {}).get(l, ''), xid)
        for k, n in card_hits.items():
            if n < 1:
                err(f'{k}: not covered by any exercise')
        for o, n in obj_hits.items():
            if n < 2:
                err(f'{o}: covered by {n} exercise(s), needs >= 2')

        # dropped list
        for dr in d['dropped']:
            if set(dr) != {'lang', 'card', 'text', 'reason'} or dr['lang'] not in LANGS or not dr['text']:
                err(f'{lid}: malformed dropped entry {dr}')
        counts[lid] = (len(d['cards']), len(objs), len(d['exercises']), len(d['dropped']))

    if step_refs['wudu'] != set(range(1, 9)):
        err(f"wudu steps found {sorted(step_refs['wudu'])}, need 1-8")
    if step_refs['prayer'] != set(range(1, 13)):
        err(f"prayer steps found {sorted(step_refs['prayer'])}, need 1-12")

    # media
    mp = os.path.join(ROOT, 'day-one-media.json')
    if not os.path.exists(mp):
        err('day-one-media.json missing')
    else:
        m = json.load(open(mp, encoding='utf-8'))
        for item in m.get('al_fatiha_audio', []) + m.get('support_videos', []):
            for k in ('lang', 'islamhouse_id', 'title'):
                if k not in item:
                    err(f'day-one-media: item missing {k}: {item}')

    # verses the book quotes only in part (content/quran_excerpts.json)
    with open(os.path.join(ROOT, 'quran_excerpts.json'), encoding='utf-8') as f:
        excerpts = json.load(f)['cards']
    cards_by_id = {c['id']: c for d in lessons.values() for c in d['cards']}
    def check_excerpt(cid, ex, verse_words):
        for lg in ("ar", "en", "tl"):
            w = (ex.get(lg) or {}).get("words")
            if not (isinstance(w, list) and len(w) == 2 and 1 <= w[0] <= w[1] <= verse_words):
                err(f"{cid}: excerpt words {w} for {lg} outside the verse (1..{verse_words})")
            if lg != "ar" and not (ex.get(lg) or {}).get("translation", "").strip():
                err(f"{cid}: excerpt has no {lg} translation from the book")
    for cid, e in excerpts.items():
        if cid.startswith('u01-'):
            continue  # unit 1 is checked by content/check_content.py
        q = (cards_by_id.get(cid) or {}).get('quran') or {}
        if 'excerpt' not in q:
            err(f'{cid}: listed in quran_excerpts.json but its card shows no excerpt')
            continue
        check_excerpt(cid, q['excerpt'], e['verse_words'])

    print(f'{"lesson":8} cards objectives exercises dropped')
    for lid in sorted(counts, key=lambda s: (int(s[1]), int(s.split("-l")[1]))):
        print(f'{lid:8} {counts[lid][0]:5} {counts[lid][1]:10} {counts[lid][2]:9} {counts[lid][3]:7}')
    tot = [sum(v[i] for v in counts.values()) for i in range(4)]
    print(f'{"total":8} {tot[0]:5} {tot[1]:10} {tot[2]:9} {tot[3]:7}')
    if empty_verse_cards:
        print('cards whose text is only a Quran verse in one language (allowed):', ', '.join(empty_verse_cards))
    for w in warnings:
        print('WARN', w)
    for e in errors:
        print('ERROR', e)
    print('PASS' if not errors else f'FAIL ({len(errors)} errors)')
    return 0 if not errors else 1


if __name__ == '__main__':
    sys.exit(main())
