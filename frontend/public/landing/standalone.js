/* PLT-10 R3: a home-screen install made before the app moved to /app still
   launches "/". Opened as an installed app, go straight into the app instead
   of showing this page inside the app window. External file: CSP is
   script-src 'self'. Runs first in <head>, before paint. */
(function () {
  var standalone = false;
  try {
    standalone = (window.matchMedia && window.matchMedia("(display-mode: standalone)").matches) || window.navigator.standalone === true;
  } catch (e) {}
  if (standalone) location.replace("/app/" + location.search);
})();
