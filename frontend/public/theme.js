// PLT-04: apply the saved appearance before the first paint, so a learner
// who chose dark never sees a light flash. A file, not an inline script:
// the CSP allows same-origin scripts only. Light needs nothing (default).
try {
  var saved = JSON.parse(localStorage.getItem("rafeeq.device") || "{}").state
  if (saved && saved.theme === "dark") {
    document.documentElement.classList.add("dark")
    var bar = document.querySelector('meta[name="theme-color"]')
    if (bar) bar.content = "#1d1645"
  }
} catch (e) {
  // Storage blocked: stay light.
}
