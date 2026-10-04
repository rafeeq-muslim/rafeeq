# Rafeeq (رفيق): Gamified learning and habit formation benchmarks

Research date: 2026-10-04. Citations like [12] point to the source list in section 9. Reliability tags: **peer-reviewed** = journal or conference paper; **first-party** = company blog or letter (no independent check); **blog/secondary** = opinion or aggregator; **fatwa** = published scholarly answer. Team principles are treated as proposals still to be confirmed.

---

## 1. Executive summary

- **Duolingo's measured growth levers were retention, streaks and leaderboards.** Its former CPO reports that raising "current user retention" (CURR) had 5x the DAU impact of the next metric, and leaderboards raised learning time 17% [1]. The 7-day-streak figure (3.6x more likely to finish a course) is correlational [2]. Its Q2 2026 letter reports 58.7M DAU and CURR at 84% [8].
- **The same system has documented dark patterns.** A 2025 peer-reviewed design analysis flags excessive notifications and emotionally charged visuals [13]. The 2025 move from hearts to "Energy" drew a user petition [12]. For Rafeeq: adopt path, spaced review and forgiving streaks; reject hearts/energy, leagues and guilt messaging.
- **Gamification works, but modestly and unevenly.** Meta-analysis effects are g = 0.49 (cognitive), 0.36 (motivational) and 0.25 (behavioral), and the last two are less stable [17]. Tangible, expected rewards undermined intrinsic motivation (d = -0.28 to -0.40), while verbal positive feedback raised it (d = +0.31 to +0.33) [20]. In practice this favors praise over points.
- **Forgiving streaks have direct evidence behind them.** Intact streaks raise later behavior, broken streaks lower it, and the damage shrinks when the streak can be repaired [25]. One missed day had little effect on habit formation [26]. Duolingo itself ran a one-time "Streak Revival" for 15.4M learners in June 2026 [8].
- **Habit timelines vary widely.** The median is about 59-66 days, with ranges of 18-254 [26] and 4-335 [27]. A fixed "graduation" threshold would be wrong for many users. We found no mainstream tracker that auto-graduates habits, so this feature is novel and unvalidated.
- **Islamic apps mostly add streaks and trackers, and a minority add points.** A 2025 HCI review of 11 apps found most lack support for autonomy, competence and relatedness [53]. Trust is a live issue after the 2020 Muslim Pro data scandal [48].
- **Scholars permit incentives for learning, with conditions.** Intention must be primary and the prize secondary [56][57]. Some scholars oppose competitions as a route to riya' [59]. We found **no fatwa on app streaks or points specifically**, so the team should get a scholar's review.
- **For beginners:** spaced retrieval and distributed practice have the strongest evidence [31][32]. Text-free, voice-supported design suits low-literacy users [36], though that study was not of converts.

---

## 2. Duolingo mechanics table

