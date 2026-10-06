/**
 * PLT-15 R1 (error example): a screen whose code was never loaded on this
 * device (PLT-11 loads some screens on first use) cannot open offline. In
 * place of a blank page the learner sees «يحتاج اتصالًا أول مرة» inside the
 * app, with the navigation still there.
 *
 * - `lazy` is a drop-in for React.lazy used by main.tsx: a failed chunk
 *   resolves to the NeedsConnection screen, and the next visit tries again.
 * - `RouteErrorBoundary` wraps the routed screen in AppLayout and catches a
 *   chunk that fails deeper inside a screen; any other error goes on up as
 *   before.
 */
import * as React from "react"

import { NeedsConnection } from "./NeedsConnection"

/** A failed dynamic import: offline, or a file removed by a newer version. */
export function isChunkLoadError(e: unknown): boolean {
  const msg = e instanceof Error ? `${e.name}: ${e.message}` : String(e)
  return /dynamically imported module|Importing a module script failed|Unable to preload CSS|ChunkLoadError|Loading (CSS )?chunk/i.test(msg)
}

type Loader<P> = () => Promise<{ default: React.ComponentType<P> }>

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function lazy<P = any>(load: Loader<P>): React.ComponentType<P> {
  let failed = false
  const make = () =>
    React.lazy<React.ComponentType<P>>(() =>
      load().catch((e: unknown) => {
        if (!isChunkLoadError(e)) throw e
        failed = true
        return { default: (() => <NeedsConnection />) as React.ComponentType<P> }
      }),
    )
  let current = make()

  function LazyRoute(props: P) {
    const C = current as React.ComponentType<P>
    // Leaving the fallback screen: the next visit loads the screen afresh.
    React.useEffect(
      () => () => {
        if (!failed) return
        failed = false
        current = make()
      },
      [],
    )
    return <C {...(props as P & React.JSX.IntrinsicAttributes)} />
  }
  return LazyRoute
}

type BoundaryState = { error: unknown }

type BoundaryProps = { children: React.ReactNode; /** A new path clears the fallback (no remount of the screens). */ resetKey?: string }

export class RouteErrorBoundary extends React.Component<BoundaryProps, BoundaryState> {
  state: BoundaryState = { error: null }

  static getDerivedStateFromError(error: unknown): BoundaryState {
    return { error }
  }

  componentDidUpdate(prev: BoundaryProps) {
    if (prev.resetKey !== this.props.resetKey && this.state.error !== null) this.setState({ error: null })
  }

  render() {
    const { error } = this.state
    if (error === null) return this.props.children
    if (isChunkLoadError(error)) return <NeedsConnection />
    throw error // not ours: the router's error screen, as before
  }
}
