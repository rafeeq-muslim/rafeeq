"""Build content/units/unit-01/unit.json from the official site texts.

Book text is taken verbatim (only invisible characters, kashida and list
numbers are stripped). Transliterated adhkar in English and Filipino are
replaced with the Arabic wording from the Arabic edition; every such card
records the edit. Objectives, exercises and names are AI-authored drafts.
"""
import json, re, sys
from pathlib import Path

SRC = Path(sys.argv[1])
OUT = Path(sys.argv[2])
LINES = {l: (SRC / f"{l}.txt").read_text(encoding="utf8").split("\n") for l in ("ar", "en", "tl")}

def clean(s):
    s = re.sub(r"[​-‏‪-‮⁦-⁩﻿]", "", s)
    s = s.replace("ـ", "")
    s = re.sub(r"^\s*[:\d]+\s{1,}(?=\D)", "", s)
    return re.sub(r"[ \t]+", " ", s).strip()

def bare(s):
    return re.sub(r"[\u064b-\u0652\u0670]", "", s)

def line(lang, prefix, nth=0):
    hits = [clean(l) for l in LINES[lang] if bare(clean(l)).startswith(bare(prefix))]
    if len(hits) <= nth:
        raise SystemExit(f"missing [{lang}] {prefix!r}")
    return hits[nth]

def after(lang, prefix, count, nth=0):
    """The `count` non-empty, non-number lines that follow a heading line."""
    idx = [i for i, l in enumerate(LINES[lang]) if bare(clean(l)).startswith(bare(prefix))][nth]
    out = []
    for l in LINES[lang][idx + 1:]:
        c = clean(l)
        if not c or re.fullmatch(r"\d+", c):
            continue
        out.append(c)
        if len(out) == count:
            break
    return out

def T(ar, en, tl):
    return {"ar": ar, "en": en, "tl": tl}

SITE = "newmuslimguideline.com"
def src(section):
    return {"source": SITE, "section": section}

AR_ADHKAR = {
    "takbir": "(الله أكبر)",
    "opening": "(سُبْحَانَكَ اللَّهُمَّ وَبِحَمْدِكَ، وَتَبَارَكَ اسْمُكَ وَتَعَالَى جَدُّكَ، وَلَا إِلَهَ غَيْرَكَ)",
    "istiadha": "(أعوذُ باللهِ من الشيطان الرجيم)",
    "ruku": "(سبحان ربي العظيم)",
    "rising": "(سمع الله لمن حمده)",
    "rabbana": "(ربنا ولك الحمد)",
    "sujud": "(سبحان ربي الأعلى)",
    "jalsa": "(ربي اغفر لي)",
    "taslim": "(السلام عليكم ورحمة الله)",
}
EDIT = "Transliterated wording replaced with the Arabic wording from the Arabic edition (LRN-01 rule 3)."

def card(cid, text, section, objectives, image=None, kind="text", **extra):
    c = {"id": cid, "kind": kind, "text": text, "provenance": src(section), "objectives": objectives}
    if image:
        c["image"] = f"images/{image}.webp"
    c.update(extra)
    return c

def quran(cid, ref, ar, en, tl, objectives, section):
    return {"id": cid, "kind": "quran", "ref": ref, "text": T(ar, en, tl), "provenance": src(section),
            "objectives": objectives,
            "verify": "Check the Arabic against the King Fahd Complex text and the translations against QuranEnc before release."}

def ex(eid, typ, objectives, prompt, explain_card, **body):
    e = {"id": eid, "type": typ, "objectives": objectives, "prompt": prompt, "explain_card": explain_card}
    e.update(body)
    return e

def opt(oid, ar, en, tl):
    return {"id": oid, "text": T(ar, en, tl)}

def strip_ref(s):
    return s

# ---------------------------------------------------------------- lesson 1
ar_v1 = line("ar", "قال تعالى: ﴿فَاعْلَمْ")
ar_v2 = line("ar", "وقال تعالى: ﴿لَقَدْ جَاءكُمْ")
en_v1 = line("en", "Allah Almighty says: {So know [O Muhammad]")
en_v2 = line("en", "He also says: {There has certainly come to you a Messenger")
tl_v1 = line("tl", "Sinabi ng Allah: “At iyong alamin")
tl_v2 = line("tl", "Sinabi pa ng Allah: “Katiyakang dumating sa inyo")

L1 = {
    "id": "u01-l1", "order": 1,
    "title": T("أشهد", "I Bear Witness", "Ako ay Sumasaksi"),
    "objectives": [
        {"id": "u01-l1-o1", "text": T("يعرف معنى «لا إله إلا الله»: لا معبود حق إلا الله",
                                      "Knows that “there is no god but Allah” means there is no deity worthy of worship except Allah",
                                      "Alam na ang “لا إله إلا الله” ay nangangahulugang walang ibang diyos na karapat-dapat sambahin maliban sa Allah")},
        {"id": "u01-l1-o2", "text": T("يعرف معنى «محمد رسول الله»",
                                      "Knows what “Muhammad is the Messenger of Allah” means",
                                      "Alam ang kahulugan ng “si Muhammad ay Sugo ng Allah”")},
    ],
    "cards": [
        card("u01-l1-c1", T(line("ar", "شهادة أنَّ لا إله إلا الله وأنَّ محمدًا"),
                            line("en", "Shahādah (To bear witness"),
                            line("tl", "Ang Shadatayn o pagsasaksi")),
             "The Pillars of Islam: the first pillar", ["u01-l1-o1", "u01-l1-o2"]),
        quran("u01-l1-c2", "47:19", ar_v1, en_v1, tl_v1, ["u01-l1-o1"], "The first pillar"),
        quran("u01-l1-c3", "9:128", ar_v2, en_v2, tl_v2, ["u01-l1-o2"], "The first pillar"),
        card("u01-l1-c4", T(line("ar", "معنى شهادة أنَّ لا إله إلا الله"),
                            line("en", 'The Shahādah that "There is no god but Allah"'),
                            re.sub(r"[‘’']+la ilaha illa Allah[‘’']+", "“لا إله إلا الله”", line("tl", "Ang kahulugan ng pagsasaksi ng"))),
             "The first pillar", ["u01-l1-o1"], edited={"tl": EDIT}),
        card("u01-l1-c5", T(line("ar", "معنى شهادة أنَّ محمدًا رسول الله"),
                            line("en", "The Shahādah that “Muhammad is the Messenger of Allah”"),
                            line("tl", "Ang kahulugan ng pagsasaksi na si Muhammad")),
             "The first pillar", ["u01-l1-o2"]),
    ],
}
M1 = T("لا معبودَ حقٌّ إلا الله", "There is no deity worthy of worship except Allah",
       "Walang ibang diyos na karapat-dapat sambahin maliban sa Allah")
M2 = T("طاعته فيما أمر، وتصديقه فيما أخبر، واجتناب ما نهى عنه، وألا يُعبد الله إلا بما شرع",
       "To obey his orders, believe what he related, leave what he forbade, and worship Allah only in the manner he instructed",
       "Ang pagsunod sa kanyang utos, paniniwala sa kanyang ibinalita, pag-iwas sa kanyang ipinagbawal, at pagsamba sa Allah alinsunod sa kanyang itinuro")
L1["exercises"] = [
    ex("u01-l1-e1", "choice", ["u01-l1-o1"],
       T("ما معنى «لا إله إلا الله»؟", "What does “there is no god but Allah” mean?", "Ano ang kahulugan ng “لا إله إلا الله”?"),
       "u01-l1-c4",
       options=[opt("a", *M1.values()), opt("b", *M2.values()),
                opt("c", "أن الإنسان يعبد ما يشاء", "That a person may worship whatever he wishes", "Na maaaring sambahin ng tao ang anumang nais niya")],
       answer="a"),
    ex("u01-l1-e2", "choice", ["u01-l1-o2"],
       T("أيّ هذه من معنى «محمد رسول الله»؟", "Which of these is part of the meaning of “Muhammad is the Messenger of Allah”?",
         "Alin dito ang bahagi ng kahulugan ng “si Muhammad ay Sugo ng Allah”?"),
       "u01-l1-c5",
       options=[opt("a", "طاعته فيما أمر", "To obey his orders", "Ang pagsunod sa kanyang utos"),
                opt("b", "أن يُعبد هو مع الله", "To worship him alongside Allah", "Ang sambahin siya kasama ng Allah"),
                opt("c", "أن نختار من أوامره ما يعجبنا", "To choose only the orders we like", "Ang piliin lamang ang mga utos na gusto natin")],
       answer="a"),
    ex("u01-l1-e3", "match", ["u01-l1-o1", "u01-l1-o2"],
       T("صِل كل شهادة بمعناها", "Match each testimony with its meaning", "Itugma ang bawat pagsaksi sa kahulugan nito"),
       "u01-l1-c1",
       pairs=[{"left": T("لا إله إلا الله", "There is no god but Allah", "لا إله إلا الله"), "right": M1},
              {"left": T("محمد رسول الله", "Muhammad is the Messenger of Allah", "Si Muhammad ay Sugo ng Allah"), "right": M2}]),
    ex("u01-l1-e4", "choice", ["u01-l1-o1"],
       T("من يستحق العبادة وحده؟", "Who alone is worthy of worship?", "Sino lamang ang karapat-dapat sambahin?"),
       "u01-l1-c4",
       options=[opt("a", "الله", "Allah", "Allah"),
                opt("b", "الأنبياء", "The prophets", "Ang mga propeta"),
                opt("c", "الصالحون", "Righteous people", "Ang mabubuting tao")],
       answer="a"),
]

