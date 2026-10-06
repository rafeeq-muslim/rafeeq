# Platform: privacy law, quick exit, notifications, the Rafeeq tone

Research date: 2026-10-06. Supports PLT-01, PLT-02, PLT-03, PLT-05, PLT-06 and PLT-07. "Read" means the source itself was opened on that date.

## 1. Saudi Personal Data Protection Law (PDPL) [L1]

| Article | What it requires | What it means in Rafeeq | Status |
| --- | --- | --- | --- |
| Definitions | Sensitive data includes a person's **religious belief** and **location data** | Using Rafeeq itself points to a religion. Collect the minimum, keep location on the device (already a rule) | Read |
| 4 | Rights: to know; to **access and get a free copy** in a clear form; to correct; to **request destruction** | In-app «حمّل نسخة من بياناتي» and «احذف حسابي وبياناتي» | Read |
| 12 | The controller adopts a **privacy policy available before collecting data**: purpose, data collected, how it is collected, stored, processed and destroyed, the owner's rights and how to exercise them | A short policy in ar/en/tl, readable without an account, linked before any data is entered | Read |
| 13 | Before collecting data directly, tell the owner the reason, the purpose, and whether each item is mandatory or optional | A one-line notice beside each form (PLT-02 R4 already does this for the account) | Read |

The challenge package says the same: collect personal or sensitive data only as needed and **under a published policy** (المرجعية والحزمة العلمية، ص 5). The app had no privacy policy page on 2026-10-06, and no data export.

## 2. Quick exit [G1]

- GOV.UK's «Exit this page» component sends the user to BBC Weather by default, offers a keyboard shortcut (press Shift three times), and shows a covering overlay at once on slow connections.
- It was tested mainly with people at risk of domestic abuse.
- Browser history is not erased by any web page. Tell the user how history works rather than promising it is gone.
- Rafeeq's quick exit already replaces the page with BBC Weather (`AppLayout.tsx`).

## 3. Notifications on the web

- **iPhone and iPad:** web push works from iOS/iPadOS 16.4, only for a web app **added to the Home Screen**, and the permission request must follow a tap [W1].
- **Sound:** the Notifications API offers only `silent` (no sound at all); there is no option for a custom sound [M1]. A web notification plays the device's own sound, so a Rafeeq tone can play only while the app is open, or in a future native app.

## 4. The Rafeeq tone (PLT-07), Sharia

- Permanent Committee (via IslamQA 13502): musical tones on phones are not permitted; the ordinary ring is used instead [Q1].
- IslamQA 115674: the adhan may alert at the real prayer time; using the adhan as a ringtone is not allowed (`research/07`).
- So: a short, plain alert with no melody and no instrument, not imitating the adhan or recitation, approved by the Sharia reviewer.

## 5. Onboarding

- The convert-care study recommends not asking new Muslims for personal information at first ([C1] pp. 143–146, `docs/domains/knowledge/research/convert-research.md`).
- Filipinos are the largest group of converts in Saudi Arabia ([C1] p. 143). The app offers Arabic, English and Tagalog.

## 6. Installed app name and icon

The installed web app keeps the name and icon of its manifest («Rafeeq», the flower). A page cannot change them per user (inference from how manifests work ⚠️). Both are already neutral: no religious word or symbol. Discreet mode changes the page title and the notifications.

## 7. Proposed privacy policy (Arabic, for the product owner to approve)

Built from what the app does on 2026-10-06 (`rules.md` §4, `docs/engineering/*`). English and Tagalog follow once approved. Every line is checked against the code, not written as a promise.

> **خصوصيتك في رفيق**
>
> **ما نحفظه على جهازك وحده:** تقدّمك في الدروس، ومدينة مواقيت الصلاة، ودفتر أسئلتك. موقعك لا يغادر جهازك أبدًا.
>
> **ما نحفظه عندنا إن أنشأت حسابًا:** اسمك المعروض، واسم المستخدم، وكلمة المرور محفوظة بطريقة لا يقرؤها أحد حتى نحن، ونسخة من تقدّمك لتجدها على جهاز آخر. وبريدك فقط إن فعّلت التحقق بخطوتين. وجنسك ولغاتك فقط إن اخترت مرشدًا أو مجموعة، للمطابقة.
>
> **ما نحفظه حين تتواصل:** رسائلك مع من يرد عليك، ورسائل مجموعتك، وبلاغاتك.
>
> **أسئلتك للمساعد:** يُرسل نص السؤال وحده إلى مزوّد الذكاء الاصطناعي (عبر OpenRouter)، بلا اسمك ولا أي شيء يدل عليك، ولا نستعمل مزوّدًا يحتفظ بالأسئلة أو يدرّب عليها.
>
> **إحصاءات الاستخدام:** أحداث مجهولة الهوية لنعرف أين يتوقف المتعلّمون، ويمكنك إيقافها من «حسابي».
>
> **ما لا نفعله أبدًا:** لا نبيع بياناتك، ولا إعلانات ولا أدوات تتبع، ولا نحفظ عنوان IP في سجلات التطبيق.
>
> **حقوقك:** تنزيل نسخة من بياناتك، وحذف حسابك وكل بياناته، ومسح بيانات جهازك. كلها من «حسابي»، ومتى شئت.
>
> **متى تُحذف:** تبقى بياناتك حتى تحذف حسابك أو تمسح بيانات جهازك.

## 8. Sources

- [L1] نظام حماية البيانات الشخصية (هيئة الخبراء بمجلس الوزراء): https://laws.boe.gov.sa/boelaws/laws/lawdetails/b7cfae89-828e-4994-b167-adaa00e37188/1 ; SDAIA guide to privacy policies: https://dgp.sdaia.gov.sa/wps/portal/pdp/knowledgecenter/details/ElaborationandDevelopingPrivacyPolicyGuideline
- [G1] GOV.UK Design System, Exit this page: https://design-system.service.gov.uk/components/exit-this-page/
- [W1] WebKit, Web Push for Web Apps on iOS and iPadOS: https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/
- [M1] MDN, Notification.silent: https://developer.mozilla.org/en-US/docs/Web/API/Notification/silent
- [Q1] IslamQA 13502 (Permanent Committee), «نغمة الموسيقى في الجوال حرام»: https://islamqa.info/ar/answers/13502
