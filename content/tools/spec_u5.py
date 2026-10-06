"""Unit 5 — أتطهّر (LRN-09). Line numbers: ar/en = spreadsheet rows, tl = site lines."""
from build import S, J, D, Q, X, C, O, L, T, choose, order, match

TITLE = 'repeats the section title (shown as the lesson title)'

u5l1 = L(
    'u5-l1', T('المسح على الخفين والجوربين', 'Wiping over Khuffs and Socks', 'Pagpahid sa Khuff at Medyas'),
    {'site_section': 'المسح على الخفين والجوربين (intro + tab7_1…tab7_4)', 'steps': None, 'page_ar': '76–80'},
    {'ar': [(153, 173)], 'en': [(153, 173)], 'tl': [(267, 305)]},
    [
        C('text', 'conditions', ar=[154, 155, 156, 157, 158], en=[154, 155, 156, 157, 158],
          tl=[267, 268, J(269), 270, J(271), 272, J(273), 274, J(275)]),
        C('text', 'definitions', ar=[159, 160], en=[159, 160], tl=[276, 277]),
        C('text', 'wisdom', ar=[161, 162], en=[161, 162], tl=[282, 283]),
        C('text', 'duration', ar=[163, 164, 165, 166], en=[163, 164, 165, 166], tl=[286, 287, 288, 289]),
        C('text', 'how to wipe', ar=[167, 168, 169, 170], en=[167, 168, 169, 170],
          tl=[292, 293, J(294), 295, J(296), 297, J(298)]),
        C('text', 'what invalidates wiping', ar=[171, 172, 173], en=[171, 172, 173], tl=[301, 302, J(303), 304, J(305)]),
    ],
    [
        O(T('يعرف متى يجوز المسح على الخفين والجوربين وشروطه', 'Knows when wiping over khuffs and socks is allowed, and its conditions',
            'Alam kung kailan maaaring magpahid sa khuff at medyas, at ang mga kondisyon nito'), [1, 2, 3], key=True),
        O(T('يعرف مدة المسح للمقيم والمسافر', 'Knows how long wiping lasts for a resident and for a traveller',
            'Alam ang tagal ng pagpahid para sa residente at sa manlalakbay'), [4], key=True),
        O(T('يصف صفة المسح', 'Describes how to wipe', 'Nailalarawan ang paraan ng pagpahid'), [5]),
        O(T('يعرف ما يبطل المسح', 'Knows what makes the wiping invalid', 'Alam ang nakasisira sa bisa ng pagpahid'), [6]),
    ],
    [
        choose([1], [1], T('يُشترط أن يكون لبس الخفين أو الجوربين:', 'The khuffs or socks must be put on:',
                           'Dapat isuot ang medyas o khuff:'),
               [T('بعد طهارة كاملة غُسلت فيها الرجلان', 'after a complete purification in which the feet were washed',
                  'pagkatapos ng paghuhugas kung saan hinugasan ang mga paa'),
                T('قبل الوضوء', 'before wudu', 'bago mag-wudhu'), T('في أي وقت ولو بلا طهارة', 'At any time, even without purity', 'Kahit kailan, kahit walang kalinisan')]),
        choose([1], [1, 2], T('أيّ هذه من شروط المسح؟', 'Which of these is a condition for wiping?', 'Alin dito ang kondisyon sa pagpunas?'),
               [T('أن يكونا طاهرين، حلالين غير مسروقين ولا مغصوبين', 'They must be pure, and lawfully owned — not stolen or seized',
                  'Dapat malinis ang mga ito at mula sa halal, hindi ninakaw o kinuha nang sapilitan'),
                T('أن يكون المسح بعد انتهاء المدة', 'The wiping must be after the time limit has ended',
                  'Ang pagpahid ay dapat pagkatapos ng limitasyon ng oras'), T('أن يكونا جديدين', 'That they are new', 'Na bago ang mga ito')]),
        choose([1], [3], T('الحكمة من المسح على الخفين:', 'The wisdom behind wiping over khuffs:', 'Ang karunungan sa likod ng pagpahid:'),
               [T('التيسير والتخفيف على المسلمين، خاصة في الشتاء والبرد الشديد والسفر',
                  'to make things easier for Muslims, especially in winter and severe cold, and in travel',
                  'upang mapadali para sa mga Muslim, lalo na sa panahon ng taglamig at sa paglalakbay'),
                T('التشديد على المسلمين', 'to make things harder for Muslims', 'upang pahirapan ang mga Muslim'), T('عادة لا حكمة فيها', 'A habit with no wisdom behind it', 'Isang kaugalian lamang na walang karunungan')]),
        match([2], [4], T('صِل كل شخص بمدة المسح له', 'Match each person with how long he may wipe',
                          'Itugma ang bawat tao sa tagal ng kanyang pagpahid'),
              [(T('المقيم', 'A non-traveller (resident)', 'Ang residente'), T('يوم وليلة (24 ساعة)', 'one day and one night (24 hours)', 'isang araw at gabi (24 na oras)')),
               (T('المسافر', 'A traveller', 'Ang manlalakbay'),
                T('ثلاثة أيام بلياليها (72 ساعة)', 'three days and three nights (72 hours)', 'tatlong araw at gabi (72 oras)'))]),
        choose([2], [4], T('كم مدة المسح للمسافر؟', 'How long may a traveller wipe?', 'Gaano katagal maaaring magpahid ang manlalakbay?'),
               [T('ثلاثة أيام بلياليها (72 ساعة)', 'Three days and three nights (72 hours)', 'Tatlong araw at gabi (72 oras)'),
                T('يوم وليلة (24 ساعة)', 'One day and one night (24 hours)', 'Isang araw at gabi (24 na oras)'), T('سبعة أيام', 'Seven days', 'Pitong araw')]),
        order([3], [5], T('رتّب صفة المسح', 'Put the way of wiping in order', 'Isaayos ang paraan ng pagpahid'),
              [T('تُبلّ اليدان', 'Get your hands wet', 'Basain ang mga kamay ng tubig'),
               T('تُمرّر اليد على ظاهر القدم من أطراف الأصابع إلى أول الساق', 'Pass your hand over the foot, from the toes to the shin',
                 'Ipahid ang kamay sa ibabaw ng paa mula sa mga daliri hanggang sa bukung-bukong'),
               T('تُمسح اليمنى باليمنى واليسرى باليسرى', 'The right foot with the right hand, the left foot with the left hand',
                 'Kanang kamay para sa kanang paa, kaliwang kamay para sa kaliwang paa')]),
        choose([3], [5], T('تُمسح القدم اليمنى:', 'The right foot is wiped:', 'Ang kanang paa ay pinapahiran:'),
               [T('باليد اليمنى', 'with the right hand', 'gamit ang kanang kamay'), T('باليد اليسرى', 'with the left hand', 'gamit ang kaliwang kamay'), T('بالرجل الأخرى', 'With the other foot', 'Gamit ang kabilang paa')]),
        choose([4], [6], T('مما يبطل المسح:', 'Among what makes the wiping invalid:', 'Kabilang sa nakakawala ng bisa ng pagpunas:'),
               [T('انتهاء مدة المسح', 'The end of the time limit for wiping', 'Kapag natapos na ang tagal ng pagpunas'),
                T('بلّ اليدين', 'Getting the hands wet', 'Ang pagbasa ng mga kamay'), T('المشي بهما', 'Walking in them', 'Paglakad habang suot ang mga ito')]),
        choose([4], [6], T('إذا وجب على الماسح الغسل:', 'If ghusl becomes obligatory on the person who wiped:',
                           'Kapag naging obligado ang paligo sa nagpahid:'),
               [T('بطل المسح', 'the wiping is invalid', 'nawawalan ng bisa ang pagpahid'),
                T('بقي المسح صحيحًا', 'the wiping stays valid', 'may bisa pa rin ang pagpahid'), T('يمسح على الخفين بدل الغسل', 'He wipes over the khuffs instead of ghusl', 'Magpupunas siya sa khuff sa halip na maligo')]),
    ],
    xdrops=[X('ar', 153, reason=TITLE), X('en', 153, reason=TITLE)],
    notes='Section «المسح على الخفين والجوربين». What invalidates the wiping differs between sources: the spreadsheet and '
          'the printed Arabic book say «ما يوجب الوضوء أو الغسل» (English sheet: "What makes Wudū\' or Ghusl obligatory"), '
          'while the Arabic site, the printed English book and the Filipino page say ghusl only. Cards follow the '
          'spreadsheet for ar/en and the site for tl; exercises use only what all three share (ghusl, end of the time limit). '
          'Sharia reviewer to decide (README). The site\'s tab images for this section are not used (no step cards here).',
)

