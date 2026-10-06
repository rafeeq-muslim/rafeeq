# ORG-01 join through an organisation: implementation

**Feature:** `docs/domains/organizations/features/ORG-01-join-through-an-organization.md` (PR #32) · **Rules touched:** `rules.md` §4 (minimum data, delete at any time), PDPL art. 1 sensitive data (research/10) · **Written:** 2026-10-06 by Claude. Decisions: `decisions-for-review.md` «ORG-01..03».

## 1. Rules → modules

| Rule | Module | Behaviour |
| --- | --- | --- |
| R1 one code per organisation and language | `backend/app/organizations/models.py::OrgCode` (unique org + language), created in `manage.py::create_org`; link built by `manage.py::welcome_path`; QR in `frontend/src/app/pages/roles/Org.tsx::CodeList` (`uqr`) | `/app/welcome?lang=tl&org=K7M2QX9P` (under `/app` since PLT-10 R2), the same for everyone. `GET /api/org/codes/{code}` returns name + language and stores nothing |
| R2 starts in the language, asks once | `frontend/src/app/AppLayout.tsx` (forwards `lang` and `org` only), `pages/Welcome.tsx` (step `org` after the introduction), `org/OrgQuestion.tsx`; `POST /api/org/link` (`links.py::link`) | The code stays in React state; the query is dropped from the URL. «نعم» → link + `rafeeq.org` on the device; «لا» → nothing sent, nothing kept |
| R3 typed code in «حسابي» | `org/OrgSection.tsx` in `pages/Me.tsx` | Same question; a wrong code shows «تحقق من الرمز» and nothing about any organisation |
| R4 one at a time, unlink any time | `links.py::link` (deletes the device's previous link first), `POST /api/org/link/remove`; `org/api.ts::unlinkOrg` from «حسابي», `lib/privacy.ts::wipeDevice`, `Me.tsx::DeleteAccount` | Link and status history deleted at once (cascade); nobody is told; frozen daily figures stay (ORG-03 R6) |
| R5 no power over the learner | no route lists, names or messages linked learners; CMP-01/CMP-03 untouched | Tested by walking the coordinator's responses and the route table |

## 2. Data

`org_links` (organisation, install ID, code language, linked at, MOT-07 status copy) and `org_link_statuses` (status changes since linking). No account id, no IP, no name. The install ID travels only in POST bodies.

## 3. Tests

`backend/tests/test_org01_join.py` (12), `frontend/src/app/org/org.rules.test.tsx` (`org01_*`, 10).
