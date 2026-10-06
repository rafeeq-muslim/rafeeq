import re
head=open('deck.html').read()
fonts='''@font-face{font-family:Plex;font-weight:400;src:url(file:///home/naser/projects/aktham/anamuslim/rafeeq/frontend/public/fonts/thmanyah/thmanyahsans-Regular.woff2) format('woff2')}
@font-face{font-family:Plex;font-weight:500;src:url(file:///home/naser/projects/aktham/anamuslim/rafeeq/frontend/public/fonts/thmanyah/thmanyahsans-Medium.woff2) format('woff2')}
@font-face{font-family:Plex;font-weight:600;src:url(file:///home/naser/projects/aktham/anamuslim/rafeeq/frontend/public/fonts/thmanyah/thmanyahsans-Medium.woff2) format('woff2')}
@font-face{font-family:Plex;font-weight:700;src:url(file:///home/naser/projects/aktham/anamuslim/rafeeq/frontend/public/fonts/thmanyah/thmanyahsans-Bold.woff2) format('woff2')}
@font-face{font-family:Disp;font-weight:500;src:url(file:///home/naser/projects/aktham/anamuslim/rafeeq/frontend/public/fonts/thmanyah/thmanyahserifdisplay-Medium.woff2) format('woff2')}
@font-face{font-family:Disp;font-weight:700;src:url(file:///home/naser/projects/aktham/anamuslim/rafeeq/frontend/public/fonts/thmanyah/thmanyahserifdisplay-Bold.woff2) format('woff2')}
'''
CSS=fonts+'''
:root{--ink:#1d1645;--deep:#3b2d99;--violet:#5a48d6;--lav:#7a5ce0;--orchid:#c47ad0;--apricot:#ffc77d;--amber:#f5a23a;--dawn:#f08a4b;--mist:#f7f6fb;--line:#e4e1f2;--muted:#55517a;--t2:#46425f;--v50:#f4f2ff;--v100:#ece9ff;--v200:#d6d0ff;--ok:#157249;--okbg:#e3f4ec}
@page{size:1920px 1080px;margin:0}
*{box-sizing:border-box;margin:0;padding:0}
html,body{font-family:Plex,sans-serif;color:var(--ink);background:#fff}
.s{width:1920px;height:1080px;position:relative;overflow:hidden;break-after:page;padding:84px 110px 90px;background:var(--mist)}
.s:before{content:"";position:absolute;left:-260px;bottom:-300px;width:760px;height:760px;background:url(assets/flower.svg) center/contain no-repeat;opacity:.07}
.s.n{background:radial-gradient(1200px 700px at 12% 110%,#7a5ce0 0%,rgba(122,92,224,0) 60%),radial-gradient(900px 600px at 95% -10%,#3b2d99 0%,rgba(59,45,153,0) 65%),linear-gradient(160deg,#1d1645 0%,#2c2275 100%);color:#fff}
.s.n:before{left:-180px;bottom:-220px;width:900px;height:900px;opacity:.22}
.s.n:after{content:"";position:absolute;inset:0;background-image:radial-gradient(2px 2px at 12% 18%,#fff 50%,transparent 51%),radial-gradient(2px 2px at 31% 9%,#ffd38f 50%,transparent 51%),radial-gradient(1.5px 1.5px at 47% 22%,#fff 50%,transparent 51%),radial-gradient(2px 2px at 63% 12%,#fff 50%,transparent 51%),radial-gradient(1.5px 1.5px at 78% 27%,#ffd38f 50%,transparent 51%),radial-gradient(2px 2px at 88% 8%,#fff 50%,transparent 51%),radial-gradient(1.5px 1.5px at 22% 38%,#fff 50%,transparent 51%),radial-gradient(1.5px 1.5px at 70% 44%,#fff 50%,transparent 51%),radial-gradient(2px 2px at 55% 62%,#fff 50%,transparent 51%),radial-gradient(1.5px 1.5px at 92% 58%,#ffd38f 50%,transparent 51%);opacity:.55;pointer-events:none}
.s{display:flex;flex-direction:column;justify-content:center}
.s>*{position:relative;z-index:1}
.s>.k{align-self:flex-start}
.k{display:inline-flex;align-items:center;gap:12px;font-size:25px;font-weight:600;color:var(--violet);background:var(--v100);padding:8px 22px;border-radius:40px;margin-bottom:22px}
.n .k{background:rgba(255,255,255,.12);color:var(--apricot)}
h1{font-family:Disp,Plex,sans-serif;font-size:66px;font-weight:700;line-height:1.25;margin-bottom:16px;color:var(--ink)}
.n h1{color:#fff}
h1 em{font-style:normal;color:var(--violet)} .n h1 em{color:var(--apricot)}
.sub{font-size:30px;line-height:1.6;color:var(--t2);max-width:1500px;margin-bottom:36px}
.n .sub{color:#ece9ff}
.row{display:flex;gap:56px;align-items:center}
.col{flex:1;min-width:0}
.g{display:grid;gap:24px}.g2{grid-template-columns:1fr 1fr}.g3{grid-template-columns:repeat(3,1fr)}.g4{grid-template-columns:repeat(4,1fr)}
.c{background:#fff;border:1px solid var(--line);border-bottom:6px solid var(--v200);border-radius:28px;padding:32px 36px}
.n .c{background:rgba(255,255,255,.08);border-color:rgba(255,255,255,.16);border-bottom-color:rgba(255,199,125,.55)}
.c h3{font-size:35px;font-weight:700;margin-bottom:10px;color:var(--ink);line-height:1.35}
.n .c h3{color:#fff}
.c p,.c li{font-size:27px;line-height:1.6;color:var(--t2)}
.n .c p,.n .c li{color:#f4f2ff}
.c ul{list-style:none}
.c li{padding-right:30px;position:relative;margin-bottom:5px}
.c li:before{content:"";position:absolute;right:2px;top:17px;width:12px;height:12px;border-radius:50% 50% 50% 0;background:linear-gradient(135deg,#ffc77d,#f08a4b);transform:rotate(-45deg)}
.ic{width:62px;height:62px;border-radius:20px;background:var(--v100);display:flex;align-items:center;justify-content:center;font-size:30px;font-weight:700;color:var(--violet);margin-bottom:16px}
.n .ic{background:rgba(255,199,125,.18);color:var(--apricot)}
.big{font-size:84px;font-weight:700;line-height:1.05;direction:ltr;text-align:right;background:linear-gradient(120deg,#3b2d99,#7a5ce0 55%,#f08a4b);-webkit-background-clip:text;color:transparent;margin-bottom:8px}
.ph{width:316px;flex:none;border:10px solid var(--ink);border-radius:46px;overflow:hidden;box-shadow:0 26px 50px rgba(29,22,69,.28);background:var(--ink)}
.ph img{display:block;width:100%}
.phs{display:flex;gap:30px;align-items:flex-start}
.cap{font-size:21px;color:var(--muted);text-align:center;margin-top:12px;font-weight:600;width:316px;line-height:1.4}
.pill{display:inline-block;font-size:21px;font-weight:600;padding:6px 16px;border-radius:30px;background:var(--okbg);color:var(--ok);margin:0 0 10px 8px}
.pill.v{background:var(--v100);color:var(--violet)} .pill.a{background:#fff1dc;color:#6b3a0a}
.crit{font-size:20px;font-weight:700;padding:6px 18px;border-radius:30px;background:var(--ink);color:#ffc77d}
.n .crit{background:#ffc77d;color:#1d1645}
.flow{display:flex;align-items:stretch;gap:14px}
.st{flex:1;background:#fff;border:1px solid var(--line);border-bottom:6px solid var(--v200);border-radius:26px;padding:30px 20px;text-align:center}
.st .n1{width:56px;height:56px;border-radius:50%;background:linear-gradient(135deg,#3b2d99,#7a5ce0);color:#fff;font-weight:700;font-size:27px;display:flex;align-items:center;justify-content:center;margin:0 auto 12px}
.st h4{font-size:29px;margin-bottom:8px} .st p{font-size:23px;line-height:1.5;color:var(--t2)}
.st.h{border-bottom-color:var(--amber);background:#fff8ee}
.ltr{direction:ltr;unicode-bidi:isolate;display:inline-block}
.ft{position:absolute;bottom:34px;left:110px;right:110px;display:flex;justify-content:space-between;align-items:center;font-size:20px;color:var(--muted)}
.n .ft{color:#b4a9f5}
.ft .b{display:flex;align-items:center;gap:10px;font-weight:700;font-size:22px;color:var(--violet)} .n .ft .b{color:#fff}
.ft .b img{height:34px}
table{width:100%;border-collapse:separate;border-spacing:0;background:#fff;border-radius:24px;overflow:hidden;border:1px solid var(--line);font-size:25px}
th{background:var(--v100);color:var(--ink);font-weight:700;text-align:right;padding:15px 22px}
td{padding:17px 22px;border-top:1px solid var(--line);line-height:1.5;color:var(--t2);vertical-align:top} td b{color:var(--ink)}
.panel{background:#fff;border:1px solid var(--line);border-radius:28px;overflow:hidden;border-bottom:6px solid var(--v200)}
.panel .bar{background:linear-gradient(120deg,#3b2d99,#7a5ce0 60%,#c47ad0);color:#fff;font-size:27px;font-weight:700;padding:18px 28px;display:flex;justify-content:space-between;align-items:center}
.panel .bar span{font-size:19px;font-weight:500;background:rgba(255,255,255,.18);padding:4px 14px;border-radius:20px}
.panel .rw{display:flex;gap:16px;align-items:flex-start;padding:19px 28px;border-top:1px solid var(--line);font-size:25px;line-height:1.5;color:var(--t2)}
.panel .rw b{color:var(--ink);flex:none;width:250px}
'''
out=[]
def S(body,night=False): out.append(('n' if night else '',body))
def ph(f,cap): return f'<div><div class="ph"><img src="../../screenshots/{f}"></div><div class="cap">{cap}</div></div>'
def card(t,p=None,li=None,ic=None):
    h=f'<div class="ic">{ic}</div>' if ic else ''
    b=f'<p>{p}</p>' if p else ''
    l='<ul>'+''.join(f'<li>{x}</li>' for x in li)+'</ul>' if li else ''
    return f'<div class="c">{h}<h3>{t}</h3>{b}{l}</div>'
