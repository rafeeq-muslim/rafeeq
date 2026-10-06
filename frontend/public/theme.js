// PLT-04: apply the saved appearance before the first paint, so a learner
// who chose dark never sees a light flash. A file, not an inline script:
// the CSP allows same-origin scripts only. Light needs nothing (default).
// "system" follows the device's own setting. Kept in step with
// src/app/lib/theme.ts (BAR_COLOR).
try {
  var saved = JSON.parse(localStorage.getItem("rafeeq.device") || "{}").state
  var choice = saved && saved.theme
  var dark =
    choice === "dark" ||
    (choice === "system" && !!window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches)
  if (dark) {
    document.documentElement.classList.add("dark")
    var bar = document.querySelector('meta[name="theme-color"]')
    if (bar) bar.content = "#1d1645"
    var scheme = document.querySelector('meta[name="color-scheme"]')
    if (scheme) scheme.content = "dark"
  }
} catch (e) {
  // Storage blocked: stay light.
}
