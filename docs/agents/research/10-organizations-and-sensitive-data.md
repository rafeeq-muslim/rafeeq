# Organisations: linking new Muslims to a da'wa office without exposing them

Research date: 2026-10-06. Supports ORG-01 to ORG-03. Status marks: ✅ read at source; ⚠️ seen in a search summary or secondary source only.

## 1. Summary

- **Linking a user to a da'wa office is sensitive data twice over.** Saudi Arabia's Personal Data Protection Law defines sensitive data as any personal data that refers to a person's **religious belief**, or that **indicates membership in civil associations or institutions**, and also includes **location data** [L1] ✅. An office's link tells us a person converted there.
- **So the link rests on explicit consent, never on "legitimate interest".** SDAIA's guide: legitimate interest cannot be the basis for processing sensitive data (PDPL Art. 6(4)); if consent is the basis, it must be explicit (Art. 11 of the Implementing Regulation); individuals may withdraw consent at any time (Art. 5(2)) [L2] ✅.
- **What an office sees must be aggregated, with small numbers hidden.** Rafeeq's own rule for team indicators already hides any figure based on fewer than 10 people (MOT-08 R6). US CMS applies the same idea to health data: no cell from 1 to 10 is displayed, and no percentage may reveal one [S1] ⚠️.
- **Offices ask for more than this.** The coordinator persona wants "a record per convert (contact, language, nationality, sponsor issue)" and "visibility of dropouts" (`research/04` §6). Rafeeq gives the second as counts, and leaves individual follow-up to the mentor relationship, which the learner controls (CMP-02, MOT-07 R6).
- **The team's own submission** promises referral "by a code or link from dialogue platforms and da'wa offices", mentors "approved by the organisation", and an organisation dashboard whose main indicator is continuation after 30 and 90 days (participation deck, page 4 «المنظومة»; it also says approved mentors are rewarded with badges and certificates).

## 2. Design consequences

| Finding | Rule |
| --- | --- |
| Religion and association membership are sensitive [L1] | One code per organisation and language, never per person; the link is kept only after the learner says yes (ORG-01) |
| Explicit consent; withdrawal at any time [L2] | A clear yes/no question naming the office; unlinking in Me at any time, nobody is told (ORG-01) |
| Small numbers identify people [S1], MOT-08 R6 | Any figure under 10 shows «أقل من 10», and no percentage is built on it (ORG-03) |
| Mentor safety risks: marriage, money, recruitment (CMP domain card) | The office vouches for its mentors, who accept the mentor rules before their inbox opens (ORG-02) |

## 3. Conflict to resolve

- **PLT-01 R2** says a link carries the language only, and its example says Rafeeq learns nothing from it, not even the office. ORG-01 needs the office in the link. Proposal: the link carries the office and the language; the office is kept only if the learner answers yes. Needs the product owner.

## 4. Sources

- [L1] Bureau of Experts at the Council of Ministers, Personal Data Protection Law, Article 1 (definitions): https://laws.boe.gov.sa/boelaws/laws/lawdetails/b7cfae89-828e-4994-b167-adaa00e37188/1 ✅
- [L2] SDAIA, Guide to the Saudi Personal Data Protection Law for controllers and processors: https://dgp.sdaia.gov.sa/wps/wcm/connect/f579bc32-fda8-47bd-bc6f-66b8cb77985c/ENG-Guide+to+the+saudi+PDP+law+for+controllersprocessors.pdf?MOD=AJPERES ✅
- [S1] US Department of Health and Human Services, CMS cell suppression policy: https://www.hhs.gov/guidance/document/cms-cell-suppression-policy ⚠️ (page refused automated reading; quoted from search results)
- Tawakkalna "New Muslim" digital card, July 2026: `evidence.md` (press) — a possible later integration, out of scope.
