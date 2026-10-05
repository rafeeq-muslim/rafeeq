"""Turn a saved newmuslimguideline.com language page into a numbered, cleaned text snapshot.

Usage: python3 linearize.py <page.html> <out.txt>

Each output line is one block of the page (paragraph, list item, heading, flex box,
or a <br>-separated line). Markers:
  ## SECTION id=<id> name=<name>   a site section starts
  #h2 / #h4 <text>                 a heading
  [TAB <id>]                       a tab pane (one step / pillar / name) starts
  [NAV <href>] <label>             the label of a tab button
  [IMG <src>]                      an image (only /Areas/ images are kept)
  <text>                           book text

Cleanup applied to every text line (the only changes ever made to the book's text):
  1. remove invisible formatting characters (Unicode category Cf: LRM/RLM, LRO/PDF,
     zero-width joiners, BOM, soft hyphen ...);
  2. remove tatweel/kashida (U+0640);
  3. collapse every run of whitespace (incl. no-break space) to one space and trim.
Only the site's content sections are kept (from section id=1 to the footer).
"""
import html.parser, re, sys, unicodedata

BLOCK = {'p', 'li', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'div', 'section', 'ul', 'ol',
         'tr', 'td', 'table', 'br', 'blockquote'}


def clean(t: str) -> str:
    t = ''.join(ch for ch in t if unicodedata.category(ch) != 'Cf' and ch != 'ـ')
    return re.sub(r'\s+', ' ', t).strip()


class P(html.parser.HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.out, self.buf, self.skip, self.hd, self.nav = [], [], 0, None, None
        self.flex_stack = []

    def flush(self):
        t = clean(''.join(self.buf))
        self.buf = []
        if t:
            if self.hd:
                self.out.append(f'#{self.hd} {t}')
            elif self.nav:
                self.out.append(f'[NAV {self.nav}] {t}')
            else:
                self.out.append(t)

    def handle_starttag(self, tag, a):
        a = dict(a)
        if tag in ('script', 'style', 'noscript'):
            self.skip += 1
            return
        st = (a.get('style') or '').replace(' ', '')
        is_flex = tag == 'span' and 'display:flex' in st
        if tag == 'span':
            self.flex_stack.append(is_flex)
        if tag in BLOCK or is_flex:
            self.flush()
        if tag == 'section':
            self.out.append(f"## SECTION id={a.get('id')} name={clean(a.get('name') or '')}")
        if tag in ('h1', 'h2', 'h3', 'h4', 'h5', 'h6'):
            self.hd = tag
        if tag == 'img' and (a.get('src') or '').startswith('/Areas/'):
            self.flush()
            self.out.append(f"[IMG {a.get('src')}]")
        if tag == 'div' and 'tab-pane' in (a.get('class') or ''):
            self.out.append(f"[TAB {a.get('id')}]")
        if tag == 'a' and 'nav-link' in (a.get('class') or ''):
            self.flush()
            self.nav = a.get('href')

    def handle_endtag(self, tag):
        if tag in ('script', 'style', 'noscript'):
            self.skip -= 1
            return
        is_flex = False
        if tag == 'span' and self.flex_stack:
            is_flex = self.flex_stack.pop()
        if tag in BLOCK or is_flex:
            self.flush()
        if tag in ('h1', 'h2', 'h3', 'h4', 'h5', 'h6'):
            self.flush()
            self.hd = None
        if tag == 'a' and self.nav:
            self.flush()
            self.nav = None

    def handle_data(self, d):
        if not self.skip:
            self.buf.append(d)


def main(src, dst):
    p = P()
    p.feed(open(src, encoding='utf-8').read())
    p.flush()
    lines = p.out
    start = next(i for i, l in enumerate(lines) if l.startswith('## SECTION id=1 '))
    end = next(i for i in range(start + 1, len(lines))
               if lines[i].startswith('## SECTION id=None') and lines[i + 1].startswith('#h1'))
    with open(dst, 'w', encoding='utf-8') as f:
        f.write('\n'.join(lines[start:end]) + '\n')


if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2])