def std(k,h,sub,body): return f'<div class="k">{k}</div><h1>{h}</h1><p class="sub">{sub}</p>{body}'

# 1 cover
S('''<img src="assets/logos-light.png" style="position:absolute;top:60px;left:110px;height:64px;opacity:.9">
<div style="display:flex;align-items:center;gap:90px;height:100%;padding-bottom:40px">
 <div style="flex:1">
  <div class="k">المسار الثالث · التجارب التفاعلية والرحلة المعرفية للتعريف بالإسلام وتعلّمه</div>
  <div style="font-family:Disp;font-size:230px;font-weight:700;line-height:1.15">رفيق</div>
  <div style="font-size:52px;font-weight:600;margin-top:18px;color:#ffc77d">لست وحدك في سنتك الأولى</div>
  <div style="font-size:33px;line-height:1.65;margin-top:22px;color:#e3deff;max-width:980px">رفيق المسلم الجديد: يعلّمه دينه بلغته خطوة خطوة، ويجيبه من مصادر معتمدة، ويصله بإنسان متى احتاج.</div>
  <div style="margin-top:44px;display:flex;gap:16px;font-size:27px;font-weight:600"><span class="ltr" style="background:#ffc77d;color:#1d1645;padding:12px 30px;border-radius:40px">rafeeq.nan.sa/app</span><span style="border:2px solid rgba(255,255,255,.35);padding:10px 28px;border-radius:40px">العربية · English · Tagalog</span></div>
 </div>
 <div style="flex:none;width:560px;height:560px;border-radius:50%;background:radial-gradient(circle,rgba(255,211,143,.28),rgba(255,211,143,0) 68%);display:flex;align-items:center;justify-content:center"><img src="assets/flower.svg" style="width:430px;filter:drop-shadow(0 0 60px rgba(255,199,125,.45)) brightness(1.5)"></div>
</div>''',True)
S(std('كيف تقرأ هذا العرض','ستة معايير، و<em>لكل معيار دليله</em>','رتّبنا العرض على معايير التحدي الستة بأوزانها. في أسفل كل شريحة المعيار الذي تخدمه، وفي آخر العرض جدول يجمع الأدلة.',
'<div class="g g3">'+''.join(f'<div class="c"><div class="big" style="font-size:70px">{w}</div><h3>{t}</h3><p>{d}</p></div>' for w,t,d in [('25%','وضوح المشكلة وملاءمتها للمسار والجمهور','مشكلة موثّقة بأرقام، وجمهور محدد، ومنتج مبني على حاجاته.'),('20%','الموثوقية والسلامة العلمية','مصادر معتمدة، ومدقق، ومكتب مراجعة شرعية، ولا فتوى من النموذج.'),('15%','توظيف الذكاء الاصطناعي وقيمته','ذكاء مقيَّد بالمصادر يؤدي مهام محددة تتحسن بوجوده.'),('15%','قابلية التنفيذ','مبني ومنشور ويعمل: رابط حي، ومستودع، وفيديو.'),('15%','الأصالة والقيمة المضافة','مسار ومساعد وإنسان وأدوات يومية في تطبيق واحد.'),('10%','القدرة على التنفيذ وتغطية المهام','فريق من أربعة يغطي المنصة والتصميم والتعلّم والمعرفة.')])+'</div>'))