# ---------------------------------------------------------------- lesson 2
ar_need = after("ar", "ما يجب له الوضوء", 3)
en_need = after("en", "What are the acts of worship for which ablution is obligatory", 3)
tl_need = after("tl", "Kailan magiging wajib o obligado", 3)
L2 = {
    "id": "u01-l2", "order": 2,
    "title": T("قبل الوضوء", "Before Wudu’", "Bago ang Wudhu"),
    "objectives": [
        {"id": "u01-l2-o1", "text": T("يعرف أن الطهارة شرط لصحة الصلاة", "Knows that purification is a condition for the validity of prayer",
                                      "Alam na ang paglilinis ay kondisyon upang tanggapin ang salah")},
        {"id": "u01-l2-o2", "text": T("يعرف ما يجب له الوضوء", "Knows the acts for which wudu’ is obligatory", "Alam kung kailan obligado ang wudhu")},
        {"id": "u01-l2-o3", "text": T("يعرف الماء الطهور وأوصافه الثلاثة", "Knows what purifying water is and its three characteristics",
                                      "Alam kung ano ang malinis na tubig at ang tatlo nitong katangian")},
    ],
    "cards": [
        quran("u01-l2-c1", "2:222", line("ar", "قال تعالى: (إِنَّ اللَّهَ يُحِبُّ التَّوَّابِينَ"),
              line("en", "Allah Almighty says: {Indeed, Allah loves those who are constantly repentant"),
              line("tl", "Sinabi ng Allah: “Ang Allâh, samakatuwid"), ["u01-l2-o1"], "I learn wudu’: opening"),
        {"id": "u01-l2-c2", "kind": "hadith", "text": T(line("ar", "قال ﷺ : (تَوَضَّأ"), line("en", "The Prophet (pbuh) said: “Perform ablution"),
                                                          line("tl", "Sinabi ng Propeta ﷺ: “Mag-wudhu ka")),
         "provenance": src("I learn wudu’: opening"), "objectives": ["u01-l2-o1"],
         "verify": "Link to HadeethEnc (source and grade) and check the wording before release."},
        card("u01-l2-c2b", T(line("ar", "من عظيم شأن الصلاة"),
                             line("en", "Because of the immense status of Salah") + "\n" + line("en", "He (Allah’s prayers and peace be upon him) also said") + "\n" + line("en", "So, a Muslim stands before his Lord"),
                             line("tl", "Kabilang sa pagiging dakila") + "\n" + line("tl", "Sinabi pa ng Propeta ﷺ: “Sinuman") + "\n" + line("tl", "Haharap ang isang alipin")),
             "I learn wudu’: opening paragraph", ["u01-l2-o1"], contains_hadith=True,
             verify="The paragraph quotes two hadiths: link them to HadeethEnc (source and grade) and check the wording before release."),
        card("u01-l2-c3", T("ما يجب له الوضوء:\n" + "\n".join(ar_need),
                            "What are the acts of worship for which ablution is obligatory?\n" + "\n".join(en_need),
                            "Kailan magiging wajib o obligado sa kanya ang wudhu?\n" + "\n".join(tl_need)),
             "What requires wudu’", ["u01-l2-o2"]),
        card("u01-l2-c4", T(line("ar", "أتوضأ وأغتسل بالماء الطهور") + "\n" + line("ar", "الماء الطهور هو"),
                            line("en", "I perform ablution (Wudu’) and ritual bath") + "\n" + line("en", "Purifying water is any water"),
                            line("tl", "Ako ay magwuwudo at maliligo") + "\n" + line("tl", "Ang malinis na tubig:")),
             "Purifying water", ["u01-l2-o3"]),
    ],
}
L2["cards"][0]["note"] = "The Filipino page cites this verse as (Qur’an 2:22); the correct reference is 2:222. Fix during verification."
L2["exercises"] = [
    ex("u01-l2-e1", "choice", ["u01-l2-o1"],
       T("الطهارة بالنسبة للصلاة:", "For prayer, purification is:", "Para sa salah, ang paglilinis ay:"), "u01-l2-c2b",
       options=[opt("a", "شرط لصحتها", "A condition for its validity", "Kondisyon upang tanggapin ito"),
                opt("b", "تكون بعد الصلاة", "Done after the prayer", "Ginagawa pagkatapos ng salah"),
                opt("c", "لا علاقة لها بالصلاة", "Unrelated to the prayer", "Walang kaugnayan sa salah")], answer="a"),
    ex("u01-l2-e2", "choice", ["u01-l2-o1"],
       T("الطهارة للصلاة هي:", "For prayer, purification is:", "Para sa salah, ang paglilinis ay:"), "u01-l2-c2b",
       options=[opt("a", "مفتاح الصلاة", "The key to prayer", "Ang susi ng Salah"),
                opt("b", "آخر الصلاة", "The end of prayer", "Ang wakas ng salah"),
                opt("c", "بديل الصلاة", "A replacement for prayer", "Kapalit ng salah")], answer="a"),
    ex("u01-l2-e3", "choice", ["u01-l2-o2"],
       T("أيّ هذه يجب له الوضوء؟", "Which of these requires wudu’?", "Alin dito ang nangangailangan ng wudhu?"), "u01-l2-c3",
       options=[opt("a", "مسُّ المصحف", "Touching the Mus-haf", "Paghawak ng Mushaf (Qur’an)"),
                opt("b", "الأكل والشرب", "Eating and drinking", "Pagkain at pag-inom"),
                opt("c", "المشي إلى العمل", "Walking to work", "Paglakad papunta sa trabaho")], answer="a"),
    ex("u01-l2-e4", "choice", ["u01-l2-o2"],
       T("الصلاة التي يجب لها الوضوء:", "The prayer that requires wudu’ is:", "Ang salah na nangangailangan ng wudhu ay:"), "u01-l2-c3",
       options=[opt("a", "كل صلاة، فرضًا كانت أو نافلة", "Every prayer, obligatory or voluntary", "Bawat salah, obligado man o sunnah"),
                opt("b", "الفرض وحده", "Obligatory prayers only", "Ang obligadong salah lamang"),
                opt("c", "صلاة الفجر وحدها", "Only the Fajr prayer", "Ang Fajr lamang")], answer="a"),
    ex("u01-l2-e5", "choice", ["u01-l2-o3"],
       T("الماء الطهور هو:", "Purifying water is:", "Ang malinis na tubig ay:"), "u01-l2-c4",
       options=[opt("a", "ماء نزل من السماء أو نبع من الأرض وبقي على أصل خلقته", "Water from the sky or the earth that remains in its original state",
                    "Tubig mula sa langit o lupa na nanatili sa orihinal na pagkalikha nito"),
                opt("b", "كل ماء تغيّر لونه أو طعمه أو ريحه بما يسلب طهوريته", "Any water whose colour, taste or smell was changed by something that removes its purity",
                    "Tubig na nabago ang kulay, lasa o amoy dahil sa bagay na nakakaalis ng pagkalinis nito"),
                opt("c", "الماء المعبأ وحده", "Bottled water only", "Nakaboteng tubig lamang")], answer="a"),
    ex("u01-l2-e6", "choice", ["u01-l2-o3"],
       T("ما الأوصاف الثلاثة للماء؟", "What are the three characteristics of water?", "Ano ang tatlong katangian ng tubig?"), "u01-l2-c4",
       options=[opt("a", "اللون والطعم والريح", "Colour, taste and smell", "Kulay, lasa at amoy"),
                opt("b", "الحرارة والوزن والحجم", "Temperature, weight and volume", "Init, bigat at dami"),
                opt("c", "اللون والحجم والمصدر", "Colour, volume and source", "Kulay, dami at pinagmulan")], answer="a"),
]

# ---------------------------------------------------------------- lesson 3
L3 = {
    "id": "u01-l3", "order": 3,
    "title": T("أتوضأ (1)", "I Make Wudu’ (1)", "Ako ay Magwuwudhu (1)"),
    "support_video": "wudu",
    "objectives": [
        {"id": "u01-l3-o1", "text": T("يعرف أن محل النية القلب ومعناها", "Knows that intention is in the heart and what it means",
                                      "Alam na ang intensyon ay nasa puso at ang kahulugan nito")},
        {"id": "u01-l3-o2", "text": T("يرتّب خطوات الوضوء الأربع الأولى", "Orders the first four steps of wudu’", "Naisasaayos ang unang apat na hakbang ng wudhu")},
        {"id": "u01-l3-o3", "text": T("يميّز المضمضة من الاستنشاق والاستنثار", "Tells rinsing the mouth apart from sniffing and blowing out water",
                                      "Natutukoy ang pagkakaiba ng pagmumog sa istinshaq at istinthar")},
    ],
    "cards": [
        card("u01-l3-c1", T("النيَّة\n" + line("ar", "ومحلها القلب، ومعنى النية"),
                            line("en", "Making Niyyah (intention) in the heart.") + "\n" + line("en", "Niyyah refers to the resolve"),
                            line("tl", "Ang intensyon sa puso.")),
             "I learn wudu’: step 1", ["u01-l3-o1", "u01-l3-o2"]),
        card("u01-l3-c2", T("غسل الكفين", line("en", "Washing the two hands up to the wrists."), line("tl", "Ang paghugas ng kamay ng tatlong beses.")),
             "I learn wudu’: step 2", ["u01-l3-o2"], image="wudu-2-hands"),
        card("u01-l3-c3", T("المضمضة\n" + line("ar", "المضمضة هي"),
                            line("en", "Rinsing the mouth (Madmadah)") + "\n" + line("en", "Rinsing the mouth : means"),
                            line("tl", "Ang pagmumog ng tatlong beses") + "\n" + line("tl", "Ang madmada (Pagmumog)")),
             "I learn wudu’: step 3", ["u01-l3-o2", "u01-l3-o3"], image="wudu-3-mouth"),
        card("u01-l3-c4", T("الاستنشاق والاستنثار\n" + line("ar", "الاستنشاق: وهو") + "\n" + line("ar", "ثم الاستنثار"),
                            line("en", "Sniffing water into the nostrils (Istinshāq)") + "\n" + line("en", "Istinshāq :") + "\n" + line("en", "Istinthār :"),
                            line("tl", "Al-istinsha’q:") + "\n" + line("tl", "Al-istinthar:")),
             "I learn wudu’: step 4", ["u01-l3-o2", "u01-l3-o3"], image="wudu-4-nose"),
    ],
}
STEP = {"intent": T("النية", "Intention", "Intensyon"), "hands": T("غسل الكفين", "Washing the hands", "Paghugas ng kamay"),
        "mouth": T("المضمضة", "Rinsing the mouth", "Pagmumog"), "nose": T("الاستنشاق والاستنثار", "Sniffing water into the nose", "Istinshaq at istinthar"),
        "face": T("غسل الوجه", "Washing the face", "Paghugas ng mukha"), "arms": T("غسل اليدين إلى المرفقين", "Washing the hands to the elbows", "Paghugas ng kamay hanggang siko"),
        "head": T("مسح الرأس مع الأذنين", "Wiping the head and ears", "Pagpunas ng ulo at tainga"), "feet": T("غسل الرجلين", "Washing the feet", "Paghugas ng paa")}
