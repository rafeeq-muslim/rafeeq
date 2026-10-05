/** Registers the service worker (production builds only). */
export function registerServiceWorker() {
  if (import.meta.env.DEV || !("serviceWorker" in navigator)) return
  window.addEventListener("load", () => {
    void navigator.serviceWorker.register("/sw.js", { scope: "/" })
  })
}