# 2 problem
S(std('المشكلة','يدخلون الإسلام بالآلاف، ثم <em>يُتركون وحدهم</em>','السنة الأولى أصعب السنوات: المحتوى الموثوق أغلبه بالعربية، وما بلغاتهم متفرّق ومتضارب، والمتابعة بعد يوم الإسلام ضعيفة.',
'<div class="g g4">'+''.join(f'<div class="c"><div class="big">{a}</div><p>{b}</p></div>' for a,b in [('347,646','مسلمًا جديدًا في المملكة بين 2019 و2023، منهم 163,319 في 2023 وحده'),('43%','أصبحوا وحيدين بعد أن أعلنوا إسلامهم لمن حولهم'),('54%','لم يجدوا أجوبة عن أسئلتهم، وتلقّى مثلهم معلومات خاطئة'),('38%','فقط وجدوا الإنترنت مفيدًا، مع أنه ثاني أكثر ما يلجؤون إليه')])+'</div><p style="font-size:20px;color:var(--muted);margin-top:26px">المصادر: وزارة الشؤون الإسلامية (واس، يناير 2024)؛ استبانة مركز أصول على 114 مسلمًا جديدًا (2015).</p>'))
# 3 personas
S(std('لمن صُنع رفيق','ثلاثة وجوه نراها في كل قرار','كل شاشة في رفيق جاءت من حاجة واحد منهم: لغة، أو وقت ضيق، أو خوف من أن يُكشف.',
'<div class="g g3">'+card('جوزيف','عامل وافد أسلم قبل أسابيع. لغته التاغالوغية، ووقته ورصيد جواله محدودان. يحتاج دروسًا قصيرة بلغته تعمل دون اتصال.',ic='ج')+card('دانيال','أسلم عبر الإنترنت ولا يعرف مسلمًا في مدينته. يحتاج إجابة يثق بمصدرها، وإنسانًا يسأله حين لا تكفي الشاشة.',ic='د')+card('ليلى','أسلمت وتخفي إسلامها عن أسرتها. تحتاج تطبيقًا لا يكشفها: وضعًا خفيًا، وخروجًا سريعًا، وطريقًا آمنًا إلى من يعينها.',ic='ل')+'</div>'))
# 4 solution
S(std('الحل','رفيق: <em>مسار، ومساعد، وإنسان</em> في تطبيق واحد','تطبيق ويب يُثبَّت على أي جوال دون متجر، يعمل دون حساب ودون اتصال، بالعربية والإنجليزية والتاغالوغية.',
'<div class="g g4">'+card('يتعلّم','مسار متدرّج من دروس قصيرة وتمارين، يبدأ من الشهادتين والوضوء والصلاة.',ic='١')+card('يسأل','مساعد يجيب من المصادر المعتمدة وحدها، ويعرض مصدر كل إجابة.',ic='٢')+card('يُرافَق','زر «أريد إنسانًا» في كل شاشة، يصله بمرشد من جنسه وبلغته.',ic='٣')+card('يعيش يومه','مواقيت الصلاة والقبلة والأذكار والقرآن، محسوبة ومحفوظة على جهازه.',ic='٤')+'</div>'),True)
# 5 journey
steps=[('ترحيب','يختار لغته، ويبدأ دون حساب ودون أي سؤال شخصي'),('مسار متدرّج','الخطوة التالية أمامه دائمًا، ودرس في دقائق'),('تمرين و«لماذا؟»','الخطأ آمن، وشرح سببه بلغته من النص المعتمد'),('مراجعة تكيّفية','يعود إليه ما لم يتقنه، بعد أيام ثم أسابيع'),('سؤال','يسأل بلغته في أي لحظة'),('إجابة موثّقة أو إنسان','إجابة بمصدرها، أو طريق مباشر إلى مرشد')]
S(std('آلية العمل','رحلة واحدة من أول فتح إلى المتابعة','كل خطوة تقود إلى التي بعدها، والإنسان حاضر في كل مرحلة.',
'<div class="flow">'+''.join(f'<div class="st{" h" if i==5 else ""}"><div class="n1">{i+1}</div><h4>{a}</h4><p>{b}</p></div>' for i,(a,b) in enumerate(steps))+'</div><div class="g g3" style="margin-top:28px">'+card('يعمل دون اتصال','ما فتحه من المسار يبقى معه، ومعه المواقيت والأذكار.')+card('الحساب اختياري','يُعرض بهدوء بعد أول درس، وينتقل إليه تقدّمه.')+card('الخطر أولًا','ما يدل على خطر يصل إلى إنسان فورًا، قبل أي نموذج.')+'</div>'))
# 6 learner 1
S('<div class="row"><div class="col">'+std('المتعلّم · المسار','يعرف دائمًا <em>ما خطوته التالية</em>','رئيسية مرتّبة تضع الدرس القادم أولًا، ثم ما يحتاجه في يومه.','<div class="g g2">'+card('مسار من وحدات ودروس',li=['ست وحدات وخمسة وعشرون درسًا','يبدأ بالشهادتين ثم الوضوء والصلاة','درس قصير يُنجز في دقائق'])+card('يبدأ من مستواه',li=['اختبار تحديد مستوى اختياري','يفتح له الوحدة المناسبة','لا يعيد ما يعرفه'])+card('مراجعة تتكيّف معه',li=['تختار أضعف أهدافه','تعود بعد 7 أيام ثم 30 يومًا','جلسة قصيرة متى شاء'])+card('رئيسية تُرتَّب له',li=['الخطوة التالية أولًا','«يومي»: الصلاة والأذكار والقرآن','بطاقة اليوم واسأل رفيق'])+'</div>')+'</div><div class="phs">'+ph('02-welcome.png','البداية: اللغة وحدها')+ph('03-home.png','الرئيسية المرتّبة')+'</div></div>')
# 7 learner 2
S('<div class="row"><div class="col">'+std('المتعلّم · الدرس','يتعلّم بالفعل، و<em>الخطأ آمن</em>','بطاقات قصيرة ثم تمارين، وكل نص شرعي بلفظه ومعناه ومصدره.','<div class="g g2">'+card('بطاقات الآيات',li=['الآية بخط المصحف','معناها بلغته من ترجمة معتمدة','تلاوتها بضغطة'])+card('ثلاثة أنواع من التمارين',li=['بعد كل مجموعة بطاقات','يرى الصواب وسببه','السؤال الخاطئ يعود لاحقًا'])+card('«لماذا؟»',li=['شرح بلغته لسبب خطئه','من نص البطاقة المعتمدة وحده','يُفحص قبل أن يُعرض'])+card('الموجّه التعليمي',li=['رسالة قصيرة بعد كل درس','ما أتقنه وما يراجعه','وخطوته التالية'])+'</div>')+'</div><div class="phs">'+ph('lesson-02.png','آية بمعناها وتلاوتها')+ph('lesson-05.png','تمرين بعد البطاقات')+'</div></div>')
S(std('المتعلّم · التفاصيل الصغيرة','تفاصيل صغيرة <em>تصنع الفرق</em>','ما يجعل التعلّم في رفيق لطيفًا ودقيقًا: كل تفصيل له سبب تربوي.',
'<div class="g g3">'+card('اختبار تحديد المستوى',li=['ستة أسئلة على الأكثر','يتوقف حين يعرف مستواه','يتخطاه من شاء'])+card('شاشة الخطأ',li=['تُبقي إجابته أمامه','وتعلّم الإجابة الصحيحة','ثم يعود السؤال بترتيب جديد'])+card('إتقان الأهداف',li=['لكل درس أهداف تعلّمية','يتابع رفيق إتقان كل هدف','والمراجعة تبدأ بأضعفها بعد الانقطاع'])+card('يكمل من حيث توقف',li=['يعود إلى النقطة نفسها في الدرس','الدرس يكتمل دون اتصال','وإتمامه يُرسل حين يعود الاتصال'])+card('الجزء المقتبس من الآية',li=['يُبرز الجزء المستشهد به','والآية كاملة بنصها من قاعدة البيانات','ومعها تلاوتها ومعناها'])+card('احتفال بالإنجاز',li=['شاشة احتفال عند إتمام الدرس والوحدة','وسام الوحدة باسمها','وبتلة جديدة في زهرته'])+'</div>'))