| Mechanic | What it does | Evidence / number (source) | Fit for Rafeeq |
|---|---|---|---|
| Path, units, lessons | One linear path of bite-sized lessons grouped into goal-based units, with review woven in; launched 2022-11-01 [5][4] | Duolingo says learners on the path scored higher in reading and listening (no numbers given) [5]. First-party. | **Adopt.** Units by practical goal (e.g. "praying for the first time"). Keep review inside the path. |
| XP | Points for lessons, stories and practice [4] | XP drives leagues. No standalone effect is published. | **Reject as points.** Show "lesson done / unit 60%" instead. |
| Streak | Consecutive days with a lesson [4] | 7-day streak: 3.6x more likely to finish the course (correlational). Animations: +1.7% new-learner retention [2]. DAU with 7+ day streak rose almost 3x, to more than half of DAU [1]. | **Adapt.** Count "days you returned", never reset (see R3). Apply to learning only. |
| Streak freeze / repair / revival | Skip a day without losing the streak. Up to 2 freezes at once, bought with gems [2][4]. Streak Revival, June 2026 [8]. | Doubling freeze capacity: +0.38% active learners [2]. Revival: 15.4M revived, ~8M with no active streak [8]. | **Adopt, but automatic and free.** Pause by default. |
| Hearts, now Energy | Hearts: lose one per mistake; Duolingo says they "keep you from moving too quickly" [4]. Energy (2025) replaces them for free users. | A hearts-like "moves counter" was "completely neutral" in an early Duolingo test [1]. A petition against Energy has 2,977 signatures (Sep 2025) [12]. Anecdotal. | **Reject.** Beginners need safe mistakes. Limits conflict with serving Islamic content. |
| Leagues / leaderboards | Weekly XP ranking in 10 tiers. Opt-out exists [3]. | Learning time +17%. Highly engaged learners (1 h/day, 5 days/week) tripled [1]. Mixed evidence elsewhere (section 3). | **Reject individual ranking. Adapt** to cooperative group progress ("6 of 8 finished"). |
| Gems / shop | In-app currency for freezes and boosts [4] | No impact figure found. | **Reject.** Auto-pause makes it unnecessary. |
| Friends Quests | Two friends share a weekly goal, with pre-written nudges [6] | Learners who follow friends are 5.6x more likely to finish (correlational) [6]. | **Adapt.** Opt-in small group with one shared goal. |
| Notifications | Optimized reminders and a streak-saver alert | Rule: "protect the channel" [1]. Bandit-optimized content: +0.5% DAU, +2% new-user retention [9]. | **Adapt.** User-chosen time, gentle copy, back off if ignored. Reject guilt copy [13]. |
| Spaced repetition and mistake practice | Practice built from your mistakes and from items due for review [4][5] | Half-life regression: +12% daily engagement [10]. Supported by [31][32]. | **Adopt.** |
| Duolingo Max (AI) | GPT-4 "Explain My Answer" and Roleplay, launched 2023-03-14 [11] | Duolingo reports >90% of AI-tool users felt prepared (first-party) [7]. | **Adapt.** AI answers only from a vetted corpus (recommendation, not sourced). |

**Critiques.** The IHC 2025 paper finds "friendly pressure, such as the fear of breaking a streak" plus frequent, emotionally charged notifications [13]. Commentators describe streaks becoming the point rather than the learning [14][16]. An independent semester study (9 learners) found gains but also variable motivation and frustration [15]. Duolingo's earlier efficacy claims are first-party [7].

---

## 3. Research evidence on gamification and habits

**Effect sizes**
- Sailer & Homner (peer-reviewed): g = 0.49 cognitive (k=19, N=1,686), 0.36 motivational (k=16, N=2,246), 0.25 behavioral (k=9, N=951). Only the cognitive effect held in high-rigor studies [17].
- Bai, Hew & Huang: g = 0.504 (30 interventions). The type of game element did not moderate the effect. Learners disliked gamification when it caused anxiety or jealousy [18].
- Li, Ma & Shi (2023): overall g = 0.822, but subgroup values are implausible (some above 3, one at 35.2), so treat it as low reliability [19].

