# Rafeeq promo video (Arabic)

`rafeeq-promo-ar.mp4`: 1:24.7, 1080×1920 (vertical, phone-first), 30 fps, H.264. Arabic on-screen captions; the voice-over slots are silent until the recorded phrases are dropped in (see below). No music and no sound effects, by design (`docs/agents/rules.md` §1.4).
`rafeeq-promo-poster.png`: a still from scene 2 for thumbnails.
`script.ar.md`: the voice-over script: 14 numbered phrases, each with its fully vowelled reading text, target length, time window, what plays on screen and delivery notes, plus the recording brief for the voice artist.

## What it shows

Every screen in the phone is a real capture of the app (this repository's frontend and backend, run locally on a copy of the dev database without any user data). Nothing was submitted to production. The Ask answers are real outputs of the assistant pipeline (KNW-01), the «لماذا؟» explanation and the guide message are real model outputs (LRN-03, LRN-07), and the hadith text comes from the stored HadeethEnc record. Organisations (ORG-01..03) are not built yet, so the video only shows «قريبًا» for them.

| # | Scene | Features |
| --- | --- | --- |
| 01 | The logo flower draws itself | — |
| 02 | Language screen, Home in Arabic, English, Tagalog | PLT-01, PLT-03, PLT-02 (no account) |
| 03 | Path, verse card, order and match exercises | LRN-01, LRN-02, LRN-03 |
| 04 | Safe mistake, then «لماذا؟» from the card text only | LRN-03, KNW-10 |
| 05 | Lesson done with the guide message, then review | LRN-07, LRN-04, LRN-10 |
| 06–07 | Ask: sourced answer, stored hadith, source strips | KNW-01, KNW-02 |
| 08 | Personal case referred to a person; danger panel with official helplines | KNW-01, CMP-01 |
| 09 | «أريد إنسانًا»: topics and «أخ أم أخت؟» | CMP-01, CMP-02 |
| 10 | Prayer times and Hijri date; qibla compass turning | PRC-01, PRC-04 |
| 11 | Unit badge; private habits | MOT-02, MOT-03, PRC-02 |
| 12 | Quick exit, discreet mode, download my data | PLT-05 |
| 13 | Sharia review desk | KNW-05 |
| 14 | Logo, line, rafeeq.nan.sa | — |

## How it is made

`hyperframes/` is a [HyperFrames](https://github.com/heygen-com/hyperframes) project (HTML + GSAP rendered to video in headless Chrome), set up with the approach of Nate Herk's HyperFrames student kit.

- `scenes.json` is the single source of truth: one phrase per scene, its caption, its vowelled reading text and its length.
- `build.mjs` generates `index.html` from it (brand colours from `frontend/src/styles/tokens.css`, the logo flower geometry from `frontend/src/components/rafeeq/brand.tsx`, Tabler icons). Every scene lasts exactly its phrase's length, so re-timing never needs HTML edits.
- `render.mjs` builds, renders with HyperFrames and encodes `../rafeeq-promo-ar.mp4` and the poster with the npm-provided static ffmpeg (no system install needed).
- `assets/screens/*.jpg` are the app captures; `assets/brand/` is the official reverse wordmark.

### Fonts

The video uses the app's fonts. Thmanyah may only be bundled inside the app, so it is **never committed** here: `build.mjs` copies it from the git-ignored `frontend/public/fonts/thmanyah/` (or from `$RAFEEQ_THMANYAH_DIR`) into the git-ignored `hyperframes/fonts/`. Without it, the render falls back to IBM Plex Sans Arabic and Noto Naskh Arabic (from `frontend/public/landing/fonts/`) and prints a warning.

## Re-render

Needs Node 22+. Nothing system-wide (no ffmpeg or Chrome install, no sudo): HyperFrames downloads its own headless Chrome on first use.

```sh
cd media/promo/hyperframes
npm install
RAFEEQ_THMANYAH_DIR=/path/to/frontend/public/fonts/thmanyah npm run render   # → ../rafeeq-promo-ar.mp4 + poster
npm run render:draft    # fast check → renders/draft.mp4
npm run preview         # HyperFrames Studio, scrub the timeline in a browser
npm run lint
```

## Add the recorded voice-over

1. Record the 14 phrases of `script.ar.md` as separate files (brief in that file).
2. Put them in `media/promo/audio/` as `01.wav` … `14.wav` (`.mp3`, `.m4a`, `.flac` also work).
3. Run:

```sh
cd media/promo/hyperframes
npm install
npm run voice -- --check   # lengths per phrase and the new total, changes nothing
npm run voice              # fit, rebuild, render ../rafeeq-promo-ar.mp4 with the voice
```

`voice.mjs` trims the silence around each file, normalises loudness (−16 LUFS, 48 kHz), sets each scene to `lead + phrase + tail` (never shorter than the scene's visual minimum), writes the new lengths into `scenes.json`, places each phrase at the start of its scene, and renders. Captions stay on screen. Missing files keep their silent slot. It stops if the total would reach 90 s and lists the lengths so the long phrases can be re-recorded a little faster. Commit `audio/*` and the updated `scenes.json`, `index.html`, MP4 and poster together.

## Checks done on this render

Frames at every scene and at the transitions were extracted and inspected for Arabic shaping and direction, legibility of captions over the night sky, the brand palette and fonts, pacing against the target phrase lengths, and the binding rules: no images of people's faces, prophets or companions; no music; Quran and hadith only as stored and shown in the app; worship never rewarded; no personal data in any capture.
