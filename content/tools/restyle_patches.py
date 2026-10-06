"""Per-exercise changes for restyle_exercises.py (Sharia reviewer's style, 2026-10-06).

Key: lesson id → exercise number (1-based, as built) → one of
  "add": [T(...) source strings] extra wrong options for a choice question,
  "prompt": T(...) source string replacing the prompt,
  "replace": a whole exercise call (source string) replacing a recall exercise.
Options are written from the lesson's cards only; wrong options state nothing disputed.
"""

PATCHES = {
    # ------------------------------------------------------------------ unit 2
    "u2-l1": {
        1: {"prompt": "T('صِل كل عبارة بما يتمّ معناها', 'Match each statement with what completes its meaning', "
                      "'Itugma ang bawat pahayag sa kukumpleto ng kahulugan nito')"},
        2: {"prompt": "T('مَن أثبت لله الأسماء الحسنى والصفات العلا؟', "
                      "'Who established the excellent names and sublime attributes for Allah?', "
                      "'Sino ang naglarawan kay Allah ng magagandang Pangalan at mararangal na katangian?')",
            "add": ["T('الملائكة وحدهم', 'The angels alone', 'Ang mga anghel lamang')"]},
        3: {"replace": "choose([2], [4, 1, 2], T('ما معنى أن الله هو المستحق وحده العبادة؟', "
                       "'What does it mean that Allah alone is worthy of worship?', "
                       "'Ano ang kahulugan na si Allah lamang ang karapat-dapat sambahin?'), "
                       "[T('لا ربّ غيره ولا إله سواه', 'There is no lord or god other than Him', "
                       "'Walang ibang Panginoon at walang ibang Diyos maliban sa Kanya'), "
                       "T('يُعبد الله ويُعبد معه غيره', 'Allah is worshipped along with others', 'Sinasamba si Allah kasama ng iba'), "
                       "T('العبادة لكل من نحبّه', 'Worship is for anyone we love', 'Ang pagsamba ay para sa sinumang mahal natin')])"},
        4: {"replace": "choose([1], [4, 1], T('أيّ هذه من معاني أن الله رب كل شيء؟', "
                       "'Which of these is part of Allah being the Lord of all things?', "
                       "'Alin dito ang bahagi ng pagiging Panginoon ni Allah ng lahat ng bagay?'), "
                       "[T('أنه المالك، الخالق، الرازق، المدبّر كل شيء', 'He is the Possessor, the Creator, the Provider and the Disposer of everything', "
                       "'Siya ang Tagapagmay-ari, ang Tagapaglikha, ang Tagapagtustos at ang Tagapangasiwa ng lahat ng bagay'), "
                       "T('أنه خلق الأشياء ثم تركها بلا تدبير', 'He created things and then left them unmanaged', 'Nilikha Niya ang mga bagay at pinabayaan'), "
                       "T('أن لكل شيء ربًّا غيره', 'Each thing has a lord other than Him', 'May ibang panginoon ang bawat bagay')])"},
        5: {"prompt": "T('هل يشبه اللهَ شيءٌ من خلقه؟', 'Is anything in creation like Allah?', 'May katulad ba si Allah sa Kanyang mga nilikha?')",
            "add": ["T('يشبه الإنسانَ في صفاته', 'He resembles people in His attributes', 'Kahawig Niya ang tao sa Kanyang mga katangian')"]},
    },
    "u2-l2": {
        2: {"replace": "choose([1], [1], T('أيّ اسم معناه: ذو القدرة الكاملة الذي لا يعتريه عجز ولا فتور؟', "
                       "'Which name means: the One who never experiences inability or weariness?', "
                       "'Aling pangalan ang nangangahulugang: hindi nakakaranas ng pagkapagod o kawalan ng kakayahan?'), "
                       "[T('القدير', 'The All-Powerful', 'Ang ganap na Makapangyarihan'), T('الرزّاق', 'The Provider', 'Ang Tagapanustos'), "
                       "T('الملك', 'The King and Sovereign', 'Ang Kataas-taasang Hari')])"},
        4: {"replace": "choose([2], [2], T('أيّ اسم معناه: الذي أحاط بصره بكل شيء وإن دقّ وصغر؟', "
                       "'Which name means: the One whose sight encompasses everything, however small?', "
                       "'Aling pangalan ang nangangahulugang: nakikita ang lahat ng bagay, malaki man o maliit?'), "
                       "[T('البصير', 'The All-Seeing', 'Ang ganap na Nakakakita'), T('السميع', 'The All-Hearing', 'Ang Nakakarinig'), "
                       "T('الوكيل', 'The Trustee', 'Ang Ganap na Tagapagkupkop')])"},
        6: {"replace": "choose([3], [3], T('أيّ اسم معناه: الذي يكفي عباده جميع ما يحتاجون إليه؟', "
                       "'Which name means: the One who provides His servants with all they need?', "
                       "'Aling pangalan ang nangangahulugang: nagbibigay sa Kanyang mga alipin ng lahat ng kanilang pangangailangan?'), "
                       "[T('الكافي', 'The Sufficient', 'Ang Sapat'), T('الخالق', 'The Creator', 'Ang Tagapaglikha'), "
                       "T('اللطيف', 'The Subtle and Kind', 'Ang Banayad at ang Mabait')])"},
        7: {"prompt": "T('ماذا يفعل المسلم حين يرى عناية المخلوقات بصغارها؟', "
                      "'What does a Muslim do when he sees creatures caring for their young?', "
                      "'Ano ang ginagawa ng Muslim kapag nakita niya ang pag-aalaga ng mga nilalang sa kanilang mga anak?')",
            "add": ["T('أن يظن أن ذلك حدث مصادفة', 'To think it happened by chance', 'Isipin na nangyari ito nang nagkataon lamang')"]},
        8: {"add": ["T('الإنسان وحده', 'People alone', 'Ang tao lamang')"]},
    },
    "u2-l3": {
        1: {"add": ["T('ملَك من الملائكة', 'An angel', 'Isang anghel')"]},
        2: {"add": ["T('إلى أهل مكة وحدهم', 'To the people of Makkah only', 'Sa mga tao ng Makkah lamang')"]},
        3: {"prompt": "T('صِل كلًّا منهما بأعظمه', 'Match each with the greatest of it', 'Itugma ang bawat isa sa pinakadakila nito')"},
        4: {"add": ["T('كثرة المال', 'Having much wealth', 'Pagkakaroon ng maraming kayamanan')"]},
        5: {"prompt": "T('أيّ مجموعة كلها من صفاته ﷺ؟', 'Which group lists only his qualities (peace be upon him)?', "
                      "'Aling grupo ang pawang mga katangian niya (pagpalain siya ni Allah)?')",
            "add": ["T('الغضب، والكِبر، والقسوة', 'Anger, arrogance and harshness', 'Galit, kayabangan at kalupitan')"]},
        6: {"add": ["T('البخل، والجبن، والكذب', 'Stinginess, cowardice and lying', 'Pagkakuripot, karuwagan at pagsisinungaling')"]},
    },
    "u2-l4": {
        2: {"prompt": "T('صِل كل جزء بما يتمّ معناه', 'Match each part with what completes its meaning', 'Itugma ang bawat bahagi sa kukumpleto ng kahulugan nito')"},
        3: {"add": ["T('ليشقّ عليهم في حياتهم', 'To make their lives hard', 'Upang pahirapan ang kanilang buhay')"]},
        4: {"prompt": "T('صِل كل عمل بثمرته', 'Match each deed with its fruit', 'Itugma ang bawat gawa sa bunga nito')"},
        5: {"add": ["T('لا شيء', 'Nothing', 'Wala')"]},
    },
    # ------------------------------------------------------------------ unit 3
    "u3-l1": {
        3: {"add": ["T('لأنها من الآداب المستحبة فقط', 'Because they are only recommended manners', 'Dahil ang mga ito ay mabubuting asal lamang na hindi obligado')"]},
        4: {"add": ["T('تلزم العلماء وحدهم', 'They are required of scholars only', 'Obligado lamang ang mga ito sa mga iskolar')"]},
    },
    "u3-l2": {
        1: {"add": ["T('بالقراءة عنها دون أدائها', 'By reading about it without performing it', 'Sa pagbabasa tungkol dito nang hindi ito isinasagawa')"]},
        3: {"prompt": "T('من أسباب فرض الزكاة:', 'One reason Allah made zakah obligatory:', 'Isa sa mga dahilan kung bakit inobliga ni Allah ang zakah:')"},
        4: {"add": ["T('للأغنياء', 'To the rich', 'Sa mayayaman')"]},
        5: {"add": ["T('لا خير فيه للمجتمع', 'No good for society', 'Walang kabutihan para sa lipunan')"]},
        7: {"add": ["T('مرة واحدة في العمر', 'Once in a lifetime', 'Isang beses lamang sa buong buhay')"]},
    },
    "u3-l3": {
        2: {"add": ["T('مستحبّ لمن شاء', 'Recommended for whoever wishes', 'Mabuti lamang para sa may nais')"]},
        3: {"add": ["T('طوال اليوم والليلة', 'All day and all night', 'Buong araw at buong gabi')"]},
        5: {"add": ["T('كل عشر سنين', 'Every ten years', 'Bawat sampung taon')"]},
        6: {"prompt": "T('هل حجّ الأنبياءُ البيتَ؟', 'Did the prophets perform Hajj to the House?', 'Nagsagawa ba ng Hajj ang mga propeta?')",
            "add": ["T('حجّ النبي ﷺ وحده', 'Only the Prophet (peace be upon him)', 'Ang Propeta lamang')"]},
    },
    # ------------------------------------------------------------------ unit 4
    "u4-l1": {
        4: {"add": ["T('ليست من أركان الدين', 'Not pillars of the religion at all', 'Hindi mga haligi ng relihiyon')"]},
        5: {"add": ["T('بكثرة المال / بقلّة المال', 'With wealth / with poverty', 'Sa yaman / sa kahirapan')"]},
    },
    "u4-l2": {
        1: {"prompt": "T('صِل كلًّا بما يصفه', 'Match each with its description', 'Itugma ang bawat isa sa paglalarawan nito')"},
        4: {"add": ["T('القرآن وحده كلام الله دون الكتب التي قبله', 'Only the Quran is Allah’s speech, not the books before it', 'Ang Quran lamang ang salita ni Allah at hindi ang mga naunang kasulatan')"]},
        5: {"add": ["T('العلماء وحدهم', 'The scholars alone', 'Ang mga iskolar lamang')"]},
        6: {"add": ["T('لأنه أطول الكتب', 'Because it is the longest book', 'Dahil ito ang pinakamahabang aklat')"]},
    },
    "u4-l3": {
        1: {"prompt": "T('صِل كل عبارة بما يتمّ معناها', 'Match each statement with what completes its meaning', 'Itugma ang bawat pahayag sa kukumpleto ng kahulugan nito')"},
        2: {"add": ["T('إلى عبادة الملائكة', 'To worship the angels', 'Sa pagsamba sa mga anghel')"]},
        3: {"add": ["T('ملائكة في صورة بشر', 'Angels in human form', 'Mga anghel na nasa anyong tao')"]},
        4: {"add": ["T('لم يبلّغوا شيئًا', 'They conveyed nothing', 'Wala silang ipinarating')"]},
        5: {"add": ["T('كثرة العبادات دون توحيد', 'Many acts of worship without tawhid', 'Maraming pagsamba nang walang tawhid')"]},
        6: {"prompt": "T('مما يتعلق باليوم الآخر:', 'Among the things related to the Last Day:', 'Kabilang sa mga may kaugnayan sa Huling Araw:')",
            "add": ["T('الأعمال اليومية في الدنيا', 'Daily work in this world', 'Ang pang-araw-araw na gawain sa mundong ito')"]},
        7: {"add": ["T('اتفق عليه الناس', 'Whatever people agreed on', 'Anumang napagkasunduan ng mga tao')"]},
    },
    "u4-l4": {
        3: {"add": ["T('لم تُكتب أبدًا', 'They were never written', 'Hindi kailanman isinulat ang mga ito')"]},
        4: {"add": ["T('له إرادة تخرج عن مشيئة الله', 'He has a will outside Allah’s will', 'May kalooban siyang labas sa kalooban ni Allah')"]},
        5: {"add": ["T('مصادفة لا تدبير فيها', 'Chance with no planning', 'Nagkataon lamang nang walang pangangasiwa')"]},
        6: {"add": ["T('لا يفعلها هو، بل تقع عليه بلا إرادة', 'He does not do them; they happen to him without his will', 'Hindi siya ang gumagawa; nangyayari lamang sa kanya nang walang kalooban')"]},
    },
    # ------------------------------------------------------------------ unit 5
    "u5-l1": {
        1: {"add": ["T('في أي وقت ولو بلا طهارة', 'At any time, even without purity', 'Kahit kailan, kahit walang kalinisan')"]},
        2: {"prompt": "T('أيّ هذه من شروط المسح؟', 'Which of these is a condition for wiping?', 'Alin dito ang kondisyon sa pagpunas?')",
            "add": ["T('أن يكونا جديدين', 'That they are new', 'Na bago ang mga ito')"]},
        3: {"add": ["T('عادة لا حكمة فيها', 'A habit with no wisdom behind it', 'Isang kaugalian lamang na walang karunungan')"]},
        5: {"add": ["T('سبعة أيام', 'Seven days', 'Pitong araw')"]},
        7: {"add": ["T('بالرجل الأخرى', 'With the other foot', 'Gamit ang kabilang paa')"]},
        8: {"prompt": "T('مما يبطل المسح:', 'Among what makes the wiping invalid:', 'Kabilang sa nakakawala ng bisa ng pagpunas:')",
            "add": ["T('المشي بهما', 'Walking in them', 'Paglakad habang suot ang mga ito')"]},
        9: {"add": ["T('يمسح على الخفين بدل الغسل', 'He wipes over the khuffs instead of ghusl', 'Magpupunas siya sa khuff sa halip na maligo')"]},
    },
    "u5-l2": {
        1: {"prompt": "T('مما يوجب الغسل:', 'Among what makes ghusl obligatory:', 'Kabilang sa nag-oobliga ng paliligo:')",
            "add": ["T('الأكل والشرب', 'Eating and drinking', 'Pagkain at pag-inom')"]},
        3: {"add": ["T('أن يمسح رأسه فقط', 'To wipe the head only', 'Ang pagpunas lamang ng ulo')"]},
        4: {"add": ["T('عليه أن يعيد الغسل مرة أخرى', 'He must repeat the ghusl', 'Kailangan niyang ulitin ang paliligo')"]},
        5: {"add": ["T('الأكل والنوم', 'Eating and sleeping', 'Pagkain at pagtulog')"]},
    },
    "u5-l3": {
        1: {"add": ["T('إذا أراد أن يصلي بسرعة', 'When he wants to pray quickly', 'Kapag nais niyang magdasal nang mabilis')"]},
        2: {"add": ["T('بالزيت', 'With oil', 'Gamit ang langis')"]},
        3: {"add": ["T('الظهر والبطن', 'The back and the stomach', 'Ang likod at ang tiyan')"]},
        4: {"add": ["T('أن يكون من بلد معين', 'That it comes from a certain land', 'Na ito ay mula sa isang tiyak na lugar')"]},
        5: {"add": ["T('بمرور ساعة عليه', 'When an hour has passed', 'Pagkalipas ng isang oras')"]},
        6: {"add": ["T('يصلي بالتيمم ثم يتوضأ', 'He prays with tayammum, then makes wudu', 'Magdarasal siya sa tayammum at saka magwudhu')"]},
    },
    # ------------------------------------------------------------------ unit 6
    "u6-l1": {
        1: {"add": ["T('لا تستره عن أحد', 'From no one', 'Hindi sa sinuman')"]},
        2: {"add": ["T('أمام كل من تعرفه', 'In front of anyone she knows', 'Sa harap ng sinumang kakilala niya')"]},
        3: {"add": ["T('كل الأقارب ولو جاز لها الزواج بهم', 'All relatives, even those she may marry', 'Lahat ng kamag-anak, kahit yaong maaari niyang pakasalan')"]},
        4: {"add": ["T('بلباس شفاف', 'With see-through clothing', 'Gamit ang manipis na damit na nakikita ang katawan')"]},
        5: {"add": ["T('أن يكون ضيقًا يصف الجسم', 'That it is tight and shows the shape of the body', 'Na ito ay masikip at naglalarawan sa hugis ng katawan')"]},
        6: {"add": ["T('نعم، إذا كان جميلًا', 'Yes, if it looks nice', 'Oo, kung ito ay maganda')"]},
    },
    "u6-l2": {
        1: {"add": ["T('يكتم الحق', 'He hides the truth', 'Itinatago niya ang katotohanan')"]},
        3: {"add": ["T('يشكر في الرخاء ويسخط في الضراء', 'Grateful in ease, resentful in hardship', 'Nagpapasalamat sa ginhawa, nagagalit sa kahirapan')"]},
        4: {"prompt": "T('صِل كلًّا بحال المؤمن معه', 'Match each with how the believer deals with it', 'Itugma ang bawat isa sa pakikitungo ng mananampalataya rito')"},
        5: {"prompt": "T('مما يجتنبه المؤمن:', 'Among what the believer avoids:', 'Kabilang sa iniiwasan ng mananampalataya:')",
            "add": ["T('الصدق، والوفاء بالعهد', 'Truthfulness and keeping promises', 'Katapatan at pagtupad sa pangako')"]},
        6: {"add": ["T('يطيعهما في كل شيء ولو في معصية', 'He obeys them in everything, even in sin', 'Sinusunod niya sila sa lahat, kahit sa kasalanan')"]},
        7: {"add": ["T('يقاطعهم', 'He cuts them off', 'Pinuputol niya ang ugnayan sa kanila')"]},
        8: {"add": ["T('يسرق من غير المسلمين', 'He steals from non-Muslims', 'Nagnanakaw siya sa mga hindi Muslim')"]},
    },
    "u6-l3": {
        1: {"add": ["T('كثرة المال', 'Having much wealth', 'Pagkakaroon ng maraming kayamanan')"]},
        2: {"prompt": "T('بماذا أمرنا الله سبحانه؟', 'What has Allah commanded us to do?', 'Ano ang iniutos sa atin ni Allah?')",
            "add": ["T('بأن ندعو غيره', 'To call upon others besides Him', 'Na manalangin sa iba bukod sa Kanya')"]},
        3: {"add": ["T('للّهو واللعب', 'For amusement and play', 'Para sa libangan at laro')"]},
        4: {"add": ["T('المال والجاه فقط', 'Wealth and status only', 'Kayamanan at katayuan lamang')"]},
        5: {"add": ["T('لا فرق بينه وبين غيره', 'Is no different from anyone else', 'Walang pagkakaiba sa iba')"]},
        6: {"add": ["T('الحزن والقلق', 'Sadness and worry', 'Kalungkutan at pag-aalala')"]},
        7: {"prompt": "T('صِل كل عبارة بما يتمّ معناها', 'Match each statement with what completes its meaning', 'Itugma ang bawat pahayag sa kukumpleto ng kahulugan nito')"},
    },
    "u6-l4": {
        1: {"prompt": "T('أكمل قول النبي ﷺ: «ذاق طعم الإيمان من رضي…»', 'Complete the Prophet’s saying (peace be upon him): “He has tasted the sweetness of faith who is pleased…”', 'Kumpletuhin ang sinabi ng Propeta: “Natikman ang tamis ng pananampalataya ng sinumang nalugod…”')"},
        2: {"add": ["T('مرارة الحياة', 'The bitterness of life', 'Ang pait ng buhay')"]},
        3: {"add": ["T('لا ينفعه ذلك في الآخرة', 'It does not help him in the Hereafter', 'Hindi ito makabubuti sa kanya sa Kabilang Buhay')"]},
        4: {"prompt": "T('كيف يعبد المؤمن ربه؟', 'How does the believer worship his Lord?', 'Paano sumasamba ang mananampalataya sa kanyang Panginoon?')",
            "add": ["T('ليراه الناس', 'So that people see him', 'Upang makita siya ng mga tao')"]},
        5: {"add": ["T('بنسيان الله', 'By forgetting Allah', 'Sa paglimot kay Allah')"]},
        6: {"prompt": "T('صِل كل عبارة بما يتمّ معناها', 'Match each statement with what completes its meaning', 'Itugma ang bawat pahayag sa kukumpleto ng kahulugan nito')"},
        7: {"prompt": "T('من أين يتعلّم المسلم أمور دينه؟', 'Where does the Muslim learn about his religion?', 'Saan natututo ang Muslim tungkol sa kanyang relihiyon?')",
            "add": ["T('مما يتناقله الناس دون تحقّق', 'From whatever people pass around without checking', 'Mula sa anumang ipinapasa ng mga tao nang hindi sinusuri')"]},
        8: {"prompt": "T('صِل كل عبارة بما يتمّ معناها', 'Match each statement with what completes its meaning', 'Itugma ang bawat pahayag sa kukumpleto ng kahulugan nito')"},
    },
}