def items(keys):
    return [{"id": k, "text": STEP[k]} for k in keys]
L3["exercises"] = [
    ex("u01-l3-e1", "choice", ["u01-l3-o1"], T("أين محل النية؟", "Where is the intention made?", "Saan ginagawa ang intensyon?"), "u01-l3-c1",
       options=[opt("a", "القلب", "In the heart", "Sa puso"), opt("b", "اللسان", "On the tongue", "Sa dila"), opt("c", "الورق", "On paper", "Sa papel")], answer="a"),
    ex("u01-l3-e2", "choice", ["u01-l3-o1"], T("ما معنى النية؟", "What does intention mean?", "Ano ang kahulugan ng intensyon?"), "u01-l3-c1",
       options=[opt("a", "عزم القلب على فعل العبادة تقربًا إلى الله", "The resolve in the heart to perform the worship to get close to Allah",
                    "Ang hangarin ng puso na gawin ang isang pagsamba upang mapalapit sa Allah"),
                opt("b", "غسل الوجه ثلاث مرات", "Washing the face three times", "Paghugas ng mukha nang tatlong beses"),
                opt("c", "قول الوضوء بصوت عالٍ", "Saying the wudu’ aloud", "Pagsasabi ng wudhu nang malakas")], answer="a"),
    ex("u01-l3-e3", "order", ["u01-l3-o2"], T("رتّب أول خطوات الوضوء", "Put the first steps of wudu’ in order", "Isaayos ang mga unang hakbang ng wudhu"), "u01-l3-c2",
       items=items(["intent", "hands", "mouth", "nose"]), answer=["intent", "hands", "mouth", "nose"]),
    ex("u01-l3-e4", "choice", ["u01-l3-o2"], T("ما الخطوة بعد غسل الكفين؟", "What comes after washing the hands?", "Ano ang kasunod ng paghugas ng kamay?"), "u01-l3-c3",
       options=[opt("a", *STEP["mouth"].values()), opt("b", *STEP["feet"].values()), opt("c", *STEP["intent"].values())], answer="a"),
    ex("u01-l3-e5", "match", ["u01-l3-o3"], T("صِل كل كلمة بمعناها", "Match each word with its meaning", "Itugma ang bawat salita sa kahulugan nito"), "u01-l3-c4",
       pairs=[{"left": T("المضمضة", "Madmadah", "Madmada"), "right": T("إدخال الماء في الفم وإدارته فيه ثم إخراجه", "Letting water into the mouth, swirling it, then spitting it out",
                                                                      "Pagpasok ng tubig sa bibig at pagkatapos ay ilalabas ito")},
              {"left": T("الاستنشاق", "Istinshāq", "Istinshaq"), "right": T("اجتذاب الماء بالنفس إلى أقصى الأنف", "Sniffing water deep into the nose", "Pagsinghot ng tubig papasok sa ilong")},
              {"left": T("الاستنثار", "Istinthār", "Istinthar"), "right": T("إخراج ما في الأنف بالنفس", "Blowing out what is in the nose", "Pagsinga ng tubig mula sa ilong")}]),
    ex("u01-l3-e6", "choice", ["u01-l3-o3"],
       T("أدخلتَ الماء إلى أنفك بنفَسك ثم أخرجته. ماذا فعلت؟", "You sniffed water into your nose, then blew it out. What did you do?",
         "Sininghot mo ang tubig papasok sa iyong ilong, saka mo ito isininga. Ano ang ginawa mo?"), "u01-l3-c4",
       options=[opt("a", "الاستنشاق ثم الاستنثار", "Istinshāq, then istinthār", "Istinshaq, saka istinthar"),
                opt("b", "المضمضة", "Madmadah (rinsing the mouth)", "Madmada (pagmumog)"),
                opt("c", "غسل الوجه", "Washing the face", "Paghugas ng mukha")], answer="a"),
]

# ---------------------------------------------------------------- lesson 4
ar_face = after("ar", "حد الوجه:", 7)
L4 = {
    "id": "u01-l4", "order": 4,
    "title": T("أتوضأ (2)", "I Make Wudu’ (2)", "Ako ay Magwuwudhu (2)"),
    "support_video": "wudu",
    "objectives": [
        {"id": "u01-l4-o1", "text": T("يرتّب خطوات الوضوء الثماني", "Orders all eight steps of wudu’", "Naisasaayos ang walong hakbang ng wudhu")},
        {"id": "u01-l4-o2", "text": T("يعرف حدود ما يُغسل: الوجه، والمرفقان، والكعبان", "Knows the limits of washing: the face, the elbows and the ankles",
                                      "Alam ang hangganan ng hinuhugasan: ang mukha, ang siko at ang bukong-bukong")},
        {"id": "u01-l4-o3", "text": T("يعرف ما يبطل الوضوء", "Knows what nullifies wudu’", "Alam kung ano ang nakakasira sa wudhu")},
        {"id": "u01-l4-o4", "text": T("يعرف كيف يزيل النجاسة بعد قضاء الحاجة", "Knows how to clean impurity after relieving oneself",
                                      "Alam kung paano aalisin ang karumihan pagkatapos dumumi")},
    ],
    "cards": [
        card("u01-l4-c1", T("غسل الوجه\nحد الوجه:\n" + "\n".join(ar_face),
                            "\n".join([line("en", "Washing the face"), line("en", "Face boundaries:"), line("en", "The face: the part of the body"),
                                       line("en", "Facial boundary widthwise"), line("en", "Facial boundary lengthwise"),
                                       line("en", "Washing the face includes everything on it"), line("en", "Washing the face also includes all the visible heavy hair")]),
                            "\n".join([line("tl", "Ang paghugas ng mukha."), line("tl", "Ang mga hangganan ng mukha"), line("tl", "Kahulugan ng Mukha"),
                                       line("tl", "Ang taas:"), line("tl", "Ang lapad:"), line("tl", "Nasasaklaw ang paghugas ng mukha"),
                                       line("tl", "Bayad:"), line("tl", "Idha’r:"), line("tl", "Nasasakop din ang paghuhugas ng mukha")])),
             "I learn wudu’: step 5", ["u01-l4-o1", "u01-l4-o2"], image="wudu-5-face",
             note="The English page repeats the face definitions in two wordings; the first complete wording is used."),
        card("u01-l4-c2", T("غسل اليدين\n" + line("ar", "ابتداءً من رؤوس أصابع اليدين") + "\n" + line("ar", "ويدخل المرفقان"),
                            line("en", "Washing the hands") + "\n" + line("en", "starting from the fingertips") + "\n" + line("en", "Washing the elbows is included"),
                            line("tl", "Ang paghugas ng dalawang kamay kasama ang siko") + "\n" + line("tl", "simula sa mga daliri hanggang sa siko")),
             "I learn wudu’: step 6", ["u01-l4-o1", "u01-l4-o2"], image="wudu-6-arms"),
        card("u01-l4-c3", T(line("ar", "مسح كل الرأس باليدين") + "\n" + line("ar", "يبدأ بمقدم رأسه") + "\n" + line("ar", "ويُدخل سبابتيه"),
                            "\n".join([line("en", "Passing the wet hands over the head"), line("en", "One starts at the hairline"),
                                       line("en", "He then inserts his index fingers"), line("en", "while passing his thumbs")]),
                            line("tl", "Ang pagpunas ng ulo pati ang dalawang tainga") + " " + line("tl", "beses lamang, magsisimula")),
             "I learn wudu’: step 7", ["u01-l4-o1"], image="wudu-7-head", extra_images=["images/wudu-7-ears.webp"]),
        card("u01-l4-c4", T("غسل الرجلين\n" + line("ar", "من بداية أصابع القدمين") + "\n" + line("ar", "الكعبان هما"),
                            line("en", "Washing the feet") + "\n" + line("en", "from the toes up to the ankles") + "\n" + line("en", "The ankles are the protruding bones"),
                            line("tl", "Ang paghugas ng dalawang paa")),
             "I learn wudu’: step 8", ["u01-l4-o1", "u01-l4-o2"], image="wudu-8-feet"),
        card("u01-l4-c5", T("يبطل الوضوء بهذه الأمور:\n" + "\n".join(after("ar", "يبطل الوضوء بهذه الأمور", 3)),
                            "Nullifiers of Ablution:\n" + "\n".join(after("en", "Nullifiers of Ablution", 3)),
                            "Mawawalan ng bisa ang wudo kapag nagawa ang mga bagay na ito:\n" + "\n".join(after("tl", "Mawawalan ng bisa ang wudo", 3))),
             "Nullifiers of wudu’", ["u01-l4-o3"]),
        card("u01-l4-c6", T(line("ar", "إذا قضى الإنسان حاجته"), line("en", "If someone wants to relieve himself"), line("tl", "Kapag dumumi ang tao")),
             "After relieving oneself", ["u01-l4-o4"]),
    ],
}
ALL8 = ["intent", "hands", "mouth", "nose", "face", "arms", "head", "feet"]
L4["exercises"] = [
    ex("u01-l4-e1", "order", ["u01-l4-o1"], T("رتّب خطوات الوضوء كلها", "Put all the steps of wudu’ in order", "Isaayos ang lahat ng hakbang ng wudhu"), "u01-l4-c1",
       items=items(ALL8), answer=ALL8),
    ex("u01-l4-e2", "choice", ["u01-l4-o1"], T("ما الخطوة بعد غسل الوجه؟", "What comes after washing the face?", "Ano ang kasunod ng paghugas ng mukha?"), "u01-l4-c2",
       options=[opt("a", *STEP["arms"].values()), opt("b", *STEP["feet"].values()), opt("c", *STEP["mouth"].values())], answer="a"),
    ex("u01-l4-e3", "choice", ["u01-l4-o2"], T("هل يدخل المرفقان في غسل اليدين؟", "Are the elbows included when washing the hands?",
                                                "Kasama ba ang siko sa paghugas ng kamay?"), "u01-l4-c2",
       options=[opt("a", "نعم، يدخلان في الغسل", "Yes, they are included", "Oo, kasama ang siko"), opt("b", "لا، يُغسل إلى الرسغ فقط", "No, only up to the wrists", "Hindi, hanggang pulso lamang")],
       answer="a"),
    ex("u01-l4-e4", "choice", ["u01-l4-o2"], T("حد الوجه عرضًا:", "The face’s width is:", "Ang lapad ng mukha ay:"), "u01-l4-c1",
       options=[opt("a", "من الأذن إلى الأذن", "From one ear to the other ear", "Mula sa tainga hanggang sa kabilang tainga"),
                opt("b", "من العين إلى العين", "From one eye to the other eye", "Mula sa mata hanggang sa kabilang mata"),
                opt("c", "الأنف وحده", "The nose only", "Ang ilong lamang")], answer="a"),
    ex("u01-l4-e5", "choice", ["u01-l4-o2"], T("إلى أين تُغسل الرجلان؟", "Up to where are the feet washed?", "Hanggang saan hinuhugasan ang paa?"), "u01-l4-c4",
       options=[opt("a", "إلى الكعبين، ويدخلان في الغسل", "Up to the ankles, which are included", "Hanggang sa bukong-bukong"),
                opt("b", "إلى الركبتين", "Up to the knees", "Hanggang sa tuhod"),
                opt("c", "الأصابع وحدها", "The toes only", "Ang mga daliri lamang")], answer="a"),
    ex("u01-l4-e6", "choice", ["u01-l4-o3"], T("أيّ هذه يبطل الوضوء؟", "Which of these nullifies wudu’?", "Alin dito ang nakakasira sa wudhu?"), "u01-l4-c5",
       options=[opt("a", "النوم المستغرق", "Deep sleep", "Mahimbing na pagtulog"), opt("b", "شرب الماء", "Drinking water", "Pag-inom ng tubig"),
                opt("c", "المشي", "Walking", "Paglakad")], answer="a"),
    ex("u01-l4-e7", "choice", ["u01-l4-o3"], T("كل ما يوجب الغسل يبطل الوضوء.", "Everything that requires ghusl nullifies wudu’.",
                                                "Ang lahat ng dahilan ng pagka-obligado ng ghusl ay nakakasira sa wudhu."), "u01-l4-c5",
       options=[opt("a", "صحيح", "True", "Tama"), opt("b", "خطأ", "False", "Mali")], answer="a"),
    ex("u01-l4-e8", "choice", ["u01-l4-o4"], T("بماذا تُزال النجاسة بعد قضاء الحاجة؟ (الأفضل)", "What is best for cleaning after relieving oneself?",
                                                "Ano ang pinakamainam na panlinis pagkatapos dumumi?"), "u01-l4-c6",
       options=[opt("a", "الماء الطهور", "Clean water", "Tubig na naipandadalisay"), opt("b", "لا يلزم التنظيف", "No cleaning is needed", "Hindi kailangang maglinis"),
                opt("c", "مسحة واحدة بأي شيء", "One wipe with anything", "Isang pahid ng kahit ano")], answer="a"),
    ex("u01-l4-e9", "choice", ["u01-l4-o4"], T("إن لم يُستعمل الماء، فكم مسحة على الأقل؟", "If water is not used, how many wipes at least?",
                                                "Kung hindi tubig ang gagamitin, ilang pahid man lang?"), "u01-l4-c6",
       options=[opt("a", "ثلاث مسحات منقية فأكثر بشيء طاهر مباح", "Three cleansing wipes or more, with something clean and permissible",
                    "Tatlong ulit o higit pa na pagpapahid ng malinis na ipinahihintulot na bagay"),
                opt("b", "مسحة واحدة", "One wipe", "Isang pahid"), opt("c", "لا حد لها ولو مسحة ناقصة", "Any amount, even an incomplete wipe", "Kahit gaano, kahit hindi malinis")], answer="a"),
]

