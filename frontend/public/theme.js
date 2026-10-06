// PLT-04: apply the appearance before the first paint, so nobody sees a
// flash of the wrong mode. A file, not an inline script: the CSP allows
// same-origin scripts only. The default (nothing saved, or "system") follows
// the device; an explicit "light" or "dark" wins. Kept in step with
// src/app/lib/theme.ts (BAR_COLOR) and the store migration in stores/device.ts.
try {
  var stored = JSON.parse(localStorage.getItem("rafeeq.device") || "{}")
  var saved = stored.state
  var choice = saved && saved.theme
  // Store v1 saved "light" as its default; it is migrated to "system".
  if (!stored.version || stored.version < 2) {
    if (choice === "light") choice = "system"
  }
  var deviceDark = !!window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches
  var dark = choice === "dark" || (choice !== "light" && deviceDark)
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