# 8 assistant
S('<div class="row"><div class="col">'+std('اسأل رفيق','إجابة <em>معها مصدرها</em>، أو طريق إلى إنسان','يسأل بلغته، فيجيبه المساعد مما في المصادر المعتمدة، ويريه من أين جاءت كل جملة.','<div class="g g2">'+card('من المصادر وحدها',li=['بطاقة مصدر مع كل إجابة','نص الآية والحديث من قاعدة البيانات','لا يكتب النموذج نصًّا شرعيًّا'])+card('بحث حي',li=['في مواقع الفتوى المعتمدة','حين يحتاج السؤال أكثر من المفهرس','ويذكر أين بحث'])+card('إجابات معتمدة',li=['للأسئلة الشائعة','راجعها المراجع الشرعي','تظهر فورًا بثلاث لغات'])+card('يعرف حدّه',li=['المسألة الشخصية تُحال إلى أهل العلم','الخلافية تُعرض أقوالها دون ترجيح','الخطر يصل إلى إنسان فورًا'])+'</div>')+'</div><div class="phs">'+ph('landing-answers.png','كل إجابة معها مصدرها')+ph('10-library.png','المكتبة والبحث في المصادر')+'</div></div>')
S(std('اسأل رفيق · ما بعد الإجابة','الإجابة <em>بداية</em>، لا نهاية','رفيق يحوّل السؤال إلى تعلّم، ويبقي ما ينفع المتعلّم في يده.',
'<div class="g g3">'+card('تمرين سريع بعد الإجابة',li=['بإذن المتعلّم','تمرين قصير عمّا سأل عنه','فيثبت ما فهمه'])+card('إجابات البداية',li=['أسئلة شائعة جاهزة','اعتمدها المراجع الشرعي','بثلاث لغات'])+card('الإجابات المحفوظة',li=['يحفظ الإجابة بمصادرها','ويحفظ الآية والحديث','تُقرأ دون اتصال'])+card('لوحة الخطر',li=['تظهر قبل أي نموذج','أرقام الطوارئ الرسمية في بلده','وطلب عاجل إلى إنسان'])+card('«أتحتاج إنسانًا؟» من الدرس',li=['زر في كل درس','يصله بمرشد','دون أن يغادر مكانه'])+card('بطاقة اليوم والاستماع',li=['آية أو حديث قصير كل يوم','قرّاء عدة، والآية المتلوّة تُبرز','ضغطة على آية تبدأ منها'])+'</div>'))