**When it harms**
- Deci, Koestner & Ryan (128 studies): engagement-, completion- and performance-contingent rewards undermined free-choice intrinsic motivation (d = -0.40, -0.36, -0.28). Positive feedback raised it (d = +0.33 behavior, +0.31 interest) [20]. Caveat: tangible rewards, not virtual points.
- Hanus & Fox: a 16-week course with leaderboard and badges lowered motivation, satisfaction and empowerment versus the same course without them [21].
- Counter-evidence: Balci et al. found students were not discouraged by leaderboards, though grades did not improve [24]. Mekler et al. found points, levels and leaderboards did not raise intrinsic motivation [22]. Sailer et al. found badges and leaderboards fed competence, while avatars, stories and teammates fed relatedness: "gamification is not effective per se" [23].
- Implication for Rafeeq: rejecting leaderboards rests on ethics and audience (newcomers, riya' risk), not on proof that they always backfire.

**Streaks and loss aversion**
- Silverman & Barasch (J. Consumer Research, 2023): intact streaks increase later engagement regardless of actual past behavior. The effect works because people adopt the streak as a goal. Broken streaks demotivate, more so when people blame themselves, and less when the streak can be repaired [25]. Their advice to designers is to offer alternate ways to keep a streak going [25].

**Habit formation**
- Lally et al. (2009/2010, 96 volunteers, 12 weeks): median 66 days to the automaticity plateau, range 18-254. "A single missed day had little impact"; many misses reduced the final level. Exercise took about 1.5x as long as eating or drinking habits [26]. Limits: small sample, self-report, health behaviors only.
- Singh et al. 2024 (20 studies, 2,601 participants): median 59-66 days, means 106-154, range 4-335 [27].

**Fresh starts**
- Dai, Milkman & Riis: gym visits rose after a new week (+33.4%) and a new semester (+47.1%). Goal commitments rose after a new week (+62.9%) and a new year (+145.3%) [28]. Islamic landmarks (Ramadan, Hijri new year) are our inference, not tested.

**Baselines and learning science**
- Mental-health app retention medians are 3.9% (day 15) and 3.3% (day 30); tracker apps reach 6.1% on day 30 [29]. Design for lapses, not perfection.
- Endowed progress (giving credit for steps already made) increases persistence [30].
- Distributed practice: 839 assessments, 317 experiments, 184 articles [31]. Practice testing and distributed practice earned the highest utility rating [32].

---

## 4. Habit-tracker benchmark

| App | Growth metaphor | On failure | Evidence |
|---|---|---|---|
| **Finch** | Pet bird grows as you do self-care; cosmetics are the reward | Third-party report: no punishment mechanics [39] | D1/D7 retention 54%/37% vs Duolingo 51%/35% (Deconstructor of Fun, year unstated) [37]. Reviews: 40,294 in 12 months, 4.59 stars. Price complaints: 27% of iOS negative reviews. Lost progress, including one 234-day streak, upset users [38]. |
| **Forest** | Tree grows during a focus session | Tree withers if you leave the app [40] | Launched 2014. Over 2M real trees planted via partner records [40]. |
| **Habitica** | RPG character | HP loss; death costs a level, gold and gear [41] | A LMU study of Habitica found counterproductive effects (qualitative case plus a 45-user field study) [41]. |
| **Streaks** | Chain of days | "Reset to zero" unless the task is scheduled off [42] | Apple Design Award winner; up to 24 tasks [42]. |
| **Fabulous** | Guided "journeys", habit stacking | n/a | Claims 37M users, with no published retention data; Duke lab origin [43]. |
| **Tiimo** | Visual day planner | Celebrates consistency with trophies; no shame-based copy seen on the site (our reading) [44] | Claims iPhone App of the Year 2025, 500k+ active users (self-reported) [44]. |

**Reading.** Loss-based designs (Forest, Habitica, Streaks) rely on fear of loss, which section 3 links to demotivation after a break. Compassionate designs (Finch, Tiimo) report strong retention and review sentiment. Finch's price and data-loss complaints show that **losing saved progress is itself a trust-breaker**. For Rafeeq that means backups and sync from day one.

**Graduation.** We found no tracker that auto-graduates habits, and our attempt to verify the Atoms app failed. The closest research support is the automaticity plateau [26][27]. Risks: a fixed threshold mismatches individual timelines (18-254 days), and "graduated" must not read as "no longer obligatory."

---

## 5. Islamic apps benchmark

| App | Gamification / habit feature | Notes and controversy |
|---|---|---|
| **Quran.com** | Reading goals (minutes or pages; daily or duration-based) and streaks, launched 2023-05-15. A verse a day keeps the streak [45] | No grace days documented [45]. Non-profit Quran Foundation. |
| **Tarteel** | Voice recitation follow-along with mistake detection; goals; streaks and heatmaps [46] | 15M+ users, 4.7 stars from 11K ratings. Premium $16.99/month. Mistake detection is paid [46]. |
| **Muslim Pro** | Prayer and fasting tracker "with streaks and reminders" [47] | 98M downloads (2020). Location data reached the US military via a broker; some users reportedly deleted the app [48]. |
| **Muslim Pillars** | Prayer log, Ramadan tracker, menstrual-cycle tracking, "Qur'an streak freeze", paid badges [49] | 4.8 stars, only 93 ratings [49]. Shows exemptions are expected. |
| **Ajr Pro** | Habit system adapting to prayer times and supporting exemptions [50] | Few ratings. Frames itself around intention. |
| **Deen Tracker** | Salah log, charts and goals; "social-ready" shareable stats cards. Data stays on-device [51] | Sharing cards raise riya' risk (section 6). |
| **Quran Contests** | Global leaderboards and "hasanat"-based contests [52] | Under 1,000 downloads, 3 ratings [52]. |
| **Athan (IslamicFinder)** | Reportedly awards "hasanat" points per prayer [54] | Secondary source only; not verified against the app. |

**Evidence on the category.** Kabir, Kabir & Islam (IJHCI 2025) reviewed 11 popular apps with self-determination theory and interviewed 10 devoted users. Most apps lack autonomy, competence and relatedness features, and fall short on learning, social connection and scholar consultation [53]. A Kazakh religious-studies paper (low-medium reliability) lists points systems in Muslim apps and warns of "spiritual superficiality, commodification of faith and dependency on external motivators" [54]. A small Indonesian quasi-experiment (n=72, Kahoot/Quizizz) raised learning interest in Islamic education classes [74]. User complaints in an aggregator review center on ads in a religious app, sacred content behind paywalls and privacy [55]. We did not find verified data on Qamar or kids' Islamic apps, and nothing on converts.

---

## 6. Islamic scholarly and ethical views on gamifying worship

**Incentives and prizes for religious learning: permitted, with conditions**
- The Permanent Committee (via IslamQA, 2025): no harm in a father giving prizes to encourage prayer, qiyam and recitation, **while stressing ikhlas, so that sincerity is the main aim and the prizes follow** ("الإخلاص هو المقصد الأساس والجوائز تبع") [56].
- Same committee, Shaykh al-Khudayr (2022): prizes in Sharia competitions are allowed if the intention is learning and memorizing, not the prize [57].
- IslamQA (1999): Quran competitions for children are good, citing "وتعاونوا على البر والتقوى" [58]. Ibn Baz classes prizes for memorizers as ju'ala [60]. SeekersGuidance (2025) permits them, within Hanafi limits on competitions that serve knowledge, with sincerity still required [62].

**Dissent and riya' concerns**
- IslamQA 156560 (2011): prizes for **memorizing** are fine, but prizes for merely **completing** the Quran are discouraged. It cites the hadith "no prize-racing except in arrow, hoof or camel" and records that Ibn al-Qayyim favored memorization contests, while **al-Barrak and Ibn 'Uthaymin opposed such competitions as innovations that encourage showing off** [59].
- Riya' is minor shirk: the Prophet ﷺ said what he feared most for his community was minor shirk, and explained it as riya' (Ahmad 23630; graded hasan) [68]. A binbaz.org.sa fatwa says riya' arising during an act can invalidate it, and in separable acts such as recitation only the affected portion loses reward [61]. A contemporary Arabic article lists concealing good deeds as a remedy and calls adjusting worship to onlookers riya' [71].
- The "seven shaded by Allah" hadith praises the one whose charity is hidden (Bukhari 660, Muslim 1031) [67].

**Competition in good (فاستبقوا الخيرات)**
- Quran 2:148 and 83:26 command competing in good [69]. An Arabic article distinguishes praiseworthy emulation (the "two envies" hadith, Umar and Abu Bakr) from worldly rivalry [72]. Competition is thus legitimate, but its form and publicity are the contested part.

**Self-accounting and continuity**
- Muhasaba: Quran 59:18 and Umar's "حاسبوا أنفسكم قبل أن تحاسبوا." Ibn al-Qayyim advised two checkpoints, before an act (intention) and after (shortcomings) [70]. This supports private reflection over public scoring.
- "The most beloved deed to Allah is the most regular, even if little" (Bukhari 6464) [63]; "religion is ease" (Bukhari 39) [64]; "do not be like so-and-so who prayed at night then left it" (Bukhari 1152) [65]; the Prophet ﷺ made up a missed night prayer in the daytime (Muslim 746) [66]. These support resumption, moderation and gentle correction. Applying them to app design is our interpretation, not a ruling.

**Gap.** We found no fatwa on app streaks, badges or "hasanat" counters. Opinion pieces warn about riya' in attention-seeking tech [73]. Get a named scholar's review before launch.

---

## 7. Recommended motivation rules for Rafeeq (recommendations, not findings)

1. **No points, XP, levels or "hasanat" for worship acts; gamify learning progress only.** *Evidence:* rewards can undermine intrinsic motivation [20]; fatwas require the prize to stay secondary [56][57]; the HCI review calls for intrinsic motivation [53]. *Open:* no fatwa on app points (section 6).
2. **Private by default; no shareable stats cards or public profiles.** *Evidence:* riya' hadith and remedies [67][68][71]; Deen Tracker's share cards are the counter-example [51].
3. **Continuity rule: auto-pause, never reset; "welcome back" with no blame.** *Evidence:* broken streaks demotivate, less so if repairable [25]; a single miss is minor [26]; freeze helps (+0.38%) [2]; Duolingo's revival [8]; hadith [63][65][66].
4. **Show cumulative progress, not consecutive-day counters.** *Evidence:* people adopt the streak itself as the goal [25][14]; endowed progress aids persistence [30]; streak numbers do not measure understanding [16].
5. **Group progress only: opt-in, small groups, one shared goal.** *Evidence:* teammates serve relatedness [23]; Friends Quests (correlational) [6]; leaderboards gave mixed results [21][24] and some scholars oppose competitions [59].
6. **Notifications: user-chosen time, at most one a day, positive copy, back off when ignored.** *Evidence:* "protect the channel" [1]; optimized content raised new-user retention 2% [9]; guilt and excess flagged as deceptive [13].
7. **Safe mistakes: no hearts or energy; unlimited retries; mistakes feed the review queue.** *Evidence:* Energy backlash [12]; the hearts-like test was neutral [1]; practice testing is high-utility [32].
8. **Graduation is flexible, confirmed by the user, reversible, and never says "done with the duty".** Suggested rule: eligible after about 8-10 weeks of consistency plus a "this feels automatic" self-report (the 8-10 weeks is our suggestion, not a source figure). Offer a monthly muhasaba-style check-in after graduation. *Evidence:* 18-254 and 4-335 day ranges [26][27]; muhasaba [70].
9. **Use personal landmarks (day of shahada, first Ramadan, Fridays, Hijri new year) for fresh-start resets.** *Evidence:* [28]. Islamic landmarks untested: hypothesis.
10. **Micro lessons, spaced review, audio-first with icons.** *Evidence:* microlearning lengths of 1-15 min with no proven optimum [33], so 3-5 min is a hypothesis to test; spacing and testing [31][32]; text-free voice UIs preferred by low-literacy users [36][34]. Avoid long tutorials [35].
11. **Trust: no location brokers or ad trackers; minimal data; progress backup.** *Evidence:* Muslim Pro [48]; Finch data-loss complaints [38].
12. **Measure return-after-lapse and D7/D30, not streak length.** *Evidence:* low category baselines [29]; Duolingo's CURR focus [1].

---

## 8. Numbers worth citing

| Figure | Source | Date | Reliability |
|---|---|---|---|
| CURR had 5x the DAU impact of the next metric; CURR +21%; daily churn of best users -40%+ | [1] | 2023-02-28 | Medium (first-party) |
| Leaderboards: learning time +17%; highly engaged learners tripled | [1] | 2023-02-28 | Medium |
| DAU 4.5x over four years; 7+ day-streak DAU share almost 3x, to over half | [1] | 2023-02-28 | Medium |
| 7-day streak: 3.6x more likely to finish; doubling freezes +0.38%; animations +1.7% | [2] | 2022-01-31 | Medium-low (correlation; A/B undetailed) |
| Following friends: 5.6x more likely to finish | [6] | 2022-09-09 | Low-medium (correlational) |
| Bandit notifications: +0.5% DAU, +2% new-user retention | [9] | 2020 | High (peer-reviewed A/B) |
| Half-life regression: +12% daily engagement | [10] | 2016 | High-medium |
| Q2 2026: DAU 58.7M (+23%), MAU 140.6M, paid subs 12.7M, CURR 84%, 15.4M streak revivals | [8] | 2026-Q2 | High (SEC filing) |
| Gamification g = 0.49 / 0.36 / 0.25 | [17] | 2020 | High |
| Gamification g = 0.504 | [18] | 2020 | High-medium |
| Rewards d = -0.28 to -0.40; positive feedback d = +0.31 to +0.33 | [20] | 1999 | High (tangible rewards) |
| Habit median 66 days; range 18-254 | [26] | 2009/10 | High-medium (small, self-report) |
| Habit median 59-66; range 4-335; 2,601 participants | [27] | 2024 | High |
| New week +33.4% gym; new semester +47.1%; goals new week +62.9% | [28] | 2014 | High |
| Mental-health app retention: 3.9% (d15), 3.3% (d30); trackers 6.1% (d30) | [29] | 2019 | High (different category) |
| Finch D1/D7 54%/37% vs Duolingo 51%/35% | [37] | year not stated | Low-medium |
| Muslim Pro 98M downloads; US military data purchase | [48] | 2020-11-17 | High |
| Tarteel 15M+ users, 4.7 stars (11K ratings) | [46] | undated | Medium (App Store) |
| Energy petition: 2,977 signatures | [12] | 2025-09-07 | Low (anecdotal) |

**Known gaps.** No sources found on: gamification for converts specifically; onboarding placement tests for beginners (only NN/g's advice to avoid long tutorials [35]); Atoms app; Qamar and kids' apps; Athan's features from a primary source. Duolingo's Max "sunset" was seen only in a third-party snippet and is omitted.

---

## 9. Source list

**Duolingo**
1. Mazal, "How Duolingo reignited user growth," Lenny's Newsletter, 2023-02-28. https://www.lennysnewsletter.com/p/how-duolingo-reignited-user-growth
2. Duolingo blog, streaks and habit, 2022-01-31. https://blog.duolingo.com/how-duolingo-streak-builds-habit
3. Duolingo blog, leagues, 2023-05-03. https://blog.duolingo.com/duolingo-leagues-leaderboards/
4. Duolingo 101, 2024-12-02. https://blog.duolingo.com/duolingo-101-how-to-learn-a-language-on-duolingo
5. Duolingo, new home screen (path), launched 2022-11-01. https://blog.duolingo.com/new-duolingo-home-screen-design
6. Duolingo, Friends Quests, 2022-09-09. https://blog.duolingo.com/friends-quests/
7. Duolingo, efficacy studies, 2024-09-26. https://blog.duolingo.com/results-duolingo-efficacy-studies
8. Duolingo Q2 2026 shareholder letter (SEC 8-K). https://www.sec.gov/Archives/edgar/data/0001562088/000162828026053299/q2fy26duolingo6-30x26share.htm
9. Yancey & Settles, KDD 2020. https://research.duolingo.com/papers/yancey.kdd20.pdf
10. Settles & Meeder, ACL 2016. https://aclanthology.org/P16-1174/
11. TechCrunch on Duolingo Max, 2023-03-14. https://techcrunch.com/2023/03/14/duolingo-launches-new-subscription-tier-with-access-to-ai-tutor-powered-by-gpt-4
12. Petition "Duolingo: Hearts, Not Energy," 2025-09-07. https://www.change.org/p/duolingo-hearts-not-energy
13. Castro & Valença, IHC 2025. https://sol.sbc.org.br/index.php/ihc/article/view/37677 (summary: https://deceptive.design/articles/teaching-or-manipulating-on-the-adoption-of-bright-and-deceptive-patterns-by-duolingo)
14. Jamal, "Streak Creep," The Decision Lab (blog), 2026-03-02. https://thedecisionlab.com/insights/consumer-insights/streak-creep-the-perils-of-too-much-gamification
15. Loewen et al., ReCALL 2019. https://www.cambridge.org/core/journals/recall/article/abs/mobileassisted-language-learning-a-duolingo-case-study/A4D7C8F71782A37D258C19F357DDBCBE
16. Hayes, Relevant (opinion), 2025-02-13. https://relevantmagazine.com/faith/your-bible-app-streak-is-impressive-but-are-you-actually-learning-anything/

**Academic**
17. Sailer & Homner, Educ. Psychology Review 2020. https://opus.bibliothek.uni-augsburg.de/opus4/frontdoor/index/index/docId/109056
18. Bai, Hew & Huang, Educ. Research Review 2020. https://www.gbl.uzh.ch/quartz/references/Bai-et-al.-(2020)
19. Li, Ma & Shi, Frontiers in Psychology, 2023-10. https://pmc.ncbi.nlm.nih.gov/articles/PMC10591086/
20. Deci, Koestner & Ryan, Psychological Bulletin 1999. https://pure.ewha.ac.kr/en/publications/a-meta-analytic-review-of-experiments-examining-the-effects-of-ex/
21. Hanus & Fox, Computers & Education 2015. https://doi.org/10.1016/j.compedu.2014.08.019
22. Mekler et al., Computers in Human Behavior 2017. https://edoc.unibas.ch/32047/
23. Sailer et al., Computers in Human Behavior 2017. https://epub.ub.uni-muenchen.de/53202
24. Balci, Secaur & Morris, 2022. https://pmc.ncbi.nlm.nih.gov/articles/PMC8916940
25. Silverman & Barasch, J. Consumer Research 2023. https://academic.oup.com/jcr/article/49/6/1095/6623414 (news: https://phys.org/news/2024-03-streaks.html)
26. Lally et al., Eur. J. Social Psychology 2009/2010 (via BPS digest). https://bps.org.uk/research-digest/how-form-habit
27. Singh et al., Healthcare 2024. https://doi.org/10.3390/healthcare12232488
28. Dai, Milkman & Riis, Management Science 2014. https://faculty.wharton.upenn.edu/wp-content/uploads/2014/06/Dai_Fresh_Start_2014_Mgmt_Sci.pdf
29. Baumel et al., JMIR 2019. https://jmir.org/2019/9/e14567/PDF
30. Nunes & Drèze, J. Consumer Research 2006. https://academic.oup.com/jcr/article/32/4/504/1789745

**UX and learning science**
31. Cepeda et al., Psychological Bulletin 2006. https://pubmed.ncbi.nlm.nih.gov/16719566/
32. Dunlosky et al. 2013 (APS summary). https://www.psychologicalscience.org/news/releases/which-study-strategies-make-the-grade.html
33. Monib et al., microlearning review, 2024. https://pmc.ncbi.nlm.nih.gov/articles/PMC11774797/
34. Nielsen Norman Group, lower-literacy users, 2005-03-13 (US-centric, dated). https://www.nngroup.com/articles/writing-for-lower-literacy-users/
35. Nielsen Norman Group, app onboarding, 2020-06-21. https://www.nngroup.com/articles/mobile-app-onboarding/
36. Medhi, Sagar & Toyama, text-free UIs. https://www.microsoft.com/en-us/research/?p=160568

**Habit apps**
37. Deconstructor of Fun on Finch. https://www.deconstructoroffun.com/blog/x0hd2ssr80y5n7gv0w967pg7hwd7tl
38. Appbot, Finch reviews (Aug 2025-Aug 2026). https://appbot.co/blog/finch-app-reviews-emotional-attachment-user-retention-product-loyalty/
39. Foxdata on Finch (cited only for the "no punishment mechanics" description; its 4.95 rating conflicts with [38] and is not used). https://foxdata.com/en/blogs/finch-as-app-store-editors-choice-a-self-care-companion/
40. Forest, Wikipedia. https://en.wikipedia.org/wiki/Forest_(application)
41. Habitica wiki https://habitica.fandom.com/wiki/Death ; LMU study https://epub.ub.uni-muenchen.de/77668 (seen via search snippet only)
42. Streaks. https://streaksapp.com/
43. Fabulous. https://www.thefabulous.co/
44. Tiimo. https://www.tiimoapp.com/

**Islamic apps**
45. Quran.com streaks, 2023-05-15. https://quran.com/product-updates/quran-reading-streaks
46. Tarteel App Store https://apps.apple.com/app/id1391009396 ; blog (2022-01-04) https://tarteel.ai/blog/introducing-mistake-detection/
47. Muslim Pro App Store (via search summary). https://apps.apple.com/app/id388389451
48. Al Jazeera, 2020-11-17. https://www.aljazeera.com/news/2020/11/17/report-us-military-buying-location-data-on-popular-muslim-apps
49. Muslim Pillars App Store. https://apps.apple.com/us/app/id1529761608
50. Ajr Pro App Store. https://apps.apple.com/ye/app/6755149104
51. Deen Tracker App Store. https://apps.apple.com/us/app/id6449619738
52. Quran Contests. https://mwm.ai/apps/quran-contests/6751038887
53. Kabir, Kabir & Islam, IJHCI 2025. https://www.tandfonline.com/doi/full/10.1080/10447318.2025.2595545 (summary: https://www.seresearch.qmul.ac.uk/chcc/news/5450/riasat-islam-apps-meeting-the-spiritual-needs-of-modern-muslims/)
54. Alimkhanova et al., "Religious gamification," 2025. https://bulletin-religious.kaznu.kz/index.php/relig/en/article/view/772
55. Unstar app comparison (blog). https://unstar.app/blog/muslim-pro-quran-majeed-athan-pillars-tarteel-quran-prayer-apps-ranked-2026

**Scholarly**
56. IslamQA 570972 (2025-05-22). https://islamqa.info/ar/answers/570972
57. IslamQA 388092 (2022-11-06). https://islamqa.info/ar/answers/388092
58. IslamQA 5526 (1999-11-14). https://islamqa.info/ar/answers/5526
59. IslamQA 156560 (2011-02-24). https://islamqa.info/ar/answers/156560
60. Ibn Baz on prizes for memorizers. https://binbaz.org.sa/fatwas/9388/حكم-الجواىز-لحفاظ-القران-الكريم
61. Binbaz.org.sa on riya' during an act. https://binbaz.org.sa/fatwas/21901/حكم-من-طرا-عليه-الرياء-اثناء-العمل
62. SeekersGuidance, Quran competition prizes (2025-10-19). https://seekersguidance.org/answers/hanafi-fiqh/is-it-permissible-to-accept-prizes-for-a-quran-competition/
63. Bukhari 6464. https://ihadis.com/en/bukhari/hadith/6464
64. Bukhari 39 (Dorar). https://dorar.net/hadith/sharh/1478
65. Bukhari 1152. https://sunnah.com/bukhari:1152
66. Muslim 746. https://sunnah.com/muslim:746e
67. Bukhari 660 / Muslim 1031. https://www.abuaminaelias.com/dailyhadithonline/2012/08/08/seven-shaded-by-allah/
68. Ahmad 23630. https://hadeethenc.com/en/browse/hadith/3381
69. Quran 2:148 https://quran.com/2/148 ; 83:26 https://quran.com/83/26
70. Muhasaba, Wikipedia. https://en.wikipedia.org/wiki/Muhasaba
71. Alukah, riya' article. https://www.alukah.net/sharia/0/23657/%d8%b3%d9%8a%d8%a6%d8%a9-%d8%a7%d9%84%d9%82%d9%84%d9%88%d8%a8-%d8%a7%d9%84%d8%b1%d9%8a%d8%a7%d8%a1/
72. Masrawy, المنافسة في الخيرات (2014-04-15). https://www.masrawy.com/islameyat/makalat-other/details/2014/4/15/218218/المنافسة-في-الخيرات
73. Zeed Sharia blog, 2025-09-10. https://blog.zeedsharia.com/game-of-attention-in-islamic-perspective/
74. Khatimah & Zahraini, Al-Ilmu 2025 (n=72). https://doi.org/10.62872/p2j6pb86