# ---------------------------------------------------------------- lesson 5
L5 = {
    "id": "u01-l5", "order": 5,
    "title": T("أتهيأ للصلاة", "I Prepare for Prayer", "Inihahanda Ko ang Sarili sa Salah"),
    "objectives": [
        {"id": "u01-l5-o1", "text": T("يعرف الصلوات الخمس بترتيبها", "Knows the five daily prayers in order", "Alam ang limang pagdarasal ayon sa pagkakasunod")},
        {"id": "u01-l5-o2", "text": T("يعرف أن الحدث الأصغر يوجب الوضوء والأكبر يوجب الغسل", "Knows minor impurity requires wudu’ and major impurity requires ghusl",
                                      "Alam na ang maliit na karumihan ay nangangailangan ng wudhu at ang malaki ay ng ghusl")},
        {"id": "u01-l5-o3", "text": T("يعرف شروط الطهارة والستر في الصلاة", "Knows the requirements of cleanliness and covering in prayer",
                                      "Alam ang mga kondisyon ng kalinisan at pagtatakip sa salah")},
        {"id": "u01-l5-o4", "text": T("يعرف ما يفعله من لم يحفظ أقوال الصلاة بعد", "Knows what to do before memorizing the words of prayer",
                                      "Alam ang gagawin kung hindi pa kabisado ang mga salita ng salah")},
    ],
    "cards": [
        card("u01-l5-c1", T(line("ar", "افترض الله على المسلم"), line("en", "Allah ordained upon the Muslim five prayers"), line("tl", "Inobliga ng Allah ang limang")),
             "I learn to pray: opening", ["u01-l5-o1"]),
        card("u01-l5-c2", T("\n".join([line("ar", "إذا دخل وقت الصلاة"), line("ar", "الحدث الأكبر هو"), line("ar", "الحدث الأصغر هو")]),
                            "\n".join([line("en", "When the time of prayer starts"), line("en", "Major impurity is"), line("en", "Minor impurity is")]),
                            "\n".join([line("tl", "Kapag pumasok ang oras ng salah"), line("tl", "Hadath Akbar"), line("tl", "Hadath Asghar")])),
             "I prepare for prayer", ["u01-l5-o2"]),
        card("u01-l5-c3", T("\n".join([line("ar", "يصلي المسلم بملابسَ"), line("ar", "يتزين المسلم بملابس"), line("ar", "يجب على المرأة أن تستر")]),
                            "\n".join([line("en", "The Muslim prays in a clean place"), line("en", "A Muslim wears proper clothing"), line("en", "The woman must cover")]),
                            "\n".join([line("tl", "Ang isang Muslim ay nagdarasal sa dalisay"), line("tl", "Dapat takpan ng isang babae")])),
             "I prepare for prayer", ["u01-l5-o3"]),
        card("u01-l5-c4", T(line("ar", "لا يتحدث المسلم في الصلاة"),
                            line("en", "While performing Salah, the Muslim only says").replace(" (by saying 'Subhān Allah')", ""),
                            line("tl", "Hindi marapat sa isang muslim na magsalita")),
             "I prepare for prayer", ["u01-l5-o4"], kind="reassurance",
             edited={"en": "Removed the transliterated parenthesis “(by saying 'Subhān Allah')” (LRN-01 rule 3)."}),
    ],
}
PR = {"fajr": T("الفجر", "Fajr", "Fajr"), "dhuhr": T("الظهر", "Dhuhr", "Dhuhur"), "asr": T("العصر", "‘Asr", "Asar"),
      "maghrib": T("المغرب", "Maghrib", "Maghrib"), "isha": T("العشاء", "‘Isha’", "Isha")}