# 9 AI pipeline
pipe=[('فحص الخطر','عبارات معتمدة بثلاث لغات، قبل أي نموذج'),('الموجّه','يصنّف السؤال: عام، شخصي، خلافي، خارج النطاق'),('الاسترجاع','بحث دلالي ونصي في المصادر المعتمدة بلغة السائل'),('المؤلف','يصوغ الإجابة من المقاطع وحدها، ويترك مكان الآية والحديث'),('المدقق','سبعة فحوص آلية، ثم مطابقة كل جملة بمصدرها'),('العرض','النص الشرعي من قاعدة البيانات، مع بطاقة المصدر')]
S(std('الذكاء الاصطناعي · كيف يجيب','ست مراحل، وكل مرحلة <em>تستطيع أن توقف الإجابة</em>','الذكاء الاصطناعي في رفيق مقيَّد بالمصادر: يسترجع ثم يصوغ ثم يُدقَّق، وما لا يجتاز لا يُعرض.',
'<div class="flow">'+''.join(f'<div class="st{" h" if i in (0,4) else ""}"><div class="n1">{i+1}</div><h4>{a}</h4><p>{b}</p></div>' for i,(a,b) in enumerate(pipe))+'</div><div class="g g3" style="margin-top:28px">'+card('Gemma','نماذج Google المفتوحة، عبر OpenRouter: للتصنيف وصياغة الإجابة وتدقيقها.',ic='G')+card('DeepSeek','نموذج احتياطي يتولّى العمل تلقائيًا، فتستمر الخدمة.',ic='D')+card('BGE-M3','نموذج بحث متعدد اللغات يجد المقطع المناسب بالعربية والإنجليزية والتاغالوغية.',ic='B')+'</div>'))
# 10 AI in learning
S(std('الذكاء الاصطناعي · في التعلّم','ذكاء يخدم المتعلّم، و<em>لا يعرف من هو</em>','مهام صغيرة محددة، لكل منها مدخل محدود وفاحص، ولا يدخل اسم ولا هوية في أي طلب.',
'<div class="g g4">'+card('«لماذا؟»','يشرح سبب الخطأ بلغة المتعلّم من البطاقة المعتمدة، ونموذج ثانٍ يتأكد أنه لم يزد عليها.',ic='؟')+card('الموجّه التعليمي','من ملخّص تعلّم بلا هوية، يقول له ما أتقنه وما يراجعه وما يتعلّمه الآن.',ic='←')+card('ترتيب الرئيسية','يرتّب مكوّنات الرئيسية بحسب تقدّمه ووقت يومه، مرة في اليوم.',ic='⌂')+card('من السؤال إلى الدرس','بإذنه، يربط سؤاله بهدف تعلّمي، فيقترح عليه الدرس المناسب.',ic='↗')+'</div><div class="g g3" style="margin-top:24px">'+card('بلا هوية','لا اسم ولا معرّف ولا سجل محادثة في طلبات النماذج.')+card('نص المستخدم بيانات','يُعامل سؤاله مادةً تُحلَّل، لا تعليمات تُنفَّذ.')+card('تكلفة مضبوطة','قرابة $0.0015 للإجابة، وسقف إنفاق يومي يحمي الميزانية.')+'</div>'),True)
S(std('الموثوقية والسلامة العلمية','ست ضمانات <em>لا يتجاوزها النموذج</em>','الموثوقية في رفيق بنية في المنتج، لا وعد في العرض.',
'<div class="g g3">'+card('الإسناد إلى المصدر','كل إجابة تُصاغ من مقاطع معتمدة مسترجعة، وتُعرض معها بطاقات مصادرها.',ic='١')+card('المدقق','سبعة فحوص آلية، ثم مطابقة كل جملة بمصدرها. ما لا يجتاز لا يُعرض.',ic='٢')+card('النص الشرعي لا يُولَّد','الآية والحديث يُعرضان من قاعدة البيانات بمعرّفهما، ولا يكتبهما نموذج.',ic='٣')+card('لا فتوى من النموذج','المسألة الشخصية تُحال إلى أهل العلم، والخلافية تُعرض أقوالها دون ترجيح.',ic='٤')+card('الخطر إلى إنسان','عبارات الخطر تُكتشف قبل أي نموذج، فتظهر أرقام الطوارئ ويصل الطلب إلى الفريق.',ic='٥')+card('مراجعة شرعية واختبارات','مكتب مراجع شرعي يعتمد المحتوى، وأكثر من 1,100 اختبار آلي يحرس القواعد.',ic='٦')+'</div>'),True)

