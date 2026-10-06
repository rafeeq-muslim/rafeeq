/* Language before first paint: ?lang > saved choice > device language > Arabic.
     Mirrors guessLocale() in frontend/src/app/stores/device.ts. */
  (function () {
    var d = document.documentElement, L = ["ar", "en", "tl"], q = null, s = null;
    d.classList.add("js");
    try { q = new URLSearchParams(location.search).get("lang"); } catch (e) {}
    try { s = localStorage.getItem("rafeeq.landing.lang"); } catch (e) {}
    var n = (navigator.language || "ar").toLowerCase();
    var g = n.indexOf("ar") === 0 ? "ar" : (n.indexOf("tl") === 0 || n.indexOf("fil") === 0) ? "tl" : n.indexOf("en") === 0 ? "en" : "ar";
    var lang = L.indexOf(q) > -1 ? q : L.indexOf(s) > -1 ? s : g;
    d.lang = lang; d.dir = lang === "ar" ? "rtl" : "ltr";
    if (lang === "ar") d.classList.remove("i18n-pending");
    else setTimeout(function () { d.classList.remove("i18n-pending"); }, 1500);
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) d.classList.add("rm");
  })();
