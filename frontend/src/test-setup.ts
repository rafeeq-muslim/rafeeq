/**
 * Shared test setup. The suite runs on a busy self-hosted runner next to other
 * jobs, so async UI waits (findBy*, waitFor) get 5 s instead of the 1 s
 * default; a slow CPU then delays a test instead of failing it.
 */
import { configure } from "@testing-library/react"

configure({ asyncUtilTimeout: 5000 })