L5["exercises"] = [
    ex("u01-l5-e1", "order", ["u01-l5-o1"], T("رتّب الصلوات الخمس في اليوم", "Put the five daily prayers in order", "Isaayos ang limang pagdarasal sa isang araw"), "u01-l5-c1",
       items=[{"id": k, "text": v} for k, v in PR.items()], answer=list(PR)),
    ex("u01-l5-e2", "choice", ["u01-l5-o1"], T("كم صلاة افترضها الله في اليوم والليلة؟", "How many prayers did Allah ordain in a day and night?",
                                                "Ilang pagdarasal ang inobliga ng Allah sa bawat araw?"), "u01-l5-c1",
       options=[opt("a", "خمس", "Five", "Lima"), opt("b", "ثلاث", "Three", "Tatlo"), opt("c", "سبع", "Seven", "Pito")], answer="a"),
    ex("u01-l5-e3", "match", ["u01-l5-o2"], T("صِل كل حدث بما يوجبه", "Match each impurity with what it requires", "Itugma ang bawat karumihan sa kinakailangan nito"), "u01-l5-c2",
       pairs=[{"left": T("الحدث الأصغر", "Minor impurity", "Hadath Asghar"), "right": T("الوضوء", "Wudu’", "Wudhu")},
              {"left": T("الحدث الأكبر", "Major impurity", "Hadath Akbar"), "right": T("الغسل", "Ghusl", "Ghusl")}]),
    ex("u01-l5-e4", "choice", ["u01-l5-o3"], T("ما الذي لا يجوز للرجل أن يبديه في الصلاة؟", "What may a man not uncover in prayer?",
                                                "Ano ang hindi maaaring ipakita ng lalaki sa salah?"), "u01-l5-c3",
       options=[opt("a", "ما بين السرة والركبة", "The area between his navel and knees", "Ang pagitan ng pusod at tuhod"),
                opt("b", "رأسه", "His head", "Ang kanyang ulo"), opt("c", "يديه", "His hands", "Ang kanyang mga kamay")], answer="a"),
    ex("u01-l5-e9", "choice", ["u01-l5-o2"], T("متى يتطهّر المسلم للصلاة؟", "When does the Muslim purify himself for prayer?",
                                                "Kailan naglilinis ang Muslim para sa salah?"), "u01-l5-c2",
       options=[opt("a", "إذا دخل وقت الصلاة ولم يكن على طهارة", "When the time of prayer starts and he is not in a state of purity", "Kapag pumasok ang oras ng salah at hindi siya malinis"),
                opt("b", "بعد انتهاء الصلاة", "After the prayer ends", "Pagkatapos ng salah"),
                opt("c", "مرة في الأسبوع", "Once a week", "Isang beses sa isang linggo")], answer="a"),
    ex("u01-l5-e5", "choice", ["u01-l5-o3"], T("ما الذي تستره المرأة في الصلاة؟", "What does a woman cover in prayer?", "Ano ang tinatakpan ng babae sa salah?"), "u01-l5-c3",
       options=[opt("a", "جميع بدنها إلا الوجه والكفين", "Her whole body except the face and hands", "Ang buong katawan maliban sa mukha at mga kamay"),
                opt("b", "رأسها فقط", "Only her head", "Ang ulo lamang"), opt("c", "لا يلزمها ستر", "Nothing is required", "Walang kailangang takpan")], answer="a"),
    ex("u01-l5-e6", "choice", ["u01-l5-o3"], T("يصلي المسلم:", "A Muslim prays:", "Ang Muslim ay nagdarasal:"), "u01-l5-c3",
       options=[opt("a", "بملابس طاهرة في مكان طاهر ساترًا عورته", "In clean clothes, in a clean place, with his ‘awrah covered",
                    "Na may dalisay na damit, sa dalisay na lugar, na natatakpan ang awra"),
                opt("b", "في أي مكان ولو كان نجسًا", "Anywhere, even if impure", "Kahit saan, kahit marumi"),
                opt("c", "بأي لباس ولو لم يستر", "In any clothes, even if uncovered", "Kahit anong damit, kahit hindi natatakpan")], answer="a"),
    ex("u01-l5-e7", "choice", ["u01-l5-o4"], T("من لم يحفظ أقوال الصلاة بعد:", "Someone who has not yet memorized the words of prayer:",
                                                "Ang hindi pa kabisado ang mga salita ng salah ay:"), "u01-l5-c4",
       options=[opt("a", "يذكر الله ويسبّحه حتى ينتهي من الصلاة", "Mentions Allah and glorifies Him until the prayer ends",
                    "Magdhikr at luwalhatiin ang Allah hanggang sa matapos ang salah"),
                opt("b", "لا يصلي حتى يحفظها", "Does not pray until he memorizes them", "Hindi magsasalah hanggang makabisado"),
                opt("c", "يسكت حتى ينتهي الناس", "Stays silent until the others finish", "Tatahimik hanggang matapos ang iba")], answer="a"),
    ex("u01-l5-e8", "choice", ["u01-l5-o4"], T("وماذا يلزمه بعد ذلك؟", "And what must he do after that?", "At ano ang dapat niyang gawin pagkatapos?"), "u01-l5-c4",
       options=[opt("a", "أن يبادر إلى تعلّم الصلاة وأقوالها", "Hasten to learn the prayer and its words", "Magmadali na pag-aralan ang salah at mga salita nito"),
                opt("b", "أن يترك الصلاة", "Leave the prayer", "Iwan ang salah"), opt("c", "لا شيء", "Nothing", "Wala")], answer="a"),
]

# ---------------------------------------------------------------- lesson 6
A = AR_ADHKAR
L6 = {
    "id": "u01-l6", "order": 6,
    "title": T("أصلي (1)", "I Pray (1)", "Ako ay Magsasalah (1)"),
    "support_video": "salah",
    "objectives": [
        {"id": "u01-l6-o1", "text": T("يرتّب أول أفعال الصلاة حتى الركوع", "Orders the first actions of prayer up to bowing", "Naisasaayos ang mga unang gawain ng salah hanggang sa pagyuko")},
        {"id": "u01-l6-o2", "text": T("يعرف ما يقوله في الركوع وكيف يركع", "Knows what to say in bowing and how to bow", "Alam ang sasabihin sa pagyuko at kung paano yumuko")},
        {"id": "u01-l6-o3", "text": T("يعرف أن الفاتحة تُقرأ في كل ركعة", "Knows that al-Fātiḥah is read in every rak‘ah", "Alam na ang Al-Fatiha ay binabasa sa bawat raka’a")},
    ],
    "cards": [
        card("u01-l6-c1", T("النيَّة\n" + line("ar", "للفريضة التي أريد أداءها") + "\n" + line("ar", "بعد أن أتوضأ، أستقبل القبلة"),
                            line("en", "I make the intention in my heart for the prayer") + "\n" + line("en", "After I perform ablution, I stand"),
                            line("tl", "Pagkakaroon ng niyah") + "\n" + line("tl", "Pagkatapos kong mag-wudhu ako ay haharap")),
             "I learn to pray: step 1", ["u01-l6-o1"]),
        card("u01-l6-c2", T(line("ar", "أرفع يديَّ بمحاذاة المنكبين"),
                            f"I raise my hands to the level of my shoulders and say {A['takbir']} (Allah is the Most Great) with the intention of beginning the prayer.",
                            f"itataas ko ang aking kamay na nakahanay sa aking mga balikat at sasabihin ang katagang: {A['takbir']} (ang Allah ang Pinakadakila) na may kasamang hangarin na simulan ang salah."),
             "I learn to pray: step 2", ["u01-l6-o1"], image="salah-02-takbir", edited={"en": EDIT, "tl": EDIT}),
        card("u01-l6-c3", T(line("ar", "أقرأ دعاء الاستفتاح"),
                            f"I say an opening Du‘ā’ (supplication) as reported from the Prophet (Allah’s prayers and peace be upon him). One of the opening supplications is the following: {A['opening']} (Glory and praise be to You O Allah. Blessed is Your Name and Exalted is Your Majesty, and there is none worthy of worship but You)",
                            f"Aking sasabihin ang pambungad na Duaa (pagsusumamo) na naiulat sa Sunnah, at kabilang dito ang pagsabi: {A['opening']} “Ang kaluwalhatian ay sa Iyo O Allah, at papuri. Pinagpala ang Iyong Pangalan at Itinaas ang iyong Kamahalan. Walang karapat-dapat sambahin kundi Ikaw lamang.”"),
             "I learn to pray: step 3", ["u01-l6-o1"], image="salah-03-opening", edited={"en": EDIT, "tl": EDIT}),
        card("u01-l6-c4", T(line("ar", "أستعيذ بالله من الشيطان الرجيم"),
                            f"I seek refuge in Allah from the accursed Satan, saying: {A['istiadha']} (I seek refuge in Allah from the accursed Satan)",
                            f"Humihingi ako ng kanlungan kay Allah mula sa isinumpa na Shaytan (Satanas) sa pagsasabing: {A['istiadha']}."),
             "I learn to pray: step 4", ["u01-l6-o1"], image="salah-04-istiadha", edited={"en": EDIT, "tl": EDIT}),
        card("u01-l6-c5", T("أقرأ سورة الفاتحة في كل ركعة وهي:", "I read Surat al-Fātihah (Ch. 1 of the Qur’an) in every Rak‘ah (unit of the prayer):",
                            "Babasahin ko ang Surah Al Fatiha sa bawat raka’a:"),
             "I learn to pray: step 5", ["u01-l6-o1", "u01-l6-o3"], image="salah-05-fatiha", kind="fatiha",
             quran_ref="1:1-7", audio="fatiha",
             quran_text=T(line("ar", "﴿بسْمِ اللَّهِ الرَّحْمَنِ الرَّحِيمِ"),
                          "{In the name of Allah, the Most Compassionate, the Most Merciful (1) Praise is due to Allah, Lord of the worlds (2) The Most Compassionate, the Most Merciful (3) Sovereign of the Day of Recompense (4) It is You Who we worship, and it is You Who we ask for help (5) Guide us to the straight path (6) The path of those upon whom You have blessed, not of those who have evoked [Your] anger or of those who are astray (7)}",
                          "Sa Ngalan ng Allah, ang Mahabagin, ang Maawain. [Ang lahat ng papuri ay sa Allah], ang Panginoon ng lahat ng mga nilikha. Ang Mahabagin, ang Maawain. Ang Maalik [Makapangyarihan at Kataas-taasang Hari] sa Araw ng Pagbabayad [ng gantimpala at parusa]. [Tanging] Ikaw lamang po ang aming sinasamba, at [tanging] Ikaw lamang po ang aming hinihingan [ng tulong]. Patnubayan Mo po kami sa matuwid na landas. Sa landas ng yaong mga ginawaran Mo ng Iyong pagpapala, hindi [sa landas] ng mga umani ng [Iyong] poot, at ng mga nangaligaw."),
             edited={"en": "Stray punctuation “.blessed” corrected to “blessed”.",
                     "tl": "Removed the transliterated word “Al-Hamdulillah” and a stray bracket; the Tagalog meaning is kept (LRN-01 rule 3)."},
             verify="Check the Arabic against the King Fahd Complex text and the meanings against QuranEnc before release."),
        card("u01-l6-c6", T(line("ar", "أقرأ بعد الفاتحة ما تيسَّر"), line("en", "After al-Fātihah, I recite verses"), line("tl", "Magbabasa ako ng isang surah")),
             "I learn to pray: step 6", ["u01-l6-o3"], image="salah-06-recitation"),
        card("u01-l6-c7", T(line("ar", "أقول: (الله أكبر) ثم أركع"),
                            f"I say {A['takbir']} then I make Ruku‘ by bowing until my back is level, and my hands are on my knees with the fingers spread out, then I say while in Ruku‘ {A['ruku']} (Glory is to my Lord, the Great).",
                            f"Sasabihin ko: {A['takbir']} at ako ay yuyuko hanggang sa maging tuwid ang likod at nakalatag ang aking kamay sa aking tuhod na nakabukas ang mga daliri, at aking sasabihin: {A['ruku']} (Ang kaluwalhatian ay sa aking Panginoon, ang Pinakadakila)."),
             "I learn to pray: step 7", ["u01-l6-o1", "u01-l6-o2"], image="salah-07-ruku", edited={"en": EDIT, "tl": EDIT}),
    ],
}
SA = {"intent": T("النية واستقبال القبلة", "Intention and facing the Qiblah", "Niyah at pagharap sa Qibla"),
      "takbir": T("رفع اليدين والتكبير", "Raising the hands and saying الله أكبر", "Pagtaas ng kamay at pagsabi ng الله أكبر"),
      "opening": T("دعاء الاستفتاح", "The opening supplication", "Ang pambungad na Duaa"),
      "istiadha": T("الاستعاذة", "Seeking refuge from Satan", "Paghingi ng kanlungan mula kay Shaytan"),
      "fatiha": T("قراءة الفاتحة", "Reading al-Fātihah", "Pagbasa ng Al-Fatiha"),
      "ruku": T("الركوع", "Bowing (Ruku‘)", "Pagyuko (Ruku’)"),
      "rising": T("الرفع من الركوع", "Rising from bowing", "Pagtayo mula sa pagkayuko"),
      "sujud": T("السجود", "Prostration (Sujūd)", "Pagpapatirapa (Sujud)"),
      "sitting": T("الجلوس بين السجدتين", "Sitting between the two prostrations", "Pag-upo sa pagitan ng dalawang sujud"),
      "sujud2": T("السجدة الثانية", "The second prostration", "Ang ikalawang sujud"),
      "standing": T("القيام إلى الركعة التالية", "Standing for the next rak‘ah", "Pagtayo para sa susunod na raka’a")}