u5l2 = L(
    'u5-l2', T('الغسل', 'Ghusl (Ritual Bath)', 'Ang Ghusl (Pagligo)'),
    {'site_section': 'الغسل (intro + tab8_1, tab8_2)', 'steps': None, 'page_ar': '82–84'},
    {'ar': [(175, 183)], 'en': [(175, 183)], 'tl': [(312, 331)]},
    [
        C('text', 'when ghusl is required', ar=[175], en=[175], tl=[312]),
        C('text', 'how to make ghusl', ar=[176, 177], en=[176, 177], tl=[317, 318]),
        C('text', 'forbidden until ghusl', ar=[178, 179, 180, 181, 182, 183], en=[178, 179, 180, 181, 182, 183],
          tl=[321, 322, J(323), 324, J(325), 326, J(327), 328, J(329), 330, J(331)]),
    ],
    [
        O(T('يعرف مما يوجب الغسل الجماعَ ونزول المني بشهوة', 'Knows that intercourse and ejaculation with desire require ghusl',
            'Alam na ang pakikipagtalik at paglabas ng semilya ay nag-oobliga ng paligo'), [1], key=True),
        O(T('يصف صفة الغسل: تعميم البدن كله بالماء', 'Describes ghusl: washing the whole body with water',
            'Nailalarawan ang ghusl: pagbasa ng buong katawan ng tubig'), [2], key=True),
        O(T('يعرف ما يُحظر على الجنب حتى يغتسل', 'Knows what a person in janābah may not do until he makes ghusl',
            'Alam ang mga bagay na hindi maaaring gawin ng isang junub hanggang siya ay maligo'), [3]),
    ],
    [
        choose([1], [1], T('مما يوجب الغسل:', 'Among what makes ghusl obligatory:', 'Kabilang sa nag-oobliga ng paliligo:'),
               [T('الجماع، أو نزول المني بشهوة', 'Sexual intercourse, or ejaculating semen with lust', 'Pakikipagtalik, o paglabas ng semilya'),
                T('قراءة القرآن', 'Reciting the Qur’an', 'Pagbasa ng Qur’an'), T('الأكل والشرب', 'Eating and drinking', 'Pagkain at pag-inom')]),
        match([1, 2, 3], [1, 2, 3], T('صِل كل عبارة بما يناسبها', 'Match each phrase with what fits it', 'Itugma ang bawat parirala sa angkop dito'),
              [(T('الجماع', 'Sexual intercourse', 'Pakikipagtalik'), T('يوجب الغسل', 'requires ghusl', 'nag-oobliga ng paligo')),
               (T('تعميم البدن كله بالماء', 'Washing the whole body with water', 'Pagbasa ng buong katawan ng tubig'),
                T('صفة الغسل', 'how ghusl is done', 'paraan ng ghusl')),
               (T('المكث في المسجد', 'Staying in the masjid', 'Pananatili sa Masjid'),
                T('يُحظر على الجنب حتى يغتسل', 'not allowed for a junub until he makes ghusl', 'hindi maaari sa junub hanggang siya ay maligo'))]),
        choose([2], [2], T('صفة الغسل:', 'The manner of ghusl:', 'Ang paraan ng ghusl:'),
               [T('أن يعمّم المسلم بدنه كله بالماء، ومن ذلك المضمضة والاستنشاق',
                  'the Muslim washes his whole body with water, including rinsing the mouth and sniffing water into the nose',
                  'babasain ng Muslim ang buong katawan ng tubig, kasama ang pagmumog at pagsinghot ng tubig'),
                T('أن يغسل الوجه واليدين فقط', 'washing only the face and hands', 'paghuhugas lamang ng mukha at kamay'), T('أن يمسح رأسه فقط', 'To wipe the head only', 'Ang pagpunas lamang ng ulo')]),
        choose([2], [2], T('إذا عمّم المسلم بدنه بالماء:', 'When the water has reached the whole body:',
                           'Kapag nabasa ang buong katawan ng tubig:'),
               [T('تمّت طهارته', 'his purification is complete', 'ganap na siyang malinis'),
                T('لم تتم طهارته بعد', 'his purification is not complete yet', 'hindi pa siya malinis'), T('عليه أن يعيد الغسل مرة أخرى', 'He must repeat the ghusl', 'Kailangan niyang ulitin ang paliligo')]),
        choose([3], [3], T('مما يُحظر على الجنب حتى يغتسل:', 'Which of these may a junub not do until he makes ghusl?',
                           'Alin dito ang hindi maaaring gawin ng junub hanggang siya ay maligo?'),
               [T('الصلاة، والطواف بالكعبة، ومسّ المصحف', 'Praying, circling the Ka‘bah, and touching the Mus-haf',
                  'Ang Salah, pagtawaf sa Ka’bah, at paghawak ng Mushaf'),
                T('تعميم البدن بالماء', 'Washing the whole body with water', 'Pagbasa ng buong katawan ng tubig'), T('الأكل والنوم', 'Eating and sleeping', 'Pagkain at pagtulog')]),
    ],
    notes='Section «الغسل». The Filipino page translates only the first sentence of the intro (intercourse / '
          'emission of semen) and not the sentence on the end of menstruation and post-natal bleeding; exercises '
          'ask only about what all three languages say. The sentence «ويجوز له العبور فقط من غير مكث» is shown on '
          'the card but not used in an exercise (passing through a masjid is a matter scholars differ on).',
)