# 11 companion
S(std('المرافقة البشرية','«أريد إنسانًا»: <em>زر في كل شاشة</em>','رفيق لا يترك المسلم الجديد مع شاشة. الإنسان جزء من المنتج، لا خدمة جانبية.',
'<div class="g g3">'+card('إنسان من جنسه وبلغته',li=['يختار موضوع طلبه','يصل إلى مرشد من جنسه','أو يختار مرشده بنفسه'])+card('مجموعات صغيرة',li=['رفقة بلغته','تحديات تعلّم جماعية','بإشراف مرشد'])+card('إحالة إلى أهل العلم',li=['للمسألة الشخصية','يتابعها المراجع الشرعي','ويعود الجواب إليه'])+card('أمان المحادثة',li=['لا تبادل لبيانات الاتصال','تبليغ وحظر بضغطة','من شاء تقدّم ليكون مرشدًا'])+card('في الخطر',li=['أرقام الطوارئ الرسمية في بلده','تظهر حتى دون اتصال','وطلب عاجل إلى الفريق'])+card('دفتر خاص',li=['يكتب فيه لنفسه','لا يراه مرشد ولا فريق','يبقى على جهازه'])+'</div>'))
# 12 daily
S('<div class="row"><div class="col">'+std('يومي','عبادته اليومية، <em>محسوبة على جهازه</em>','أدوات المسلم في يومه، بلا إعلانات ولا حساب، وموقعه لا يغادر الجهاز.','<div class="g g2">'+card('مواقيت الصلاة والقبلة',li=['تُحسب على الجهاز من مدينته','قبلة حيّة ترشده كيف يستدير','تذكير محايد يختاره'])+card('الأذكار',li=['الصباح والمساء وبعد الصلاة والنوم','تُعرض بحسب وقته','بنصها ومعناها ومصدرها'])+card('القرآن والمكتبة',li=['استماع بعدة قرّاء، آيةً آيةً','الآية المتلوّة تُبرز أمامه','كتب ومقاطع معتمدة للمسلم الجديد'])+card('التقويم والعادات',li=['التاريخ الهجري والمناسبات','وضع رمضان','عادات يتابعها لنفسه'])+'</div>')+'</div><div class="phs">'+ph('07-practice.png','مواقيت اليوم')+ph('08-adhkar.png','أذكار الصباح والمساء')+'</div></div>')
# 13 motivation
S(std('التحفيز','يحفّز على التعلّم، و<em>لا يضع نقاطًا على العبادة</em>','قرار شرعي وتربوي في أصل المنتج: العبادة بين العبد وربه، والتحفيز للتعلّم وحده.',
'<div class="g g3">'+card('أيام التعلّم','سلسلة متسامحة: تتوقف عند الانقطاع ولا تلوم، وتكمل حين يعود.',ic='✦')+card('الأوسمة','وسام لكل وحدة يتمّها، وأوسمة المداومة عند 7 و30 و66 يوم تعلّم.',ic='★')+card('زهرة تكتمل','زهرته تكسب بتلة مع كل وحدة ينهيها، حتى تكتمل.',ic='❀')+card('شاشات الاحتفال','لحظة فرح عند إتمام الدرس والوحدة ونيل الوسام.',ic='◆')+card('تحديات المجموعة','يضعها المرشد لمجموعته، وهدفها تعلّم مشترك لا سباق.',ic='∞')+card('التذكير اللطيف','في الوقت الذي يختاره المتعلّم، بنص محايد لا يذكر الدين.',ic='◔')+'</div>'),True)
# 14 privacy
S('<div class="row"><div class="col">'+std('الخصوصية والأمان','مصمّم لمن <em>يخفي إسلامه</em>','المعتقد الديني بيانات حساسة، فنجمع أقل القليل، ونضع التحكم في يد صاحبه.','<div class="g g2">'+card('بلا حساب',li=['كل التعلّم والأسئلة دون تسجيل','الحساب اسم مستعار وكلمة مرور','لا رقم جوال ولا اسم حقيقي'])+card('الوضع الخفي',li=['عنوان الصفحة يصبح «Notes»','إشعارات بلا اسم رفيق ولا كلمة دينية','زر خروج سريع في كل شاشة'])+card('بياناته له',li=['نسخة من بياناته بضغطة','تسجيل الخروج يمسح الجهاز','سياسة خصوصية بلغته قبل أي بيان'])+card('ما لا نفعله',li=['لا أدوات تتبّع ولا إعلانات','الموقع لا يغادر الجهاز','لا هوية في طلبات الذكاء الاصطناعي'])+'</div>')+'</div><div class="phs">'+ph('11b-me-discreet.png','الإشعارات والخصوصية')+ph('11-me.png','حسابي: زائر بلا حساب')+'</div></div>')
# 15 PWA
S(std('تطبيق بلا متجر','يُثبَّت بضغطة، و<em>يعمل دون اتصال</em>','تطبيق ويب تقدّمي: يفتح من الرابط على أي جوال أو حاسوب، ويصير تطبيقًا على الشاشة الرئيسية.',
'<div class="g g4">'+card('خفيف','واجهة المتعلّم كلها أقل من ميغابايت واحد مضغوطة، والصوت والفيديو عند التشغيل فقط.',ic='↓')+card('دون اتصال','يفتح في وضع الطيران: دروسه، والمواقيت، والأذكار، وما حفظه.',ic='⌁')+card('مركز التنزيلات','يختار ما يبقى معه: وحدة، أو سورة، أو كتاب، ويرى حجم كل منها.',ic='▤')+card('إشعارات','على الأندرويد والآيفون، مغلقة حتى يفعّلها، ومحايدة على شاشة القفل.',ic='◉')+'</div><div class="g g3" style="margin-top:24px">'+card('ثلاث لغات','العربية والإنجليزية والتاغالوغية، ويُعرض النص العربي داخل الإنجليزي باتجاهه الصحيح.')+card('دعوة هادئة إلى التثبيت','بطاقة في الرئيسية ومدخل في «حسابي»، بطريقة تناسب كل متصفح.')+card('مظهره كما يحب','فاتح أو داكن أو بحسب الجهاز، ورئيسية يرتّبها الذكاء الاصطناعي.')+'</div>'))
# 16 behind 1
def panel(t,tag,rows): return f'<div class="panel"><div class="bar">{t}<span>{tag}</span></div>'+''.join(f'<div class="rw"><b>{a}</b><div>{b}</div></div>' for a,b in rows)+'</div>'
S(std('خلف الستار · 1 من 2','لكل من يخدم المسلم الجديد <em>لوحته</em>','رفيق منظومة كاملة، لا واجهة متعلّم فقط.',
'<div class="g g2">'+panel('لوحة المرشد','متطوع',[('صندوق الطلبات','طلبات «أريد إنسانًا» بلغته ومن جنسه، يقبلها ويرد'),('من يرشدهم','محادثاتهم، وتقدّم من أذن له برؤية تقدّمه وأوسمته'),('المجموعات','ينشئ مجموعته ويدير تحدياتها'),('التوفر والحد','أوقات توفره، وحد أعلى لعدد من يرشدهم'),('قواعد المرشد','يقرّ بها قبل أول محادثة')])+panel('مكتب المراجع الشرعي','مراجع',[('اعتماد المحتوى','الدروس والبطاقات والإجابات الجاهزة: يعتمدها أو يعيدها'),('عينات القرّاء','يستمع إلى كل قارئ قبل إتاحته'),('شروح «لماذا؟»','يراجع عينات مما كتبه النموذج'),('نصوص التحديات','يعتمد نصوص التحديات الجماعية'),('المسائل المحالة','يجيب عمّا أحاله المساعد إلى أهل العلم')])+'</div>'))
# 17 behind 2
S(std('خلف الستار · 2 من 2','إدارة تعرف الأثر، <em>ولا تعرف الأشخاص</em>','مؤشرات مجمّعة بلا هوية، وصلاحيات محددة لكل دور.',
'<div class="g g2">'+panel('الفريق والإدارة','فريق رفيق',[('المؤشرات','التعلّم والأسئلة والعودة، مجمّعة دون هوية'),('طابور البلاغات','بلاغات المحادثات والطلبات العاجلة'),('التغطية','أين يتوفر مرشدون، وبأي لغة ولأي جنس'),('المستخدمون','الأدوار ورموز الدعوة'),('ترائي الأهلة','متابعة بدايات الأشهر الهجرية')])+panel('منسّق الجهة الدعوية','مكتب دعوي',[('رموز الانضمام','رمز ورابط وQR لكل لغة، باسم الجهة'),('مرشدو الجهة','يعتمدهم ويدير توفرهم'),('لوحة مجمّعة','نشاط منسوبي الجهة، بلا بيانات فردية'),('الخصوصية','المتعلّم يفك ارتباطه بالجهة متى شاء')])+'</div>'))
# 18 sources
S(std('الموثوقية والمصادر','كل نص له <em>مصدر وترخيص ومراجع</em>','سجل واحد في المستودع يوثّق كل مصدر: ما نأخذه منه، وكيف، وبأي ترخيص.',
'<div class="row" style="gap:30px"><div class="col"><table><tr><th>المصدر</th><th>ما نأخذه</th></tr><tr><td><b>QuranEnc</b></td><td>نص القرآن وترجمات معانيه المعتمدة</td></tr><tr><td><b>HadeethEnc</b></td><td>الأحاديث بدرجتها وشرحها</td></tr><tr><td><b>IslamHouse</b></td><td>كتب ومقاطع المسلم الجديد، والتلاوات</td></tr><tr><td><b>Quranpedia</b></td><td>تلاوات القرّاء آيةً آيةً</td></tr><tr><td><b>موقع ابن باز · الإسلام سؤال وجواب</b></td><td>فتاوى وإجابات</td></tr></table></div><div class="col"><table><tr><th>الحالة</th><th>ما يفعله رفيق</th></tr><tr><td><b>لا مصدر كافٍ</b></td><td>يقول ذلك، ويقترح مرشدًا</td></tr><tr><td><b>مسألة شخصية</b></td><td>يحيلها إلى أهل العلم</td></tr><tr><td><b>مسألة خلافية</b></td><td>يعرض الأقوال دون ترجيح</td></tr><tr><td><b>خطر على السائل</b></td><td>إنسان وأرقام طوارئ فورًا</td></tr><tr><td><b>نص قرآن أو حديث</b></td><td>من قاعدة البيانات، لا من النموذج</td></tr></table></div></div>'))
# 19 architecture + results
S(std('التقنيات والنتائج','بنية بسيطة، و<em>أرقام من التشغيل الفعلي</em>','كل تحديث يمر بالاختبارات ثم يُنشر تلقائيًا، مع فحص صحة وتراجع آلي.',
'<div class="g g4">'+card('الواجهة','React و TypeScript، تطبيق ويب تقدّمي يعمل دون اتصال، بنظام تصميم خاص.',ic='◧')+card('الخادم','FastAPI: مسار السؤال والتحقق، والتعلّم، والمرافقة.',ic='⚙')+card('البيانات','PostgreSQL و pgvector: المقاطع المعتمدة وفهرسها الدلالي.',ic='▦')+card('النماذج','Gemma و DeepSeek و BGE-M3 عبر OpenRouter.',ic='✧')+'</div><div class="g g4" style="margin-top:24px">'+''.join(f'<div class="c"><div class="big" style="font-size:66px">{a}</div><p>{b}</p></div>' for a,b in [('14/14','سؤالًا عربيًا أُجيب من المصادر في الموقع الحي'),('9/9','تصنيف صحيح لنوع السؤال في اختبار الموجّه'),('$0.0015','تكلفة الإجابة الواحدة، في 9 إلى 15 ثانية'),('+1,100','اختبار آلي ناجح يحرس القواعد')])+'</div>'))
# 20 impact
S(std('القيمة المضافة والاستمرار','ما يجمعه رفيق <em>لا يجتمع في غيره</em>','مسار تعلّمي، ومساعد موثّق، ومرشد بشري، وأدوات يومية، بثلاث لغات، في تطبيق واحد.',
'<div class="g g3">'+card('مقابل محادثة ذكاء اصطناعي عامة','مصدر معروف لكل جملة، ونص شرعي لا يكتبه نموذج، وإنسان عند الحاجة.')+card('مقابل الكتيّبات والمواقع','تدرّج يعرف مستواه، ومراجعة تتكيّف معه، وبلغته.')+card('مقابل وسائل التواصل','محتوى معتمد، ومرشد موثوق من جنسه، وخصوصية تحميه.')+card('لغات جديدة','المصادر المعتمدة تتيح عشرات اللغات، والبنية نفسها تستقبلها.')+card('عبر الجهات الدعوية','كل مكتب دعوي ينضم برمز، ويدير مرشديه، ويرى أثره.')+card('تشغيل قليل الكلفة','خادم واحد، وأقل من سنت للإجابة، ومراجعة شرعية داخل المنتج.')+'</div>'),True)
S(std('قابلية التنفيذ','ليس خطة: <em>مبني، ومنشور، ويعمل</em>','كل ما في هذا العرض موجود في الموقع الحي اليوم، وبُني في أيام التحدي.',
'<div class="g g4">'+''.join(f'<div class="c"><div class="big" style="font-size:66px">{a}</div><p>{b}</p></div>' for a,b in [('6 · 25','وحدات ودروس منشورة بثلاث لغات'),('+1,100','اختبار آلي ناجح'),('4','أدوار لها لوحاتها: مرشد، ومراجع، وفريق، وجهة'),('3','لغات كاملة: العربية والإنجليزية والتاغالوغية')])+'</div><div class="g g3" style="margin-top:24px">'+card('الرابط الحي','<span class="ltr">rafeeq.nan.sa/app</span> يفتح دون حساب، على الجوال والحاسوب.')+card('المستودع','<span class="ltr">github.com/rafeeq-muslim/rafeeq</span> بوثائق الميزات والمصادر والتشغيل.')+card('الفيديو','<span class="ltr">youtube.com/shorts/NN3KVPgEf-4</span> في أقل من دقيقتين.')+'</div>'))
S(std('القدرة على التنفيذ','فريق من أربعة <em>يغطي كل مهمة</em>','لكل مجال في رفيق مالك مسؤول عن قواعده ومحتواه وتنفيذه.',
'<div class="g g4">'+card('ناصر بن عبدالعزيز العويمر',li=['مالك المنتج والمنصة','الحسابات والخصوصية والإشعارات','البنية والنشر'],ic='ن')+card('ناصر بن خالد العويمر',li=['نظام التصميم وهوية رفيق','الممارسة اليومية','الرئيسية المرتّبة ودليل رفيق'],ic='ن')+card('مهند بن صالح الفوزان',li=['المسار التعلّمي والدروس','التحفيز والأوسمة','المراجعة والإتقان'],ic='م')+card('مسلّم بن عبدالعزيز العمير',li=['المعرفة والأسئلة','المصادر والاستماع والمكتبة','جودة الإجابات'],ic='م')+'</div>'))
S(std('المعايير وأدلتها','كل معيار، و<em>أين تجد دليله</em>','جدول واحد للجنة: المعيار ووزنه وما يثبته في رفيق.',
'<table><tr><th style="width:8%">الوزن</th><th style="width:30%">المعيار</th><th>الدليل في رفيق</th></tr>'+''.join(f'<tr><td><b>{w}</b></td><td><b>{t}</b></td><td>{d}</td></tr>' for w,t,d in [('25%','وضوح المشكلة وملاءمتها للمسار والجمهور','أرقام موثّقة، وثلاث شخصيات، ورحلة متدرّجة من أول فتح إلى المتابعة، بلغة المستفيد.'),('20%','الموثوقية والسلامة العلمية','إسناد كل إجابة، والمدقق، ونص شرعي من قاعدة البيانات، وإحالة الخطر والمسألة الشخصية، ومكتب المراجع الشرعي.'),('15%','توظيف الذكاء الاصطناعي','مسار الإجابة بست مراحل، و«لماذا؟»، والموجّه التعليمي، وترتيب الرئيسية، بنماذج Gemma و DeepSeek و BGE-M3.'),('15%','قابلية التنفيذ','الموقع الحي، والمستودع، والفيديو، وأكثر من 1,100 اختبار آلي.'),('15%','الأصالة والقيمة المضافة','مسار ومساعد موثّق ومرشد بشري وأدوات يومية وخصوصية لمن يخفي إسلامه، في تطبيق واحد.'),('10%','القدرة على التنفيذ','فريق من أربعة، لكل مجال مالكه، وأربع لوحات أدوار مبنية.')])+'</table>'))