def sitems(keys):
    return [{"id": k, "text": SA[k]} for k in keys]
L6["exercises"] = [
    ex("u01-l6-e1", "order", ["u01-l6-o1"], T("رتّب أول أفعال الصلاة", "Put the first actions of prayer in order", "Isaayos ang mga unang gawain ng salah"), "u01-l6-c2",
       items=sitems(["intent", "takbir", "opening", "istiadha", "fatiha", "ruku"]), answer=["intent", "takbir", "opening", "istiadha", "fatiha", "ruku"]),
    ex("u01-l6-e2", "choice", ["u01-l6-o1"], T("بماذا أدخل في الصلاة؟", "How do I begin the prayer?", "Paano ko sisimulan ang salah?"), "u01-l6-c2",
       options=[opt("a", "أرفع يديّ وأقول: الله أكبر ناويًا الدخول في الصلاة", "I raise my hands and say الله أكبر, intending to begin the prayer",
                    "Itataas ko ang aking kamay at sasabihin ang الله أكبر na may hangaring simulan ang salah"),
                opt("b", "أسلّم عن يميني", "I turn to the right and give salām", "Babati ako sa kanan"),
                opt("c", "أسجد مباشرة", "I prostrate straight away", "Magpapatirapa agad")], answer="a"),
    ex("u01-l6-e3", "choice", ["u01-l6-o2"], T("ماذا أقول في الركوع؟", "What do I say while bowing?", "Ano ang sasabihin ko sa pagyuko?"), "u01-l6-c7",
       options=[opt("a", "سبحان ربي العظيم", "سبحان ربي العظيم (Meaning: Glory is to my Lord, the Great)", "سبحان ربي العظيم (Kahulugan: Ang kaluwalhatian ay sa aking Panginoon, ang Pinakadakila)"),
                opt("b", "سبحان ربي الأعلى", "سبحان ربي الأعلى (Meaning: Glory is to my Lord, the Most High)", "سبحان ربي الأعلى (Kahulugan: Luwalhati sa aking Panginoon, ang Kataas-taasan)"),
                opt("c", "ربي اغفر لي", "ربي اغفر لي (Meaning: My Lord, forgive my sins)", "ربي اغفر لي (Kahulugan: Panginoon, patawarin mo ako)")], answer="a"),
    ex("u01-l6-e4", "choice", ["u01-l6-o2"], T("كيف أركع؟", "How do I bow?", "Paano ako yuyuko?"), "u01-l6-c7",
       options=[opt("a", "حتى يستوي ظهري، ويداي على ركبتيّ مفرّجة الأصابع", "Until my back is level, my hands on my knees with fingers spread",
                    "Hanggang tuwid ang likod at nasa tuhod ang mga kamay na nakabukas ang mga daliri"),
                opt("b", "أضع جبهتي على الأرض", "I put my forehead on the ground", "Ilalagay ko ang noo sa lupa"),
                opt("c", "أجلس على قدمي اليسرى", "I sit on my left foot", "Uupo ako sa kaliwang paa")], answer="a"),
    ex("u01-l6-e5", "choice", ["u01-l6-o3"], T("متى أقرأ سورة الفاتحة؟", "When do I read al-Fātihah?", "Kailan ko babasahin ang Al-Fatiha?"), "u01-l6-c5",
       options=[opt("a", "في كل ركعة", "In every rak‘ah", "Sa bawat raka’a"), opt("b", "في الركعة الأولى فقط", "In the first rak‘ah only", "Sa unang raka’a lamang"),
                opt("c", "بعد السلام", "After ending the prayer", "Pagkatapos ng salah")], answer="a"),
    ex("u01-l6-e6", "choice", ["u01-l6-o3"], T("قراءة ما تيسّر بعد الفاتحة:", "Reciting more of the Qur’an after al-Fātihah is:", "Ang pagbasa pagkatapos ng Al-Fatiha ay:"), "u01-l6-c6",
       options=[opt("a", "في الركعتين الأوليين، وليست واجبة وفيها أجر عظيم", "In the first two rak‘ahs; not obligatory but with great reward",
                    "Sa una at ikalawang raka’a; hindi obligado ngunit may malaking gantimpala"),
                opt("b", "واجبة في كل ركعة", "Obligatory in every rak‘ah", "Obligado sa bawat raka’a"),
                opt("c", "في الركعة الأخيرة فقط", "In the last rak‘ah only", "Sa huling raka’a lamang")], answer="a"),
]