u5l3 = L(
    'u5-l3', T('التيمم', 'Tayammum (Dry Purification)', 'Ang Tayammum'),
    {'site_section': 'التيمم (intro + tab9_1, tab9_2)', 'steps': None, 'page_ar': '86–88'},
    {'ar': [(185, 189)], 'en': [(185, 189)], 'tl': [(336, 348)]},
    [
        C('text', 'when tayammum', ar=[185], en=[185], tl=[336]),
        C('text', 'how tayammum', ar=[186], en=[186], tl=[341]),
        C('text', 'what invalidates tayammum', ar=[187, 188, 189], en=[187, 188, 189], tl=[344, 345, J(346), 347, J(348)]),
    ],
    [
        O(T('يعرف متى يتيمم المسلم', 'Knows when a Muslim makes tayammum', 'Alam kung kailan nagta-tayammum ang Muslim'), [1], key=True),
        O(T('يصف صفة التيمم', 'Describes how tayammum is done', 'Nailalarawan ang paraan ng tayammum'), [2], key=True),
        O(T('يعرف مبطلات التيمم', 'Knows what invalidates tayammum', 'Alam ang nakasisira sa tayammum'), [3]),
    ],
    [
        choose([1], [1], T('متى يتيمم المسلم؟', 'When does a Muslim make tayammum?', 'Kailan nagta-tayammum ang isang Muslim?'),
               [T('إذا لم يجد الماء أو لم يستطع استعماله لمرض ونحوه، وخشي فوات وقت الصلاة',
                  'when he cannot find water or cannot use it because of illness or the like, and fears missing the prayer time',
                  'kapag walang mahanap na tubig o hindi magamit dahil sa sakit, at nangangamba na mawala ang oras ng salah'),
                T('إذا وجد الماء واستطاع استعماله', 'when he has water and is able to use it', 'kapag may tubig at kaya itong gamitin'), T('إذا أراد أن يصلي بسرعة', 'When he wants to pray quickly', 'Kapag nais niyang magdasal nang mabilis')]),
        choose([1], [1], T('بماذا يتيمم المسلم؟', 'With what is tayammum made?', 'Gamit ang ano ang tayammum?'),
               [T('بالتراب', 'With sand or dust (earth)', 'Gamit ang lupa'), T('بالماء', 'With water', 'Gamit ang tubig'), T('بالزيت', 'With oil', 'Gamit ang langis')]),
        choose([2], [2], T('ماذا يمسح المتيمم؟', 'What does one wipe in tayammum?', 'Ano ang pinupunasan sa tayammum?'),
               [T('الوجه والكفين', 'The face and the hands', 'Ang mukha at mga kamay'),
                T('الرأس والرجلين', 'The head and the feet', 'Ang ulo at mga paa'), T('الظهر والبطن', 'The back and the stomach', 'Ang likod at ang tiyan')]),
        choose([2], [2], T('يُشترط في التراب الذي يُتيمم به:', 'The earth used for tayammum must be:',
                           'Ang lupang ginagamit sa tayammum ay dapat:'),
               [T('أن يكون طاهرًا', 'pure', 'malinis'), T('أن يكون مبلولًا بالماء', 'wet with water', 'basa ng tubig'), T('أن يكون من بلد معين', 'That it comes from a certain land', 'Na ito ay mula sa isang tiyak na lugar')]),
        choose([3], [3], T('يبطل التيمم:', 'Tayammum is invalidated:', 'Nawawalan ng bisa ang tayammum:'),
               [T('بما يبطل به الوضوء، وإذا وُجد الماء قبل البدء في العبادة', 'by whatever invalidates wudu, and if water is found before starting the worship',
                  'sa mga bagay na nakasisira sa wudhu, at kapag nakahanap ng tubig bago simulan ang pagsamba'),
                T('بمسح الوجه والكفين', 'by wiping the face and hands', 'sa pagpunas ng mukha at kamay'), T('بمرور ساعة عليه', 'When an hour has passed', 'Pagkalipas ng isang oras')]),
        choose([3], [3], T('إذا وجد المتيمم الماء قبل البدء في العبادة التي تيمم لها:',
                           'If water is found before starting the worship for which tayammum was made:',
                           'Kapag nakahanap ng tubig bago simulan ang pagsamba kung saan ginawa ang tayammum:'),
               [T('بطل تيممه', 'the tayammum is invalid', 'nawawalan ng bisa ang tayammum'),
                T('بقي تيممه صحيحًا', 'the tayammum stays valid', 'may bisa pa rin ang tayammum'), T('يصلي بالتيمم ثم يتوضأ', 'He prays with tayammum, then makes wudu', 'Magdarasal siya sa tayammum at saka magwudhu')]),
    ],
    notes='Section «التيمم». The English (and Filipino) says the hands are wiped "up to the wrist"; the Arabic says '
          '«وكفيه فقط»; exercises say "face and hands" only. The number of strikes is taught on the card (one) but '
          'not tested against another number, since scholars differ on it.',
)

LESSONS = [u5l1, u5l2, u5l3]
