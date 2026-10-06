/**
 * Shared test setup. The suite runs on a busy self-hosted runner next to other
 * jobs, so async UI waits (findBy*, waitFor) get 5 s instead of the 1 s
 * default; a slow CPU then delays a test instead of failing it.
 */
import { configure } from "@testing-library/react"

configure({ asyncUtilTimeout: 5000 })

// jsdom has no matchMedia. The theme follows the device by default (PLT-04), so
// any test that mounts the app layout reads it; a test that needs a dark
// device replaces this with its own.
if (typeof window !== "undefined" && typeof window.matchMedia !== "function") {
  window.matchMedia = (query: string) =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }) as MediaQueryList
}