# ---------------------------------------------------------------- lesson 7
L7 = {
    "id": "u01-l7", "order": 7,
    "title": T("أصلي (2)", "I Pray (2)", "Ako ay Magsasalah (2)"),
    "support_video": "salah",
    "objectives": [
        {"id": "u01-l7-o1", "text": T("يرتّب أفعال الصلاة من الرفع من الركوع حتى القيام", "Orders the actions from rising after bowing to standing again",
                                      "Naisasaayos ang mga gawain mula sa pagtayo sa pagkayuko hanggang sa muling pagtayo")},
        {"id": "u01-l7-o2", "text": T("يعرف ذكر كل موضع: الرفع والسجود والجلوس", "Knows what is said when rising, prostrating and sitting",
                                      "Alam ang sasabihin sa pagtayo, pagpapatirapa at pag-upo")},
        {"id": "u01-l7-o3", "text": T("يعرف التشهد ومتى يُقال، وكيف تنتهي الصلاة", "Knows the tashahhud, when it is said, and how the prayer ends",
                                      "Alam ang tashahud, kung kailan ito sinasabi, at kung paano nagtatapos ang salah")},
    ],
    "cards": [
        card("u01-l7-c1", T(line("ar", "أرفع من الركوع قائلًا"),
                            f"I rise from Ruku‘ while saying: {A['rising']} (Allah hears the one who praises Him) and raising my hands to the level of my shoulders. When I stand straight, I say: {A['rabbana']} (Our Lord, and to You is all praise).",
                            f"Ako ay tatayo mula sa pagkayuko at sasabihin: {A['rising']} (dininig ng Allah ang sinumang pumuri sa kanya). Itataas ko ang aking mga kamay sa antas ng balikat, at kung ang aking katawan ay ganap nang nakatayo, sasabihin ko: {A['rabbana']} (Panginoon namin, tanging sa Iyo lamang ang papuri)."),
             "I learn to pray: step 8", ["u01-l7-o1", "u01-l7-o2"], image="salah-08-rising", edited={"en": EDIT, "tl": EDIT}),
        card("u01-l7-c2", T(line("ar", "أقولُ: (الله أكبر) وأسجد على اليدين"),
                            f"I say {A['takbir']} and prostrate on my hands, knees, feet, forehead, and nose, then I say while prostrating: {A['sujud']} (Glory is to my Lord, the Most High).",
                            f"Sasabihin ko ang {A['takbir']} at ako ay magpapatirapa gamit ang mga kamay, tuhod, paa, noo at ilong, at sasabihin ko sa aking pagpatirapa: {A['sujud']} (Luwalhati sa aking Panginoon, ang Kataas-taasan)."),
             "I learn to pray: step 9", ["u01-l7-o1", "u01-l7-o2"], image="salah-09-sujud", edited={"en": EDIT, "tl": EDIT}),
        card("u01-l7-c3", T(line("ar", "أقولُ: (الله أكبر) وأرفع من السجود"),
                            f"I say {A['takbir']} and rise from the Sujūd (prostration) to sit with my back straight, sitting on my left foot and keeping my right foot erect, and say: {A['jalsa']} (My Lord, forgive my sins).",
                            f"Sasabihin ko: {A['takbir']} at ako ay babangon mula sa pagkatirapa hanggang sa maging ganap na matuwid ang aking likod sa pagkakaupo sa kaliwang paa at nakataas ang kanang paa, at bibigkasin ang katagang: {A['jalsa']} (Panginoon, patawarin mo ako)."),
             "I learn to pray: step 10", ["u01-l7-o1", "u01-l7-o2"], image="salah-10-sitting", edited={"en": EDIT, "tl": EDIT}),
        card("u01-l7-c4", T(line("ar", "أقولُ: (الله أكبر) وأسجد مرة أخرى"),
                            f"I say {A['takbir']} and prostrate again like the first time.",
                            f"Sasabihin ko: {A['takbir']} at muli akong mag-sujud o magpatirapa tulad ng unang sujud."),
             "I learn to pray: step 11", ["u01-l7-o1"], image="salah-11-sujud2", edited={"en": EDIT, "tl": EDIT}),
        card("u01-l7-c5", T(line("ar", "أرفع من السجود قائلًا"),
                            f"I rise from the Sujūd to stand up straight while saying {A['takbir']}, and I repeat the same steps in the remaining units of the prayer.",
                            f"Ako ay tatayo mula sa sujud at sasabihin: {A['takbir']} upang makatayo ako nang tuwid, at gawin ang natitirang mga rakaat ng panalangin tulad ng ginawa ko sa unang rak’ah."),
             "I learn to pray: step 12", ["u01-l7-o1"], image="salah-12-standing", edited={"en": EDIT, "tl": EDIT},
             note="The Filipino page repeats this step as “Panglabing-isang hakbang”; the repeat is omitted."),
        card("u01-l7-c6", T(line("ar", "بعد الركعة الثانية من صلاة الظهر"),
                            "After the second prostration in the second Rak‘ah of Dhuhr, ‘Asr, Maghrib, and 'Isha’ prayers, I sit to say the first Tashahhud (testimony of faith) whose wording is as follows: (التحيات لله والصلوات والطيبات، السلام عليك أيها النبي ورحمة الله وبركاته، السلام علينا وعلى عباد الله الصالحين، أشهد أن لا إله إلا الله، وأشهد أن محمدًا عبده ورسوله) (All compliments, prayers, and pure words are due to Allah. Peace be upon you, O Prophet, and the mercy of Allah and His blessings. Peace be upon us and upon the righteous slaves of Allah. I bear witness that none has the right to be worshiped except Allah, and I bear witness that Muhammad is His slave and Messenger). Then I stand up for the third Rak‘ah.",
                            "Matapos ang pangalawang rakaa ng Dhuhr, Asr, Maghrib at Isha, ako ay uupo upang sabihin ang unang Tashahud: (التحيات لله والصلوات والطيبات، السلام عليك أيها النبي ورحمة الله وبركاته، السلام علينا وعلى عباد الله الصالحين، أشهد أن لا إله إلا الله، وأشهد أن محمدًا عبده ورسوله).\n“Ang lahat ng kapangyarihan at kadakilaan ay para sa Allah, lahat ng mga panalangin, at lahat ng mabuting pagsasalita at pagkilos ay para sa Kanya. Ang kapayapaan ay sumaiyo O Propeta, at gayundin ang awa ng Allah at ang Kanyang mga pagpapala. Ang kapayapaan ay mapapa-saatin, at sa mga mabubuting lingkod ng Allah. Pinapatotohanan ko na walang sinumang may karapatang sambahin maliban sa Allah, at pinatototohanan ko na si Muhammad ay Kanyang lingkod at sugo.” Pagkatapos ay lilipat ako sa pangatlong rakaa."),
             "I learn to pray: first tashahhud", ["u01-l7-o3"], image="salah-13-tashahhud", edited={"en": EDIT, "tl": EDIT + " The Filipino paragraph is split where the page joins the first and last tashahhud."}),
        card("u01-l7-c7", T(line("ar", "بعد الركعة الأخيرة من كل صلاة"),
                            "After the second prostration in the last Rak‘ah of every prayer, I sit to say the last Tashahhud whose wording is as follows (the first Tashahhud plus sending peace and prayers upon the Prophet): (التحيات لله والصلوات والطيبات، السلام عليك أيها النبي ورحمة الله وبركاته، السلام علينا وعلى عباد الله الصالحين، أشهد أن لا إله إلا الله، وأشهد أن محمدًا عبده ورسوله، اللهم صلِّ على محمد وعلى آل محمد، كما صليت على إبراهيم وعلى آل إبراهيم، إنك حميد مجيد. اللهم بارك على محمد وعلى آل محمد، كما باركت على إبراهيم وعلى آل إبراهيم، إنك حميد مجيد) (All compliments, prayers and pure words are due to Allah. Peace be upon you, O Prophet, and the mercy of Allah and His blessings. Peace be upon us and upon the righteous slaves of Allah. I bear witness that none has the right to be worshiped except Allah, and I bear witness that Muhammad is His slave and Messenger. O Allah, send prayers upon Muhammad and upon the family of Muhammad as You sent prayers upon Abraham and upon the family of Abraham; You are indeed Worthy of Praise, Full of Glory. O Allah, send blessings upon Muhammad and upon the family of Muhammad as You sent blessings upon Abraham and upon the family of Abraham; You are indeed Worthy of Praise, Full of Glory).",
                            "Sa huling rakaa ng bawat pagdarasal ako ay uupo upang sabihin ang unang Tashahud bilang karagdagan sa sumusunod na pagbigkas: (اللهم صلِّ على محمد وعلى آل محمد، كما صليت على إبراهيم وعلى آل إبراهيم، إنك حميد مجيد. اللهم بارك على محمد وعلى آل محمد، كما باركت على إبراهيم وعلى آل إبراهيم، إنك حميد مجيد).\n“O Allah! Puriin nawa si Muhammad, at ang pamilya ni Muhammad, tulad ng pagpuri Mo kay Ibraaheem, at ang pamilya ni Ibraaheem; Ikaw lamang ang karapat-dapat na puriin, at luwalhatiin. At Ikaw ang nagkaloob ng mga pagpapala kay Muhammad, at sa pamilya ni Muhammad, tulad ng pagpapadala mo ng mga pagpapala kay Ibraaheem, at sa pamilya ni Ibraaheem; Ikaw lamang ang karapat-dapat puruiin luwalhatiin.’’"),
             "I learn to pray: last tashahhud", ["u01-l7-o3"], edited={"en": EDIT, "tl": EDIT}),
        card("u01-l7-c8", T(line("ar", "بعد ذلك أسلم عن يميني"),
                            f"I intend to conclude the prayer and turn my head to the right, saying: {A['taslim']} (Peace and blessings of Allah be upon you). Then I turn my head to the left, saying: {A['taslim']}. Upon doing that, I have completed the performance of my prayer.",
                            f"Nais kong tapusin ang salah sa pamamagitan ng pagsasabi ng: {A['taslim']}, ang kapayapaan at mga pagpapala ng Allah ay sumaiyo, isang beses habang nakaharap sa kanang direksyon at isang beses habang nakaharap sa kaliwang direksyon; sa ganoong paraan magtatapos ang salah."),
             "I learn to pray: step 13", ["u01-l7-o3"], image="salah-14-taslim", edited={"en": EDIT, "tl": EDIT}),
    ],
}
DH = {"rising": T("سمع الله لمن حمده", "سمع الله لمن حمده (Meaning: Allah hears the one who praises Him)", "سمع الله لمن حمده (Kahulugan: dininig ng Allah ang sinumang pumuri sa kanya)"),
      "sujud": T("سبحان ربي الأعلى", "سبحان ربي الأعلى (Meaning: Glory is to my Lord, the Most High)", "سبحان ربي الأعلى (Kahulugan: Luwalhati sa aking Panginoon, ang Kataas-taasan)"),
      "jalsa": T("ربي اغفر لي", "ربي اغفر لي (Meaning: My Lord, forgive my sins)", "ربي اغفر لي (Kahulugan: Panginoon, patawarin mo ako)")}
L7["exercises"] = [
    ex("u01-l7-e1", "order", ["u01-l7-o1"], T("رتّب أفعال الصلاة بعد الركوع", "Put the actions after bowing in order", "Isaayos ang mga gawain pagkatapos ng pagyuko"), "u01-l7-c1",
       items=sitems(["rising", "sujud", "sitting", "sujud2", "standing"]), answer=["rising", "sujud", "sitting", "sujud2", "standing"]),
    ex("u01-l7-e2", "choice", ["u01-l7-o1"], T("على ماذا أسجد؟", "On what do I prostrate?", "Saan ako magpapatirapa?"), "u01-l7-c2",
       options=[opt("a", "اليدين والركبتين والقدمين والجبهة والأنف", "Hands, knees, feet, forehead and nose", "Mga kamay, tuhod, paa, noo at ilong"),
                opt("b", "الجبهة وحدها", "The forehead only", "Ang noo lamang"), opt("c", "اليدين وحدهما", "The hands only", "Ang mga kamay lamang")], answer="a"),
    ex("u01-l7-e3", "match", ["u01-l7-o2"], T("صِل كل موضع بذكره", "Match each position with what is said in it", "Itugma ang bawat posisyon sa sinasabi rito"), "u01-l7-c2",
       pairs=[{"left": SA["rising"], "right": DH["rising"]}, {"left": SA["sujud"], "right": DH["sujud"]}, {"left": SA["sitting"], "right": DH["jalsa"]}]),
    ex("u01-l7-e4", "choice", ["u01-l7-o2"], T("ماذا أقول إذا اعتدلت قائمًا بعد الركوع؟", "What do I say when I stand straight after bowing?",
                                                "Ano ang sasabihin ko kapag ganap na akong nakatayo pagkatapos ng pagyuko?"), "u01-l7-c1",
       options=[opt("a", "ربنا ولك الحمد", "ربنا ولك الحمد (Meaning: Our Lord, and to You is all praise)", "ربنا ولك الحمد (Kahulugan: Panginoon namin, tanging sa Iyo lamang ang papuri)"),
                opt("b", "سبحان ربي العظيم", "سبحان ربي العظيم (Meaning: Glory is to my Lord, the Great)", "سبحان ربي العظيم (Kahulugan: Ang kaluwalhatian ay sa aking Panginoon, ang Pinakadakila)"),
                opt("c", *DH["jalsa"].values())], answer="a"),
    ex("u01-l7-e5", "choice", ["u01-l7-o3"], T("في أي الصلوات أجلس للتشهد الأول؟", "In which prayers do I sit for the first tashahhud?",
                                                "Sa aling mga salah ako uupo para sa unang Tashahud?"), "u01-l7-c6",
       options=[opt("a", "الظهر والعصر والمغرب والعشاء", "Dhuhr, ‘Asr, Maghrib and ‘Isha’", "Dhuhr, Asr, Maghrib at Isha"),
                opt("b", "الفجر وحدها", "Fajr only", "Fajr lamang"), opt("c", "لا يوجد تشهد أول", "There is no first tashahhud", "Walang unang Tashahud")], answer="a"),
    ex("u01-l7-e6", "choice", ["u01-l7-o3"], T("كيف تنتهي الصلاة؟", "How does the prayer end?", "Paano nagtatapos ang salah?"), "u01-l7-c8",
       options=[opt("a", "أسلّم عن يميني ثم عن شمالي", "I give salām to my right, then to my left", "Babati ako sa kanan, pagkatapos sa kaliwa"),
                opt("b", "أقوم من السجود", "I stand up from prostration", "Tatayo ako mula sa sujud"),
                opt("c", "أرفع يديّ وأكبّر", "I raise my hands and say الله أكبر", "Itataas ko ang kamay at sasabihin ang الله أكبر")], answer="a"),
]


