"""Snapshot the aligned Arabic/English spreadsheet of the book into numbered text files.

Usage: python3 sheet_snapshot.py <book.xlsx>
Writes source/ar_sheet.txt, source/en_sheet.txt (line N = spreadsheet row N; the header
row is row 0 and is not written) and source/sheet_pages.json ({row: page_number}).
The xlsx itself is not kept in the repo.

Cleanup (same as linearize.py, plus two presentation-only normalisations):
  1. remove invisible formatting characters (Unicode Cf) and tatweel (U+0640);
  2. collapse whitespace;
  3. Arabic: the honorific written out as "-صلى الله عليه وسلم-" is shown as the
     single sign "ﷺ", the form used in the printed book and on the official site;
  4. rows tagged h2 are prefixed "#h2 " (section titles, used as lesson titles).
"""
import html, json, os, re, sys, unicodedata, zipfile

HERE = os.path.dirname(os.path.abspath(__file__))


def clean(t):
    t = ''.join(ch for ch in t if unicodedata.category(ch) != 'Cf' and ch != 'ـ')
    return re.sub(r'\s+', ' ', t).strip()


def pbuh_sign(t):
    t = re.sub(r'\s*-\s*صلى الله عليه وسلم\s*-\s*', ' ﷺ ', t)
    t = re.sub(r' ﷺ\s+([:،,.)؛])', r' ﷺ\1', t)
    return re.sub(r'\s+', ' ', t).strip()


def read_rows(path):
    z = zipfile.ZipFile(path)
    ss = z.read('xl/sharedStrings.xml').decode('utf-8')
    strs = [html.unescape(''.join(re.findall(r'<t[^>]*>(.*?)</t>', si, re.S)))
            for si in re.findall(r'<si>(.*?)</si>', ss, re.S)]
    x = z.read('xl/worksheets/sheet1.xml').decode('utf-8')
    rows = []
    for r in re.findall(r'<row[^>]*>(.*?)</row>', x, re.S):
        row = {}
        for col, attrs, inner in re.findall(r'<c r="([A-Z]+)\d+"([^>]*?)(?:/>|>(.*?)</c>)', r, re.S):
            v = re.search(r'<v>(.*?)</v>', inner or '', re.S)
            if 't="s"' in attrs and v:
                row[col] = strs[int(v.group(1))]
            elif v:
                row[col] = html.unescape(v.group(1))
            else:
                row[col] = html.unescape(''.join(re.findall(r'<t[^>]*>(.*?)</t>', inner or '', re.S)))
        rows.append(row)
    return rows


def main(path):
    rows = read_rows(path)
    head = rows[0]
    col = {v: k for k, v in head.items()}
    ar, en, pages = [], [], {}
    for i, r in enumerate(rows[1:], 1):
        tag = r.get(col['tag'], '')
        pre = '#h2 ' if tag in ('h1', 'h2') else ''
        ar.append(pre + pbuh_sign(clean(r.get(col['text'], ''))))
        en.append(pre + clean(r.get(col['trans_en'], '')))
        pages[i] = r.get(col['page_number'], '')
    os.makedirs(os.path.join(HERE, 'source'), exist_ok=True)
    for name, lines in (('ar_sheet', ar), ('en_sheet', en)):
        with open(os.path.join(HERE, 'source', f'{name}.txt'), 'w', encoding='utf-8') as f:
            f.write('\n'.join(lines) + '\n')
    with open(os.path.join(HERE, 'source', 'sheet_pages.json'), 'w', encoding='utf-8') as f:
        json.dump(pages, f)
    print(f'{len(ar)} rows')


if __name__ == '__main__':
    main(sys.argv[1])
