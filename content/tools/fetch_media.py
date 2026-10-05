"""Write content/day-one-media.json from the IslamHouse API (items listed in docs/agents/sources.md).

Usage: python3 tools/fetch_media.py
Uses the public API key from sources.md; every request has a 30 s timeout. If the API
fails, the item is written with its id only and `mp3_url`/`files` set to null.
"""
import json, os, urllib.request
from datetime import date

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
API = 'https://api3.islamhouse.com/v3/paV29H2gm56kvLPy/main/get-item/{id}/{lang}/json'

AUDIO = [('ar', 2831350), ('en', 2839573), ('tl', 2839167)]
VIDEO = [('wudu', 'ar', 2834583), ('wudu', 'en', 2834586), ('prayer', 'ar', 2832089), ('prayer', 'en', 2838921)]


def get(item_id, lang):
    try:
        req = urllib.request.Request(API.format(id=item_id, lang=lang), headers={'User-Agent': 'curl/8.5.0'})
        with urllib.request.urlopen(req, timeout=30) as r:
            return json.load(r)
    except Exception as e:      # recorded, not fatal
        return {'_error': str(e)}


def files(d):
    return [{'order': a.get('order'), 'description': a.get('description'), 'url': a.get('url'),
             'size': a.get('size'), 'type': a.get('extension_type')} for a in d.get('attachments', [])]


def main():
    out = {
        'fetched': date.today().isoformat(),
        'source': 'IslamHouse API v3 (get-item); items chosen in docs/agents/sources.md',
        'review_status': 'in_review',
        'note': ('All audio and video must be heard/watched in full by the Sharia reviewer before use '
                 '(no music or effects). Files are to be served from Rafeeq, never embedded from a video '
                 'platform; written confirmation from IslamHouse is still pending (LRN-01 open question).'),
        'al_fatiha_audio': [],
        'support_videos': [],
    }
    for lang, iid in AUDIO:
        d = get(iid, lang)
        f = files(d)
        out['al_fatiha_audio'].append({
            'lang': lang, 'islamhouse_id': iid, 'title': d.get('title'),
            # one file (Arabic: recitation + tafsir) or one file per verse (en/tl: recitation then meaning)
            'mp3_url': f[0]['url'] if len(f) == 1 else None,
            'mp3_urls': [x['url'] for x in sorted(f, key=lambda x: x['order'] or 0)] or None,
            'per_verse': len(f) > 1,
            'files': f or None,
            'error': d.get('_error'),
        })
    for topic, lang, iid in VIDEO:
        d = get(iid, lang)
        f = files(d)
        out['support_videos'].append({
            'topic': topic, 'lang': lang, 'islamhouse_id': iid, 'title': d.get('title'),
            'mp4_url': f[0]['url'] if f else None, 'size': f[0]['size'] if f else None,
            'type': f[0]['type'] if f else None, 'error': d.get('_error'),
        })
    out['support_videos'].append({'topic': 'wudu+prayer', 'lang': 'tl', 'islamhouse_id': None, 'title': None,
                                  'mp4_url': None, 'size': None, 'type': None,
                                  'error': 'No approved Tagalog video (sources.md); Tagalog lessons show no video (LRN-01 rule 5).'})
    with open(os.path.join(ROOT, 'day-one-media.json'), 'w', encoding='utf-8') as fh:
        json.dump(out, fh, ensure_ascii=False, indent=2)
        fh.write('\n')
    print(json.dumps(out, ensure_ascii=False, indent=1)[:1500])


if __name__ == '__main__':
    main()