# ---------------------------------------------------------------- reviewer decisions 2026-10-06
# 1) The meaning of each dhikr stays in English and Filipino, labelled so it is never taken
#    for the words to say in prayer. 2) Where the editions differ, the Arabic edition governs.
# 3) Wording corrected to the printed book (owner's spreadsheet) where the site differs.
MEANING = {"en": [
    ("(Allah is the Most Great)", "(Meaning: Allah is the Most Great)"),
    ("(Glory and praise be to You O Allah.", "(Meaning: Glory and praise be to You O Allah."),
    ("(I seek refuge in Allah from the accursed Satan)", "(Meaning: I seek refuge in Allah from the accursed Satan)"),
    ("(Glory is to my Lord, the Great)", "(Meaning: Glory is to my Lord, the Great)"),
    ("(Allah hears the one who praises Him)", "(Meaning: Allah hears the one who praises Him)"),
    ("(Our Lord, and to You is all praise)", "(Meaning: Our Lord, and to You is all praise)"),
    ("(Glory is to my Lord, the Most High)", "(Meaning: Glory is to my Lord, the Most High)"),
    ("(My Lord, forgive my sins)", "(Meaning: My Lord, forgive my sins)"),
    ("(All compliments, prayers", "(Meaning: All compliments, prayers"),
    ("(Peace and blessings of Allah be upon you)", "(Meaning: Peace and blessings of Allah be upon you)"),
], "tl": [
    ("(ang Allah ang Pinakadakila)", "(Kahulugan: ang Allah ang Pinakadakila)"),
    ("“Ang kaluwalhatian ay sa Iyo O Allah", "(Kahulugan:) “Ang kaluwalhatian ay sa Iyo O Allah"),
    ("(Ang kaluwalhatian ay sa aking Panginoon, ang Pinakadakila)", "(Kahulugan: Ang kaluwalhatian ay sa aking Panginoon, ang Pinakadakila)"),
    ("(dininig ng Allah ang sinumang pumuri sa kanya)", "(Kahulugan: dininig ng Allah ang sinumang pumuri sa kanya)"),
    ("(Panginoon namin, tanging sa Iyo lamang ang papuri)", "(Kahulugan: Panginoon namin, tanging sa Iyo lamang ang papuri)"),
    ("(Luwalhati sa aking Panginoon, ang Kataas-taasan)", "(Kahulugan: Luwalhati sa aking Panginoon, ang Kataas-taasan)"),
    ("(Panginoon, patawarin mo ako)", "(Kahulugan: Panginoon, patawarin mo ako)"),
    ("“Ang lahat ng kapangyarihan at kadakilaan", "(Kahulugan:) “Ang lahat ng kapangyarihan at kadakilaan"),
    ("“O Allah! Puriin nawa si Muhammad", "(Kahulugan:) “O Allah! Puriin nawa si Muhammad"),
    (", ang kapayapaan at mga pagpapala ng Allah ay sumaiyo,", " (Kahulugan: ang kapayapaan at mga pagpapala ng Allah ay sumaiyo),"),
]}
MEANING_NOTE = "The meaning of the dhikr is labelled «Meaning» so it is not taken for the words of prayer (reviewer, 2026-10-06)."
PRINTED = {
    "u01-l2-c4": {"ar": [("علي أصل خلقته", "على أصل خلقته")]},
    "u01-l1-c5": {"en": [("leave what he forbade", "avoid what he forbade")]},
    "u01-l3-c1": {"en": [("to perform the worship to get close", "to perform the worship in order to get close")]},
    "u01-l4-c3": {"en": [("to the nape and then back.", "to the nape and then all the way back.")]},
    "u01-l5-c2": {"en": [("minor impurity, and major impurity if", "minor impurity, and from major impurity if")]},
}
ARABIC_GOVERNS = {
    "u01-l3-c2": {"tl": [("Ang paghugas ng kamay ng tatlong beses.", "Ang paghugas ng kamay.")]},
    "u01-l3-c3": {"tl": [("Ang pagmumog ng tatlong beses", "Ang pagmumog")]},
}
ARABIC_NOTE = "“Three times” removed: the Arabic edition does not say it, and the Arabic edition governs (reviewer, 2026-10-06)."
PRINTED_NOTE = "Wording corrected to the printed book (owner's aligned spreadsheet) where the site differs."
for lesson in (L6, L7):
    for c in lesson["cards"]:
        for lang, pairs in MEANING.items():
            before = c["text"][lang]
            for a, b in pairs:
                c["text"][lang] = c["text"][lang].replace(a, b)
            if c["text"][lang] != before:
                c.setdefault("edited", {})[lang] = (c.get("edited", {}).get(lang, "") + " " + MEANING_NOTE).strip()
for lesson in (L1, L2, L3, L4, L5):
    for c in lesson["cards"]:
        for lang, pairs in PRINTED.get(c["id"], {}).items():
            for a, b in pairs:
                assert a in c["text"][lang], (c["id"], a)
                c["text"][lang] = c["text"][lang].replace(a, b)
            c.setdefault("edited", {})[lang] = (c.get("edited", {}).get(lang, "") + " " + PRINTED_NOTE).strip()
        for lang, pairs in ARABIC_GOVERNS.get(c["id"], {}).items():
            for a, b in pairs:
                assert a in c["text"][lang], (c["id"], a)
                c["text"][lang] = c["text"][lang].replace(a, b)
            c.setdefault("edited", {})[lang] = (c.get("edited", {}).get(lang, "") + " " + ARABIC_NOTE).strip()

LESSONS = [L1, L2, L3, L4, L5, L6, L7]

unit = {
    "schema_version": 1,
    "id": "u01", "order": 1, "feature": "LRN-01",
    "status": "draft_unreviewed",
    "review_note": "Prepared without item-by-item Sharia review (decision 2026-10-05). Must be re-reviewed and approved by the Sharia reviewer, per language, before it is shown to users (rules.md §1.4).",
    "title": T("دليل اليوم الأول", "My First Day Guide", "Gabay sa Unang Araw"),
    "badge": T("أكملت دليل اليوم الأول", "I completed My First Day Guide", "Natapos ko ang Gabay sa Unang Araw"),
    "credit": T("دروس هذه الوحدة من كتاب «المختصر المفيد للمسلم الجديد» لمحمد بن الشيبة الشهري (newmuslimguideline.com)، والصور منه. وصوت الفاتحة وترجمة معانيها من IslamHouse.",
                "The lessons in this unit are from the book “New Muslim Guideline” by Muhammad al-Shehri (newmuslimguideline.com), including the photos. Al-Fatihah audio and meaning are from IslamHouse.",
                "Ang mga aralin sa yunit na ito ay mula sa aklat na “New Muslim Guideline” ni Muhammad al-Shehri (newmuslimguideline.com), pati ang mga larawan. Ang audio at kahulugan ng Al-Fatiha ay mula sa IslamHouse."),
    "media": {
        "support_video": {
            "wudu": {"ar": "https://d1.islamhouse.com/data/ar/ih_videos/mp4/single/ar-sifat-alwoduo.mp4",
                     "en": "https://d1.islamhouse.com/data/en/ih_videos/mp4/single/en-how-to-perform-wudu.mp4", "tl": None},
            "salah": {"ar": "https://d1.islamhouse.com/data/ar/ih_videos/mp4/single/ar-how-to-pray.mp4",
                      "en": "https://ih-download.islamenc.com/data/en/ih_videos/mp4/single/en_Salah_With_al_Duaa.mp4", "tl": None},
        },
        "audio": {
            "fatiha": {"ar": ["https://d1.islamhouse.com/data/ar/ih_sounds/chain_01/mokhtasar-fe-tafceer/ar-001-mokhtasar-fe-tafceer.mp3"],
                       "en": [f"https://d1.islamhouse.com/data/en/ih_sounds/group/translation-meanings-holy-quran/001-alfatihah/en-0{i}-alfatihah.mp3" for i in range(1, 8)],
                       "tl": [f"https://d1.islamhouse.com/data/tl/ih_sounds/group/pagsasalin-ng-mga-kahulugan-ng-banal-na-quran/001-alfatihah/tl-0{i}-alfatihah.mp3" for i in range(1, 8)]},
        },
        "media_note": "Serve these files from Rafeeq's own storage, never embedded from a video platform (LRN-01 rule 5). The English prayer video did not play in a test browser: test it, convert its format if needed, otherwise leave English prayer lessons without a video.",
    },
    "omitted": [
        {"where": "Lessons 5–7 (English and Filipino)", "what": "Transliterated adhkar and Al-Fatihah", "why": "No transliteration (rules.md §1.4); replaced with the Arabic wording from the Arabic edition, and recorded in each card's `edited` field."},
        {"where": "Lesson 4 (English) and lesson 7 (Filipino)", "what": "Lines the site repeats", "why": "Duplicates on the site pages; recorded in each card's `note` field."},
    ],
    "lessons": LESSONS,
}
OUT.write_text(json.dumps(unit, ensure_ascii=False, indent=2) + "\n", encoding="utf8")
print("written", OUT)