# 21 team + try
S('''<img src="assets/logos-light.png" style="position:absolute;top:60px;left:110px;height:56px;opacity:.9">
<div class="k">الفريق</div>
<div class="g g4" style="margin-bottom:40px">'''+''.join(f'<div class="c"><h3>{a}</h3><p>{b}</p></div>' for a,b in [('ناصر بن عبدالعزيز العويمر','المنصة'),('ناصر بن خالد العويمر','نظام التصميم والممارسة اليومية'),('مهند بن صالح الفوزان','التعلّم والتحفيز'),('مسلّم بن عبدالعزيز العمير','المعرفة والأسئلة')])+'''</div>
<h1 style="font-size:80px">جرّبه <em>الآن</em></h1>
<p class="sub" style="margin-bottom:24px">يفتح من الرابط، دون حساب ودون تثبيت.</p>
<div class="g" style="grid-template-columns:1fr .8fr 1.5fr 1.5fr">'''+''.join(f'<div class="c"><p style="color:#ffc77d;font-size:22px;font-weight:600">{a}</p><h3 class="ltr" style="font-size:25px;margin-top:6px;white-space:nowrap">{b}</h3></div>' for a,b in [('التطبيق','rafeeq.nan.sa/app'),('صفحة التعريف','rafeeq.nan.sa'),('الفيديو','youtube.com/shorts/NN3KVPgEf-4'),('الكود','github.com/rafeeq-muslim/rafeeq')])+'</div>',True)

