/* PLT-05 R3: the tab title is right from the first moment, before the app
 * loads. In discreet mode it is «Notes» at once (before, the static title
 * showed until React replaced it). A classic script, not inline, because the
 * CSP allows scripts from 'self' only. Reads the device settings that
 * stores/device.ts persists; nothing leaves the device. Kept in step with
 * AppLayout.tsx::useDocumentLocale. */
;(function () {
  var title = "Rafeeq"
  try {
    var saved = JSON.parse(localStorage.getItem("rafeeq.device") || "null")
    var s = saved && saved.state
    if (s && s.discreet) title = "Notes"
    else if (s && s.locale === "ar") title = "رفيق"
  } catch {
    /* blocked or unreadable storage: keep the neutral default */
  }
  document.title = title
})()
