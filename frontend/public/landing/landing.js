/* =====================================================================
   Rafeeq landing: page-local behaviour. FINAL SOURCE.
   1. i18n (ar in the HTML; en and tl here)
   2. graphics generated from the logo petal (brand.tsx PETAL)
   3. the companion flower (signature move) and the sky planes
   The scrollcraft engine stays untouched; this only reads scroll.
   ===================================================================== */
(function () {
  "use strict";

  var doc = document.documentElement;
  var LANG = doc.lang || "ar";
  var RTL = LANG === "ar";
  var RM = doc.classList.contains("rm");

  /* ------------------------------------------------------------ copy --
     ⚠️ Tagalog: drafted from the app's own tl.ts vocabulary; needs review
     by a fluent Tagalog speaker before public launch (same flag as tl.ts). */
  var T = {
    ar: {
      title: "رفيق · لست وحدك في رحلتك",
      brand: "رفيق، أعلى الصفحة", langNav: "اللغة", chaptersNav: "فصول الصفحة",
      "path.n1": "الشهادتان", "path.n2": "الوضوء", "path.n3": "الصلاة الأولى", "path.start": "ابدأ",
      "mercy.paused": "متوقفة مؤقتًا"
    },
    en: {
      title: "Rafeeq · You are not alone on your journey",
      skip: "Skip to content", brand: "Rafeeq, back to top", langNav: "Language", chaptersNav: "On this page",
      "nav.learn": "Lessons", "nav.ask": "Questions", "nav.people": "People", "nav.daily": "Your day", "nav.mercy": "Keeping on",
      cta: "Start your journey",
      "hero.title": "You are not alone on your journey",
      "hero.sub": "Your first year as a Muslim, in your language: short lessons, sourced answers, and a person when you need one.",
      "hero.note": "Free. No account needed to start.",
      "hero.more": "See what Rafeeq does",
      "learn.title": "Learn your faith from the beginning, one lesson at a time",
      "learn.lead": 'The lessons come from the book <span class="book">New Muslim Guideline</span> (<span lang="ar" dir="rtl">المختصر المفيد للمسلم الجديد</span>), in Arabic, English and Tagalog, and each takes a few minutes. The first ones cover what you need on your first day: the meaning of the shahada, then wudu, then your first prayer.',
      "learn.p1": "Every lesson is checked by a Sharia reviewer before it is published.",
      "learn.p2": "If you get something wrong, you see the right answer in the lesson's own words and try again as often as you like.",
      "learn.p3": "Stop whenever you like and pick up where you left off.",
      "path.n1": "Shahada", "path.n2": "Wudu", "path.n3": "First prayer", "path.start": "Start",
      "ask.title": "Every answer comes with its source",
      "ask.lead": "Rafeeq's assistant answers in your language from approved sources only, and shows you where every answer comes from. If it can't find a source, it tells you so and offers you a person.",
      "ask.ai": "The assistant is an AI tool, always says so, and can be wrong.",
      "ask.which": "How the assistant handles your question:",
      "ask.q": "Your question",
      "ask.k0": "A general question", "ask.k1": "Scholars differ", "ask.k2": "About your own case", "ask.k3": "If you're in danger",
      "ask.o0": "An answer from approved sources, with the source named underneath.",
      "ask.o1": "It tells you scholars differ on it and does not present one view as the ruling, or it refers you to a specialist.",
      "ask.o2": "The assistant gives no ruling on your case. It shares what the sources say in general and offers you a person who can look at the details.",
      "ask.o3": "The AI does not answer. You are offered a person from our team straight away, and the emergency numbers for your country.",
      "ask.e0": "The source sits under every answer", "ask.e1": "The views as they are, not settled", "ask.e2": "A qualified person", "ask.e3": "A person, and emergency numbers",
      "people.title": "“I want a human”",
      "people.caption": "A button in every lesson, review and question.",
      "people.lead": "Tap it and a person from the Rafeeq team replies in your language: a man if you are a man, a woman if you are a woman. You don't need an account.",
      "people.mentorT": "A mentor who follows your progress",
      "people.mentor": "With an account, choose a mentor of your own gender who speaks your language. They see only the progress you allow.",
      "people.groupT": "A small group",
      "people.group": "Join with a code. Only the name you choose is shown, and progress is counted together, never who didn't finish.",
      "daily.title": "Your prayer times are worked out on your phone",
      "daily.lead": "Rafeeq works out prayer times and the qibla on your own phone, so your location never leaves it. The morning, evening and after-prayer adhkar are there too.",
      "daily.private": "Worship stays between you and Allah: whatever you track of it is private, seen by no one, and never rewarded with a badge or progress.",
      "mercy.title": "Miss a day? We'll wait for you",
      "mercy.lead": "Your learning streak pauses while you're away, and never drops back to zero. When you return, one short lesson is waiting, not a list of what you missed.",
      "mercy.remind": "Reminders come only if you ask for them: once a day at most, at the time you choose, in neutral words that give nothing away.",
      "mercy.account": "You don't need an account to begin: your progress is kept on your device. If you want to keep it in an account, a name you choose and a password are enough, with no email or phone number.",
      "mercy.paused": "Paused",
      "bloom.title": "Unit by unit, your flower grows complete",
      "bloom.lead": "Every unit you finish adds a petal to your flower, and the first one starts today.",
      "bloom.note": "Free, in Arabic, English and Tagalog.",
      "bloom.mentor": "For mentors and da'wa organisations: apply and the Rafeeq team reviews your application. If you already hold an invite code, create your account with it.",
      "bloom.mentorLink": "Apply to be a mentor",
      "foot.privacy": "No ads, no trackers."
    },
    tl: {
      title: "Rafeeq · Hindi ka nag-iisa sa iyong paglalakbay",
      skip: "Lumaktaw sa nilalaman", brand: "Rafeeq, bumalik sa itaas", langNav: "Wika", chaptersNav: "Sa pahinang ito",
      "nav.learn": "Mga aralin", "nav.ask": "Mga tanong", "nav.people": "Mga kasama", "nav.daily": "Iyong araw", "nav.mercy": "Pagpapatuloy",
      cta: "Simulan ang iyong paglalakbay",
      "hero.title": 'Hindi ka <span class="nw">nag-iisa</span> sa iyong paglalakbay',
      "hero.sub": "Ang iyong unang taon bilang Muslim, sa iyong wika: maiikling aralin, mga sagot na may sanggunian, at isang tao kapag kailangan mo.",
      "hero.note": "Libre. Hindi kailangan ng account para magsimula.",
      "hero.more": "Alamin ang Rafeeq",
      "learn.title": "Magsimula sa mga batayan, isang hakbang sa bawat pagkakataon",
      "learn.lead": 'Maiikling aralin mula sa aklat na <span class="book">Patnubay Para Sa Bagong Muslim</span>, sa Arabic, English at Tagalog. Magsisimula ka sa kailangan mo sa unang araw: ang kahulugan ng shahada, ang wudu, at ang iyong unang pagdarasal.',
      "learn.p1": "Sinusuri ng isang Sharia reviewer ang bawat aralin bago ito ilathala.",
      "learn.p2": "Ligtas magkamali: makikita mo ang tamang sagot sa mismong salita ng aralin, saka subukang muli. Walang puso, walang subok na nauubos.",
      "learn.p3": "Huminto kahit kailan, at ituloy kung saan ka huminto.",
      "path.n1": "Shahada", "path.n2": "Wudu", "path.n3": "Unang pagdarasal", "path.start": "Simulan",
      "ask.title": "Walang sanggunian, walang sagot",
      "ask.lead": "Sumasagot ang assistant ng Rafeeq sa iyong wika mula lamang sa mga aprubadong sanggunian, at ipinapakita kung saan galing ang bawat sagot. Kapag wala itong makitang sanggunian, sasabihin nito iyon at iaalok na makausap mo ang isang tao.",
      "ask.ai": "AI ang assistant, lagi nitong sinasabi iyon, at maaari itong magkamali.",
      "ask.which": "Ano ang nangyayari sa iyong tanong?",
      "ask.q": "Ang iyong tanong",
      "ask.k0": "Pangkalahatang tanong", "ask.k1": "Magkakaiba ang mga iskolar", "ask.k2": "Tungkol sa sarili mong kaso", "ask.k3": "Kung nasa panganib ka",
      "ask.o0": "Isang sagot mula sa mga aprubadong sanggunian, na may kasamang pangalan ng sanggunian sa dulo.",
      "ask.o1": "Sasabihin nitong magkakaiba ang pananaw ng mga iskolar, hindi nito ipapakitang tiyak na ang pinagtatalunan, o ire-refer ka sa isang espesyalista.",
      "ask.o2": "Hindi nagbibigay ng hatol ang assistant sa iyong kaso. Pangkalahatang impormasyon ang ibibigay nito, saka isang kwalipikadong tao ang magpapatuloy.",
      "ask.o3": "Hindi sasagot ang AI. Agad kang aalukin na makausap ang isang tao mula sa aming team, at ipapakita ang mga emergency number sa iyong bansa.",
      "ask.e0": "Nasa ilalim ng bawat sagot ang sanggunian", "ask.e1": "Ang mga pananaw, hindi pinagpapasyahan", "ask.e2": "Isang kwalipikadong tao", "ask.e3": "Isang tao, at mga emergency number",
      "people.title": "“Gusto ko ng tao”",
      "people.caption": "Isang button sa bawat aralin, pagbabalik-aral at tanong.",
      "people.lead": "Pindutin ito at sasagot ang isang tao mula sa team ng Rafeeq sa iyong wika: lalaki kung lalaki ka, babae kung babae ka. Hindi mo kailangan ng account.",
      "people.mentorT": "Isang boluntaryong mentor",
      "people.mentor": "Gamit ang account, pumili ng mentor na kapareho mo ng kasarian at nagsasalita ng iyong wika. Ang progresong pinapayagan mo lang ang makikita niya.",
      "people.groupT": "Isang maliit na grupo",
      "people.group": "Sumali gamit ang code. Ang pangalang pipiliin mo lang ang makikita, at sama-samang binibilang ang progreso, hindi kung sino ang hindi nakatapos.",
      "daily.title": "Sa iyong telepono kinakalkula ang oras ng pagdarasal",
      "daily.lead": "Sa sarili mong telepono kinakalkula ang oras ng pagdarasal at ang qibla, at hindi kailanman umaalis dito ang iyong lokasyon. Nariyan din ang pang-araw-araw na adhkar.",
      "daily.private": "Sa pagitan mo at ni Allah ang pagsamba: pribado ang anumang sinusubaybayan mo rito, walang ibang nakakakita, at hindi ito ginagantimpalaan ng badge o progreso.",
      "mercy.title": "Lumiban ng isang araw? Hihintayin ka namin",
      "mercy.lead": "Humihinto muna ang sunod-sunod mong araw ng pag-aaral habang wala ka, at hindi ito bumabalik sa zero. Pagbalik mo, isang maikling aralin ang naghihintay, hindi listahan ng mga nakaligtaan mo.",
      "mercy.remind": "Darating lang ang paalala kung hihilingin mo: isang beses sa isang araw sa pinakamarami, sa oras na pipiliin mo, sa neutral na salitang walang ibinubunyag.",
      "mercy.account": "Hindi mo kailangan ng account para magsimula: nasa iyong device ang progreso mo. Kapag gusto mo itong ingatan, isang simpleng account na may pangalang pipiliin mo, walang email na kailangan.",
      "mercy.paused": "Nakahinto muna",
      "bloom.title": "Yunit kada yunit, nabubuo ang iyong bulaklak",
      "bloom.lead": "Bawat yunit na matatapos mo ay nagdaragdag ng talulot sa iyong bulaklak, at ngayon nagsisimula ang una.",
      "bloom.note": "Libre, sa Arabic, English at Tagalog.",
      "bloom.mentor": "Para sa mga mentor at organisasyong pang-da'wa: mag-apply at susuriin ng team ng Rafeeq ang iyong aplikasyon. Kung may invite code ka na, gumawa ng account gamit ito.",
      "bloom.mentorLink": "Mag-apply bilang mentor",
      "foot.privacy": "Walang ads, walang tracker."
    }
  };
  var dict = T[LANG] || T.ar;
  var t = function (k) { return dict[k] != null ? dict[k] : T.ar[k]; };

  function applyLanguage() {
    if (LANG !== "ar") {
      document.querySelectorAll("[data-i18n]").forEach(function (el) {
        var v = dict[el.getAttribute("data-i18n")];
        if (v != null) el.textContent = v;
      });
      document.querySelectorAll("[data-i18n-html]").forEach(function (el) {
        var v = dict[el.getAttribute("data-i18n-html")]; // static strings from this file only
        if (v != null) el.innerHTML = v;
      });
      document.title = t("title");
      var wm = LANG === "ar" ? "ar" : "en";
      document.querySelectorAll("[data-wordmark]").forEach(function (img) {
        img.src = "/landing/brand/rafeeq-wordmark-" + wm + "-" + img.getAttribute("data-wordmark") + ".svg";
      });
    }
    document.querySelectorAll("[data-i18n-attr]").forEach(function (el) {
      el.getAttribute("data-i18n-attr").split(";").forEach(function (pair) {
        var p = pair.split(":");
        if (p.length === 2) el.setAttribute(p[0].trim(), t(p[1].trim()));
      });
    });
    document.querySelectorAll(".lang a").forEach(function (a) {
      var on = a.getAttribute("data-lang") === LANG;
      if (on) a.setAttribute("aria-current", "true"); else a.removeAttribute("aria-current");
      a.addEventListener("click", function (e) {
        e.preventDefault();
        var l = a.getAttribute("data-lang");
        try { localStorage.setItem("rafeeq.landing.lang", l); } catch (err) {}
        var u = new URL(location.href);
        u.searchParams.set("lang", l);
        u.hash = "";
        location.href = u.toString();
      });
    });
    // "Start your journey": hand the chosen language to the app, but only for
    // a device that has not been through onboarding (frontend/src/app/stores/device.ts).
    // PLT-01 R2: a language the visitor chose here travels in the link
    // (/app/?lang=tl; the app sends a new device on to /app/welcome?lang=tl), so
    // the app starts in it; the link carries nothing else (PLT-10 R2).
    var chosen = null;
    try { chosen = new URL(location.href).searchParams.get("lang") || localStorage.getItem("rafeeq.landing.lang"); } catch (err) {}
    document.querySelectorAll("[data-start]").forEach(function (a) {
      if (chosen) a.setAttribute("href", "/app/?lang=" + encodeURIComponent(LANG));
      a.addEventListener("click", function () {
        try {
          var raw = localStorage.getItem("rafeeq.device"), cur = raw ? JSON.parse(raw) : null;
          if (!cur || !cur.state || !cur.state.onboarded) {
            var next = cur && cur.state ? cur : { state: {}, version: 1 };
            next.state.locale = LANG;
            localStorage.setItem("rafeeq.device", JSON.stringify(next));
          }
        } catch (err) {}
      });
    });
    doc.classList.remove("i18n-pending");
  }

  /* ------------------------------------------------------ petal maths --
     PETAL from frontend/src/components/rafeeq/brand.tsx: an ellipse at
     (60,32) rx 8 ry 22 on a 120 grid, tilted 18° about (60,50), repeated
     every 30°. Ellipse perimeter (Ramanujan) ≈ 99.5 → dash length 100. */
  var NS = "http://www.w3.org/2000/svg";
  var uid = 0;
  function petal(k, attrs, step) {
    return '<g transform="rotate(' + (k * (step || 30)) + ' 60 60)"><ellipse cx="60" cy="32" rx="8" ry="22" transform="rotate(18 60 50)" ' + (attrs || "") + "/></g>";
  }
  function defs(id) {
    return "<defs>" +
      '<linearGradient id="' + id + 'v" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stop-color="#3b2d99"/><stop offset=".5" stop-color="#7a5ce0"/><stop offset="1" stop-color="#c47ad0"/></linearGradient>' +
      '<linearGradient id="' + id + 'a" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffc77d"/><stop offset="1" stop-color="#f08a4b"/></linearGradient>' +
      '<radialGradient id="' + id + 'c"><stop offset="0" stop-color="#ffd38f"/><stop offset="1" stop-color="#f5a23a"/></radialGradient>' +
      '<radialGradient id="' + id + 'g"><stop offset="0" stop-color="#f5a23a" stop-opacity=".6"/><stop offset=".55" stop-color="#f5a23a" stop-opacity=".18"/><stop offset="1" stop-color="#f5a23a" stop-opacity="0"/></radialGradient>' +
      "</defs>";
  }
  /* «الهالة»: thin strokes at any size (non-scaling), like Halo in brand.tsx */
  function haloSVG(stroke, width) {
    var s = '<svg viewBox="0 0 120 120" aria-hidden="true">';
    for (var k = 0; k < 12; k++) s += petal(k, 'fill="none" vector-effect="non-scaling-stroke" stroke="' + (stroke || "currentColor") + '" stroke-width="' + (width || 1.2) + '"');
    return s + "</svg>";
  }
  /* The year flower (graphics.tsx YearFlower): idle petals first, coloured
     ones on top, alternating violet and amber gradients, amber core. */
  function yearFlowerSVG(done, opts) {
    opts = opts || {};
    var id = "yf" + (++uid);
    var s = '<svg viewBox="-20 -20 160 160" aria-hidden="true">' + defs(id);
    s += '<circle class="cf-glow" cx="60" cy="60" r="70" fill="url(#' + id + 'g)" opacity="' + (opts.glow ? 1 : 0) + '"/>';
    s += '<g class="idle">';
    for (var k = 0; k < 12; k++) s += petal(k, 'fill="none" stroke-width="2.4" stroke="' + (opts.idle || "rgb(255 255 255 / .2)") + '"');
    s += '</g><g class="on">';
    for (k = 0; k < 12; k++) {
      var off = opts.live ? 100 : (k < done ? 0 : 100);
      s += petal(k, 'fill="none" stroke="url(#' + id + (k % 2 ? "a" : "v") + ')" stroke-width="4.6" stroke-linecap="round" stroke-dasharray="100 100" stroke-dashoffset="' + off + '"');
    }
    s += "</g>";
    s += '<circle class="cf-core" cx="60" cy="60" r="' + (done >= 12 ? 11 : 9) + '" fill="url(#' + id + 'c)"/></svg>';
    return s;
  }

  /* seeded PRNG so the sky is the same sky for everyone */
  function rng(seed) { return function () { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; }; }

  function buildSky() {
    var far = document.getElementById("skyFar");
    var r = rng(1445), stars = '<svg class="sky__stars" viewBox="0 0 1000 1000" preserveAspectRatio="xMidYMid slice">', twinkles = "";
    for (var i = 0; i < 130; i++) {
      var x = r() * 1000, y = r() * 1000, big = r() > 0.92, o = (0.25 + r() * 0.6).toFixed(2);
      var d = i % 9 === 0 ? (-r() * 5).toFixed(2) : null;   // same draw order as before: same sky
      var rad = (big ? 1.7 : 0.6 + r() * 0.7).toFixed(2);
      if (d !== null) {
        // Perf: a twinkling star is its own small element (opacity runs on the
        // compositor), not a circle in the sky SVG, whose animation restyled
        // and repainted the whole full-screen sky layer on every frame.
        twinkles += '<i class="sky__tw" style="--x:' + x.toFixed(1) + ";--y:" + y.toFixed(1) + ";--r:" + rad + ";--o:" + o + ";--d:" + d + 's"></i>';
        continue;
      }
      stars += '<circle cx="' + x.toFixed(1) + '" cy="' + y.toFixed(1) + '" r="' + rad + '" opacity="' + o + '"/>';
    }
    stars += "</svg>" + twinkles;
    // «نقشة الرفاق»: tone-on-tone repeat of the symbol (graphics.tsx PetalPattern)
    var tile = 78, fl = function (cx, cy, rr) {
      var g = '<g transform="translate(' + (cx - rr) + " " + (cy - rr) + ") scale(" + (2 * rr / 120) + ')">';
      for (var k = 0; k < 12; k++) g += petal(k, 'fill="none" stroke="currentColor" stroke-width="5"');
      return g + "</g>";
    };
    var pat = '<svg class="sky__pattern"><defs><pattern id="pp" width="' + tile + '" height="' + tile + '" patternUnits="userSpaceOnUse">' +
      fl(tile * 0.25, tile * 0.25, tile * 0.17) + fl(tile * 0.75, tile * 0.75, tile * 0.17) +
      '</pattern><linearGradient id="ppm" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff"/><stop offset=".7" stop-color="#fff" stop-opacity=".35"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>' +
      '<mask id="ppk"><rect width="100%" height="100%" fill="url(#ppm)"/></mask></defs><rect width="100%" height="100%" fill="url(#pp)" mask="url(#ppk)"/></svg>';
    far.innerHTML = pat + stars;
    document.getElementById("halo").innerHTML = haloSVG("currentColor", 1.3);
  }

  /* near plane: large soft petals that pass in front of the flower */
  var NEAR = [
    // x%, y%, w (vmin), rot, blur px, fill, opacity, speed
    [80, 74, 26, -24, 9, "v", 0.55, 0.95],
    [5, 3, 11, 32, 6, "o", 0.45, 0.7],
    [62, 60, 7, 12, 1.5, "l", 0.7, 1.25],
    [34, 104, 18, -38, 7, "v", 0.5, 1.4],
    [91, 32, 5, 56, 1, "o", 0.55, 0.55]
  ];
  // phones: keep every near petal off the copy at rest (the copy sits low)
  var NEAR_PHONE = [
    [93, 36, 22, -24, 8, "v", 0.5, 0.95],
    [4, 9, 12, 32, 6, "o", 0.45, 0.7],
    [70, 30, 7, 12, 1.5, "l", 0.7, 1.25],
    [30, 106, 18, -38, 7, "v", 0.45, 1.4],
    [12, 44, 5, 56, 1, "o", 0.5, 0.55]
  ];
  var nearEls = [];
  function petalShape(fill, id, blur) {
    var g = fill === "v" ? '<linearGradient id="' + id + '" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stop-color="#3b2d99"/><stop offset=".6" stop-color="#7a5ce0"/><stop offset="1" stop-color="#c47ad0"/></linearGradient>'
      : fill === "o" ? '<linearGradient id="' + id + '" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#c47ad0"/><stop offset="1" stop-color="#7a5ce0"/></linearGradient>'
      : '<linearGradient id="' + id + '" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#b4a9f5"/><stop offset="1" stop-color="#7a5ce0"/></linearGradient>';
    // the softness is drawn into the petal (rasterised once), not a CSS filter
    // the compositor would have to re-run on every frame the petal moves
    var f = blur ? '<filter id="' + id + 'b" x="-60%" y="-60%" width="220%" height="220%"><feGaussianBlur stdDeviation="' + blur.toFixed(2) + '"/></filter>' : "";
    return '<svg viewBox="0 0 40 80"><defs>' + g + f + '</defs><ellipse cx="20" cy="40" rx="18" ry="38" fill="url(#' + id + ')"' + (blur ? ' filter="url(#' + id + 'b)"' : "") + "/></svg>";
  }
  function buildNear() {
    var host = document.getElementById("near");
    (innerWidth < 900 ? NEAR_PHONE : NEAR).forEach(function (n, i) {
      var el = document.createElement("div");
      el.className = "near__p";
      var w = n[2];
      el.style.width = w + "vmin"; el.style.height = (w * 2) + "vmin";
      el.style.left = (RTL ? 100 - n[0] : n[0]) + "%";
      el.style.marginLeft = (-w / 2) + "vmin";
      el.style.top = n[1] + "%";
      el.style.opacity = n[6];
      // CSS blur(n px) in the SVG's own units: the 40-unit-wide box is w vmin
      var unitPx = (w * Math.min(innerWidth, innerHeight) / 100) / 40;
      el.innerHTML = petalShape(n[5], "np" + i, n[4] / unitPx);
      el._rot = RTL ? -n[3] : n[3];
      el._speed = n[7];
      el.style.transform = "rotate(" + el._rot + "deg)";
      host.appendChild(el);
      nearEls.push(el);
    });
  }

  /* bloom confetti in three depth planes (graphics.tsx PetalConfetti colours) */
  var CONF = ["#f5a23a", "#7a5ce0", "#ffc77d", "#c47ad0"];
  var planes = [];
  function buildConfetti() {
    var host = document.getElementById("confetti");
    var r = rng(77);
    // the copy column is kept clear below the flower: inside it, petals stay up high
    var band = Math.min(720, innerWidth) / innerWidth * 50 + 3;
    [["far", 18, 0.35], ["mid", 12, 0.7], ["near", 5, 1.25]].forEach(function (cfg) {
      var plane = document.createElement("div");
      plane.className = "confetti__plane confetti__plane--" + cfg[0];
      for (var i = 0; i < cfg[1]; i++) {
        // keep the centre column (the flower and the copy) clear
        var side = i % 2 ? 1 : -1, x = 50 + side * (24 + r() * 24), y = 14 + r() * 76;
        if (cfg[0] === "near") { x = 50 + side * (36 + r() * 12); }
        if (Math.abs(x - 50) < band) y = 9 + r() * 30;
        var p = document.createElement("span");
        p.className = "confetti__p";
        p.style.left = x.toFixed(1) + "%"; p.style.top = y.toFixed(1) + "%";
        p.style.rotate = ((r() * 140) - 70).toFixed(0) + "deg";
        p.innerHTML = '<svg viewBox="0 0 12 24"><ellipse cx="6" cy="12" rx="5" ry="11" fill="' + CONF[Math.floor(r() * 4)] + '"/></svg>';
        plane.appendChild(p);
      }
      plane._speed = cfg[2];
      host.appendChild(plane);
      planes.push(plane);
    });
  }

  /* 2 · the learning path (PathNode: pebble with a 6px lip, zig-zag) */
  function buildPath() {
    var W = 380, mx = function (x) { return RTL ? W - x : x; };
    var leftEdge = RTL ? "end" : "start", rightEdge = RTL ? "start" : "end";
    var nodes = [[120, 112, "cur", "path.n1"], [258, 222, "open", "path.n2"], [132, 332, "open", "path.n3"], [250, 436, "more", null]];
    var s = '<svg viewBox="0 0 ' + W + ' 500" direction="' + (RTL ? "rtl" : "ltr") + '">';
    // dotted connectors
    s += '<path d="M' + mx(120) + " 112 C " + mx(120) + " 170, " + mx(258) + " 160, " + mx(258) + " 222 S " + mx(132) + " 270, " + mx(132) + " 332 S " + mx(250) + " 380, " + mx(250) + ' 436" fill="none" stroke="#d6d0ff" stroke-width="5" stroke-linecap="round" stroke-dasharray="0.1 14"/>';
    nodes.forEach(function (n, i) {
      var x = mx(n[0]), y = n[1], cur = n[2] === "cur", more = n[2] === "more";
      if (cur) s += '<circle cx="' + x + '" cy="' + (y + 2) + '" r="60" fill="none" stroke="#b4a9f5" stroke-width="1.5" stroke-dasharray="2 7" stroke-linecap="round"/>';
      var face = cur ? "#5a48d6" : more ? "#f4f2ff" : "#fff", lip = cur ? "#3b2d99" : more ? "#ece9ff" : "#e4e1f2", stroke = cur ? "none" : more ? "#ece9ff" : "#e4e1f2";
      s += '<rect x="' + (x - 40) + '" y="' + (y - 30) + '" width="80" height="64" rx="32" fill="' + lip + '"/>';
      s += '<rect x="' + (x - 40) + '" y="' + (y - 36) + '" width="80" height="64" rx="32" fill="' + face + '" stroke="' + stroke + '" stroke-width="2"/>';
      s += '<ellipse cx="' + x + '" cy="' + (y - 4) + '" rx="7" ry="15" transform="rotate(18 ' + x + " " + (y - 4) + ')" fill="' + (cur ? "#fff" : more ? "#d6d0ff" : "#b4a9f5") + '"/>';
      if (n[3]) {
        var right = n[0] < W / 2; // label on the inner side of the zig-zag (in base LTR coords)
        var lx = mx(n[0] + (right ? 58 : -58));
        var anchor = (right !== RTL) ? leftEdge : rightEdge; // geometric left edge when the label sits to the right
        s += '<text x="' + lx + '" y="' + (y + 2) + '" text-anchor="' + anchor + '" dominant-baseline="middle">' + esc(t(n[3])) + "</text>";
      }
    });
    // «ابدأ» bubble over the current node
    var label = t("path.start"), bw = Math.max(64, label.length * 10 + 30), bx = mx(120) - bw / 2;
    s += '<g class="path__bubble"><rect x="' + bx + '" y="22" width="' + bw + '" height="38" rx="19" fill="#5a48d6"/><path d="M' + (mx(120) - 8) + " 59 L " + mx(120) + " 68 L " + (mx(120) + 8) + ' 59 Z" fill="#5a48d6"/><text x="' + mx(120) + '" y="42" text-anchor="middle" dominant-baseline="middle">' + esc(label) + "</text></g>";
    s += "</svg>";
    document.getElementById("path").innerHTML = s;
  }
  function esc(v) { return String(v).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }

  /* 4 · a circle of companions around «أريد إنسانًا» (SpotIllustration "companion") */
  function buildRing() {
    var id = "rg", s = '<svg viewBox="0 0 200 200">' + defs(id);
    s += '<g transform="translate(10 10) scale(1.5)" opacity=".9">';
    for (var k = 0; k < 12; k++) s += petal(k, 'fill="none" stroke="#ece9ff" stroke-width=".7"');
    s += "</g>";
    s += '<circle cx="100" cy="100" r="86" fill="none" stroke="#d6d0ff" stroke-width=".6" stroke-dasharray="1 4"/>';
    var n = 10;
    for (var i = 0; i < n; i++) {
      var a = (i / n) * Math.PI * 2 - Math.PI / 2, cx = 100 + Math.cos(a) * 86, cy = 100 + Math.sin(a) * 86, sc = i % 3 === 0 ? 0.2 : 0.15;
      s += '<g transform="translate(' + (cx - 60 * sc).toFixed(2) + " " + (cy - 60 * sc).toFixed(2) + ") scale(" + sc + ')">';
      for (k = 0; k < 12; k++) s += petal(k, 'fill="' + (k % 2 ? "#b4a9f5" : "url(#" + id + "v)") + '"');
      s += '<circle cx="60" cy="60" r="11" fill="#fff"/></g>';
    }
    s += "</svg>";
    document.getElementById("ringArt").innerHTML = s;
  }

  /* 5 · the dial: a faint halo behind (far), the plate and the petal needle (near) */
  function buildDial() {
    document.getElementById("dialRing").innerHTML =
      '<svg viewBox="-30 -30 180 180">' + (function () { var g = ""; for (var k = 0; k < 12; k++) g += petal(k, 'fill="none" stroke="#d6d0ff" stroke-width=".8"'); return g; })() + "</svg>";
    var id = "dl", s = '<svg viewBox="0 0 200 200">' + defs(id);
    s += '<circle cx="100" cy="100" r="74" fill="#fff" stroke="#e4e1f2" stroke-width="1.5"/>';
    s += '<circle cx="100" cy="100" r="58" fill="#f4f2ff"/>';
    for (var i = 0; i < 48; i++) {
      var a = i * 7.5 * Math.PI / 180, r1 = i % 4 === 0 ? 64 : 67, x1 = 100 + Math.sin(a) * r1, y1 = 100 - Math.cos(a) * r1, x2 = 100 + Math.sin(a) * 71, y2 = 100 - Math.cos(a) * 71;
      s += '<line x1="' + x1.toFixed(2) + '" y1="' + y1.toFixed(2) + '" x2="' + x2.toFixed(2) + '" y2="' + y2.toFixed(2) + '" stroke="' + (i % 4 ? "#d6d0ff" : "#8b7ceb") + '" stroke-width="' + (i % 4 ? 0.8 : 1.4) + '" stroke-linecap="round"/>';
    }
    s += "</svg>";
    // the needle is its own layer, turned with a CSS transform: turning it
    // inside the plate's SVG repainted the whole dial on every scroll frame
    s += '<div class="dial__needle" id="needle"><svg viewBox="36 36 128 128">' + defs(id + "n");
    s += '<g><ellipse cx="100" cy="66" rx="9" ry="30" fill="url(#' + id + 'nv)"/><ellipse cx="100" cy="128" rx="5" ry="16" fill="#d6d0ff"/></g>';
    s += '<circle cx="100" cy="100" r="9" fill="#3b2d99"/><circle cx="100" cy="100" r="3.5" fill="#fff"/></svg></div>';
    document.getElementById("dialNeedle").innerHTML = s;
  }

  /* 6 · a row of learning days: one pauses, the row carries on (MOT-02) */
  var DAYS = 9, PAUSE = 4, dayEls = [];
  function buildDays() {
    var host = document.getElementById("days"), id = "dy";
    for (var i = 0; i < DAYS; i++) {
      var li = document.createElement("li"), pause = i === PAUSE;
      var s = '<svg viewBox="0 0 24 48"><defs><linearGradient id="' + id + i + '" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stop-color="#3b2d99"/><stop offset=".55" stop-color="#7a5ce0"/><stop offset="1" stop-color="#c47ad0"/></linearGradient></defs><g transform="rotate(18 12 24)">';
      s += '<ellipse cx="12" cy="24" rx="10" ry="22" fill="none" stroke="#e4e1f2" stroke-width="2"/>';
      if (pause) s += '<g class="d-pause"><ellipse cx="12" cy="24" rx="10" ry="22" fill="#f4f2ff" stroke="#8b7ceb" stroke-width="2" stroke-dasharray="3 4"/><rect x="8" y="17" width="2.6" height="14" rx="1.3" fill="#5a48d6"/><rect x="13.4" y="17" width="2.6" height="14" rx="1.3" fill="#5a48d6"/></g>';
      else s += '<ellipse class="d-fill" cx="12" cy="24" rx="10" ry="22" fill="url(#' + id + i + ')"/>';
      s += "</g></svg>";
      li.innerHTML = s + '<span class="days__tag">' + (pause ? esc(t("mercy.paused")) : "") + "</span>";
      host.appendChild(li);
      dayEls.push({ fill: li.querySelector(pause ? ".d-pause" : ".d-fill"), tag: pause ? li.querySelector(".days__tag") : null });
    }
  }

  /* the companion: one flower, live petals */
  var comp, compOn = [], compIdle, compIdleEls = [], compGlow, compCore;
  function buildCompanion() {
    comp = document.getElementById("companion");
    comp.innerHTML = yearFlowerSVG(0, { live: true, idle: "currentColor" });
    compOn = Array.prototype.slice.call(comp.querySelectorAll(".on ellipse"));
    compIdle = comp.querySelector(".idle");
    compIdleEls = Array.prototype.slice.call(compIdle.querySelectorAll("ellipse"));
    compIdleEls.forEach(function (e) { e.removeAttribute("stroke"); });
    compGlow = comp.querySelector(".cf-glow");
    compCore = comp.querySelector(".cf-core");
  }
  function buildStatic() {
    document.querySelectorAll(".static-flower").forEach(function (el) {
      var n = parseInt(el.getAttribute("data-flower"), 10) || 0;
      el.innerHTML = '<div style="position:relative;width:100%;height:100%">' +
        (n >= 12 ? '<div style="position:absolute;inset:-35%;border-radius:50%;background:radial-gradient(circle,#ffd38f 0%,rgb(245 162 58 / .4) 30%,transparent 66%);opacity:.55"></div>' : "") +
        '<div style="position:absolute;inset:-60%;color:rgb(255 255 255 / .13)">' + haloSVG("currentColor", 1.2) + "</div>" +
        '<div style="position:absolute;inset:0">' + yearFlowerSVG(n, { glow: n >= 12 }) + "</div></div>";
    });
  }

  /* reduced motion: no pinned travel, every cue shown, decorative planes
     become part of their sections so depth survives without movement */
  function prepareReduced() {
    document.querySelectorAll('[data-sc-act="pin"]').forEach(function (el) { el.setAttribute("data-sc-act", "flow"); el.removeAttribute("data-sc-span"); });
    document.querySelectorAll("[data-sc-cue]").forEach(function (el) { el.removeAttribute("data-sc-cue"); });
    document.querySelectorAll("[data-sc-kinetic]").forEach(function (el) { el.removeAttribute("data-sc-kinetic"); });
    var hero = document.getElementById("welcome"), bloom = document.getElementById("bloom");
    hero.style.position = "relative"; bloom.style.position = "relative";
    var near = document.getElementById("near"), conf = document.getElementById("confetti");
    near.style.position = "absolute"; hero.appendChild(near);
    conf.style.position = "absolute"; bloom.appendChild(conf);
  }

  /* ------------------------------------------------------- the loop -- */
  var clamp01 = function (x) { return x < 0 ? 0 : x > 1 ? 1 : x; };
  var smooth = function (x) { x = clamp01(x); return x * x * (3 - 2 * x); };
  var easeIO = function (x) { x = clamp01(x); return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2; };
  var lerp = function (a, b, k) { return a + (b - a) * k; };

  var el = {};
  var vh = innerHeight, vw = innerWidth, maxY = 1;
  var loadT0 = 0, loadDraw = 0, raf = 0;
  var lastSig = "";

  function rectOf(node) { var r = node.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; }
  function centreOf(r) { return { x: r.x + r.w / 2, y: r.y + r.h / 2, s: r.w }; }

  /* Perf (phones): every layout read of a frame happens first and every
     style write after it, so a scroll costs one style/layout pass instead of
     a forced one per section; a value that did not change is not written
     again (an SVG attribute write restyles and repaints the flower even when
     the value is equal). */
  function setAttr(node, name, v) { var k = "_a" + name; if (node[k] !== v) { node[k] = v; node.setAttribute(name, v); } }
  function setStyle(node, name, v) { var k = "_s" + name; if (node[k] !== v) { node[k] = v; node.style[name] = v; } }

  function frame(now) {
    raf = 0;
    // ---- reads (layout) -------------------------------------------------
    vh = innerHeight; vw = innerWidth;
    var y = scrollY;
    maxY = Math.max(1, document.documentElement.scrollHeight - vh);
    var sheet = el.sheet.getBoundingClientRect();
    var sTop = sheet.top, sBot = sheet.bottom, sH = sheet.height;
    var hero = el.hero.getBoundingClientRect();
    var heroP = clamp01(-hero.top / Math.max(hero.height - vh, 1));
    var bloom = el.bloom.getBoundingClientRect();
    var bloomP = clamp01(-bloom.top / Math.max(bloom.height - vh, 1));
    var barH = el.bar.offsetHeight;
    var st = el.heroStage.getBoundingClientRect().top, hc = el.heroCopy.getBoundingClientRect();
    var dr = el.days.getBoundingClientRect();
    var chapterRects = [];
    for (var ci = 0; ci < chapters.length; ci++) chapterRects.push(chapters[ci].sec.getBoundingClientRect());
    var H, D, B, dl, askR;
    if (!RM) {
      var dockNode = vw >= 1100 ? el.dockRail : el.dockBar;
      H = centreOf(rectOf(el.anchorHero)); D = centreOf(rectOf(dockNode)); B = centreOf(rectOf(el.anchorBloom));
      if (vw >= 1100) { var rr = el.rail.getBoundingClientRect(); if (!rr.width) D = centreOf(rectOf(el.dockBar)); }
      if (el.dawn._vh !== vh) { el.dawn._h = el.dawn.offsetHeight; el.dawn._vh = vh; }
      dl = el.daily.getBoundingClientRect();
      if (el.ask && !el.ask.classList.contains("ask-flow")) askR = el.ask.getBoundingClientRect();
    }

    // ---- writes ---------------------------------------------------------
    // sky visible at all? (the sheet covers it completely in the middle)
    var skyVisible = sTop > 0 || sBot < vh;
    el.sky.classList.toggle("is-hidden", !skyVisible);
    setStyle(el.sky, "visibility", skyVisible ? "" : "hidden");

    // ---- the bar: night or day under it
    var day = sTop < barH * 0.6 && sBot > barH * 0.6;
    el.bar.classList.toggle("is-day", day);

    // PLT-14 R1: the hero copy scrolls away with the page; it fades as it
    // reaches the bar so the title never sits under the brand.
    // Measured from the stage, so the copy is always whole at rest, however
    // short the screen.
    var moved = Math.max(0, -st), room = Math.max(hc.top - st - barH, 1);
    setStyle(el.heroCopy, "opacity", (1 - clamp01(moved / room)).toFixed(3));

    // ---- petals drawn: 1 on arrival, 10 while the sheet is read, the 12th at the bloom
    if (loadT0 && loadDraw < 1) loadDraw = clamp01((now - loadT0) / 900);
    var read = clamp01((vh * 0.55 - sTop) / Math.max(sH - vh * 0.35, 1));
    var draws = [];
    for (var k = 0; k < 12; k++) {
      draws[k] = k === 0 ? (RM ? 1 : smooth(loadDraw)) : k <= 10 ? clamp01(read * 10 - (k - 1)) : clamp01((bloomP - 0.1) / 0.16);
    }
    var ignite = smooth((bloomP - 0.2) / 0.18);

    if (RM) { reducedFrame(draws, sTop, sBot, read, dr, chapterRects); scheduleIfLoading(); return; }

    // ---- companion: hero → dock → bloom
    var t1 = easeIO((vh * 0.98 - sTop) / (vh * 0.55));
    var t2 = easeIO((vh * 0.92 - sBot) / (vh * 0.8));
    // subject plane inside the pinned hero: recedes a little while the near plane sweeps past
    H.y -= heroP * 46; H.s *= 1 - heroP * 0.07;
    var c;
    if (t2 > 0) c = { x: lerp(D.x, B.x, t2), y: lerp(D.y, B.y, t2) - Math.sin(t2 * Math.PI) * vh * 0.06, s: lerp(D.s, B.s, t2) };
    else c = { x: lerp(H.x, D.x, t1), y: lerp(H.y, D.y, t1) - Math.sin(t1 * Math.PI) * vh * 0.05, s: lerp(H.s, D.s, t1) };
    var sc = c.s / 180; // 120 flower units span 180px of the 240px box
    setStyle(comp, "transform", "translate3d(" + (c.x - 120 * sc).toFixed(2) + "px," + (c.y - 120 * sc).toFixed(2) + "px,0) scale(" + sc.toFixed(4) + ")");
    var flying = t1 > 0.02 && t2 < 0.985;
    comp.classList.toggle("is-top", flying);
    var dockMist = flying && D.y > sTop && D.y < sBot && t1 > 0.5 && t2 < 0.5;
    comp.classList.toggle("is-day", dockMist);
    // small sizes need thicker strokes (brand: 6.2 below 64px)
    var dockness = flying ? Math.max(Math.min(t1, 1 - t2), 0) : 0;
    var onW = lerp(4.6, 7.4, dockness).toFixed(2), idleW = lerp(2.4, 4, dockness).toFixed(2);
    for (k = 0; k < 12; k++) {
      setAttr(compOn[k], "stroke-dashoffset", (100 - draws[k] * 100).toFixed(1));
      setAttr(compOn[k], "stroke-width", onW);
    }
    setAttr(compIdle, "stroke-width", idleW);
    for (k = 0; k < compIdleEls.length; k++) setAttr(compIdleEls[k], "stroke-width", idleW);
    setAttr(compGlow, "opacity", ignite.toFixed(3));
    setAttr(compCore, "r", (9 + 2 * ignite).toFixed(2));

    // ---- rail (desktop chapter nav) shows only over the sheet
    el.rail.classList.toggle("is-on", sTop < vh * 0.3 && sBot > vh * 0.7);

    // ---- sky planes: nothing to move while the sheet covers the sky
    var inBloom = y > maxY - vh * 4;
    var ref = inBloom ? y - maxY : y;            // 0 at either end of the page
    if (skyVisible) {
      setStyle(el.far, "transform", "translate3d(0," + (-ref * 0.05).toFixed(1) + "px,0)");
      var haloC = t2 > 0 ? B : H, haloS = haloC.s * (t2 > 0 ? lerp(1.9, 2.25, smooth(bloomP / 0.5)) : (vw < 900 ? 1.9 : 1.75));
      var haloO = t2 > 0 ? 0.9 * smooth((t2 - 0.4) / 0.6) : 1 - smooth(t1 / 0.5);
      var haloY = haloC.y + (t2 > 0 ? 0 : heroP * 30);   // the mid plane lags the subject
      // sized in px (not scaled) so the halo keeps hairline strokes at any size
      var hs = Math.round(haloS);
      if (hs !== el.halo._s) { el.halo.style.width = el.halo.style.height = hs + "px"; el.halo._s = hs; }
      setStyle(el.halo, "transform", "translate3d(" + (haloC.x - hs / 2).toFixed(1) + "px," + (haloY - hs / 2).toFixed(1) + "px,0) rotate(" + (ref * 0.02 + bloomP * 30).toFixed(2) + "deg)");
      setStyle(el.halo, "opacity", haloO.toFixed(3));
      var dawnH = el.dawn._h;
      setStyle(el.dawn, "transform", "translate3d(0," + (sTop - dawnH + 30).toFixed(1) + "px,0)");
      setStyle(el.dawn, "opacity", (smooth((vh * 1.25 - sTop) / (vh * 0.7)) * (sTop > -dawnH ? 1 : 0)).toFixed(3));
      setStyle(el.dusk, "transform", "translate3d(0," + (sBot - 30).toFixed(1) + "px,0)");
      setStyle(el.dusk, "opacity", (smooth((vh - sBot) / (vh * 0.5)) * (1 - ignite * 0.4)).toFixed(3));
      var coreS = B.s * 2.6;
      setStyle(el.core, "transform", "translate3d(" + (B.x - 50).toFixed(1) + "px," + (B.y - 50).toFixed(1) + "px,0) scale(" + ((coreS / 100) * (0.7 + 0.3 * ignite)).toFixed(3) + ")");
      setStyle(el.core, "opacity", (0.6 * ignite).toFixed(3));
    }

    // near plane: only around the hero
    var nearOn = y < vh * 2.4;
    setStyle(el.near, "visibility", nearOn ? "" : "hidden");
    if (nearOn) for (var n = 0; n < nearEls.length; n++) {
      var ne = nearEls[n];
      setStyle(ne, "transform", "translate3d(0," + (-y * ne._speed).toFixed(1) + "px,0) rotate(" + (ne._rot + y * 0.01 * (n % 2 ? 1 : -1)).toFixed(2) + "deg)");
    }

    // confetti: rises on the ignite, then keeps drifting at three depths
    var conf = smooth((bloomP - 0.22) / 0.3);
    var confO = conf * (bloom.top < vh ? 1 : 0);
    setStyle(el.confetti, "opacity", confO.toFixed(3));
    if (confO > 0) for (var pl = 0; pl < planes.length; pl++) {
      var sp = planes[pl]._speed;
      setStyle(planes[pl], "transform", "translate3d(0," + (((1 - conf) * 55 - bloomP * 6) * sp).toFixed(2) + "vh,0)");
    }

    // ---- 3 · which question route is showing
    if (askR) {
      var askP = clamp01(-askR.top / Math.max(askR.height - vh, 1));
      var idx = askP < 0.258 ? 0 : askP < 0.508 ? 1 : askP < 0.753 ? 2 : 3;
      if (idx !== el.caseIdx) {
        el.caseIdx = idx;
        el.cases.forEach(function (b, i) { if (i === idx) b.setAttribute("aria-current", "step"); else b.removeAttribute("aria-current"); });
      }
    }

    // ---- 5 · the needle settles onto its bearing as the dial arrives
    var dp = clamp01((vh - dl.top) / (vh + dl.height));
    setStyle(el.needle, "transform", "rotate(" + (300 - 70 * (1 - smooth(dp / 0.55))).toFixed(2) + "deg)");

    // ---- 6 · days
    daysFrame(dr);

    // ---- chapter nav state
    railFrame(chapterRects);

    // ---- harness: publish what the bespoke layers actually paint
    var sig = [Math.round(heroP * 20), Math.round(t1 * 20), Math.round(t2 * 20), Math.round(bloomP * 20), Math.round(ignite * 10)].join("|");
    if (sig !== lastSig) { el.heroStage.setAttribute("data-sc-verify-state", sig); el.bloomStage.setAttribute("data-sc-verify-state", sig); lastSig = sig; }

    scheduleIfLoading();
  }

  function scheduleIfLoading() { if (loadT0 && loadDraw < 1) schedule(); }

  function daysFrame(r) {
    var p = clamp01((vh * 0.95 - r.top) / (vh * 0.55));
    for (var i = 0; i < DAYS; i++) {
      var v;
      if (i < PAUSE) v = smooth((p - 0.04 - i * 0.08) / 0.1);
      else if (i === PAUSE) v = smooth((p - 0.4) / 0.1);
      else v = smooth((p - 0.54 - (i - PAUSE - 1) * 0.08) / 0.1);
      setStyle(dayEls[i].fill, "opacity", v.toFixed(3));
      if (dayEls[i].tag) setStyle(dayEls[i].tag, "opacity", v.toFixed(3));
    }
  }

  var chapters = [];
  function railFrame(rects) {
    var cur = -1;
    for (var i = 0; i < chapters.length; i++) {
      var r = rects[i];
      if (r.top < vh * 0.5 && r.bottom > vh * 0.5) cur = i;
      chapters[i].a.classList.toggle("is-read", r.top < vh * 0.5);
    }
    chapters.forEach(function (c, i) { if (i === cur) c.a.setAttribute("aria-current", "true"); else c.a.removeAttribute("aria-current"); });
  }

  function reducedFrame(draws, sTop, sBot, read, dr, chapterRects) {
    // no movement anywhere: the docked flower appears in place and steps through petals
    el.rail.classList.toggle("is-on", sTop < vh * 0.3 && sBot > vh * 0.7);
    daysFrame(dr);
    railFrame(chapterRects);
  }

  function schedule() { if (!raf) raf = requestAnimationFrame(frame); }

  /* keyboard: a control inside the pinned bloom is parked where its cue is open */
  function focusPark(e) {
    if (RM) return;
    // a case button parks the pinned Ask act on its own route, so focus and view agree
    var ci = el.cases.indexOf(e.target);
    if (ci > -1 && !el.ask.classList.contains("ask-flow")) {
      var ar = el.ask.getBoundingClientRect();
      scrollTo({ top: scrollY + ar.top + CASE_AT[ci] * (ar.height - vh), behavior: "instant" });
      return;
    }
    var b = el.bloom;
    if (!b.contains(e.target)) return;
    requestAnimationFrame(function () {
      var r = b.getBoundingClientRect(), p = -r.top / Math.max(r.height - vh, 1);
      if (p < 0.66 || p > 1) scrollTo({ top: scrollY + r.top + 0.82 * (r.height - vh), behavior: "instant" });
    });
  }

  var CASE_AT = [0.1, 0.38, 0.63, 0.88];
  /* PLT-14 R1: the hero button reads on to the next chapter instead of
     leaving the page. Lands the chapter just under the bar; instant under
     reduced motion; moves focus to the chapter heading for keyboard users. */
  function wireScrollTo() {
    document.querySelectorAll("[data-scroll-to]").forEach(function (a) {
      a.addEventListener("click", function (e) {
        var sec = document.getElementById(a.getAttribute("data-scroll-to"));
        if (!sec) return;
        e.preventDefault();
        var bar = document.getElementById("bar");
        var top = sec.getBoundingClientRect().top + scrollY - (bar ? bar.offsetHeight : 0);
        scrollTo({ top: Math.max(0, top), behavior: RM ? "instant" : "smooth" });
        var h = sec.querySelector("h2, h1");
        if (h) { h.setAttribute("tabindex", "-1"); h.focus({ preventScroll: true }); }
      });
    });
  }

  function wireCases() {
    el.cases = Array.prototype.slice.call(document.querySelectorAll(".cases button"));
    var targets = CASE_AT;
    el.cases.forEach(function (b, i) {
      b.addEventListener("click", function () {
        var r = el.ask.getBoundingClientRect();
        scrollTo({ top: scrollY + r.top + targets[i] * (r.height - vh), behavior: RM ? "instant" : "smooth" });
      });
    });
  }

  function start() {
    applyLanguage();
    buildSky(); buildNear(); buildConfetti(); buildPath(); buildRing(); buildDial(); buildDays(); buildCompanion(); buildStatic();
    if (RM) prepareReduced();
    // a short phone cannot hold the four routes in one pinned screen: list them instead
    if (!RM && innerWidth < 900 && innerHeight < 760) {
      var ask = document.getElementById("ask");
      ask.setAttribute("data-sc-act", "flow"); ask.removeAttribute("data-sc-span"); ask.classList.add("ask-flow");
      ask.querySelectorAll("[data-sc-cue]").forEach(function (c) { c.removeAttribute("data-sc-cue"); });
    }

    el = {
      sky: document.getElementById("sky"), far: document.getElementById("skyFar"), halo: document.getElementById("halo"),
      dawn: document.getElementById("dawn"), dusk: document.getElementById("dusk"), core: document.getElementById("core"),
      near: document.getElementById("near"), confetti: document.getElementById("confetti"),
      bar: document.getElementById("bar"), rail: document.getElementById("rail"),
      dockBar: document.getElementById("dockBar"), dockRail: document.getElementById("dockRail"),
      sheet: document.getElementById("sheet"), hero: document.getElementById("welcome"), bloom: document.getElementById("bloom"),
      heroStage: document.getElementById("heroStage"), heroCopy: document.querySelector(".hero__copy"), bloomStage: document.getElementById("bloomStage"),
      anchorHero: document.getElementById("anchorHero"), anchorBloom: document.getElementById("anchorBloom"),
      ask: document.getElementById("ask"), daily: document.getElementById("daily"), days: document.getElementById("days"),
      needle: document.getElementById("needle")
    };
    document.querySelectorAll(".rail a").forEach(function (a) {
      chapters.push({ a: a, sec: document.querySelector(a.getAttribute("href")) });
    });
    wireCases();
    wireScrollTo();

    // Before the engine's own listener, so this frame (all reads, then writes)
    // runs first in each animation frame and the engine's writes that follow
    // do not force a second style pass here.
    addEventListener("scroll", schedule, { passive: true });

    window.ScrollCraft.mount(document.body);

    addEventListener("resize", schedule);
    addEventListener("focusin", focusPark);

    var go = function () {
      if (loadT0) return;
      el.hero.classList.add("is-in");
      loadT0 = performance.now();
      comp.classList.add("is-ready");
      schedule();
    };
    schedule();
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { setTimeout(go, 120); });
    setTimeout(go, 1200);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();
})();