CR=['', '', '25% · المشكلة والجمهور', '25% · المشكلة والجمهور', '25% · المشكلة والجمهور', '25% · المشكلة والجمهور', '25% · المشكلة والجمهور', '25% · المشكلة والجمهور', '25% · المشكلة والجمهور', '15% · الذكاء الاصطناعي', '15% · الذكاء الاصطناعي', '15% · الذكاء الاصطناعي', '15% · الذكاء الاصطناعي', '20% · الموثوقية', '25% · المشكلة والجمهور', '25% · المشكلة والجمهور', '15% · الأصالة', '20% · الموثوقية', '15% · قابلية التنفيذ', '20% · الموثوقية', '10% · الفريق', '20% · الموثوقية', '15% · قابلية التنفيذ', '15% · الأصالة', '15% · قابلية التنفيذ', '10% · الفريق', '', ''] ; n=len(out); html='<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>رفيق</title><style>'+CSS+'</style></head><body>\n'
for i,(cls,b) in enumerate(out):
    tg=CR[i] if i<len(CR) else ''
    ft='' if i in (0,n-1) else f'<div class="ft"><div class="b"><img src="assets/flower.svg">رفيق</div>'+(f'<span class="crit">{tg}</span>' if tg else '')+f'<span class="ltr">{i+1:02d} / {n}</span></div>'
    html+=f'<section class="s {cls}">{b}{ft}</section>\n'
html+='</body></html>'
open('deck.html','w').write(html); print(n)
