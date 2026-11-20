import type { ReactElement } from "react"

import { useColorScheme } from "./useColorScheme"

function SunIcon(): ReactElement {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      className="h-5 w-5"
    >
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M19.1 4.9l-1.4 1.4M6.3 17.7l-1.4 1.4" />
    </svg>
  )
}

function MoonIcon(): ReactElement {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-5 w-5"
    >
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  )
}

export function ColorSchemeToggle(): ReactElement {
  const { colorScheme, setColorScheme } = useColorScheme()
  const isMocha = colorScheme === "mocha"
  const nextScheme = isMocha ? "latte" : "mocha"

  return (
    <button
      type="button"
      onClick={() => setColorScheme(nextScheme)}
      aria-label={isMocha ? "Switch to light mode" : "Switch to dark mode"}
      className="inline-flex h-9 w-9 items-center justify-center rounded-md text-docs-muted hover:text-docs-text focus:outline-none focus-visible:ring-2 focus-visible:ring-docs-accent focus-visible:ring-offset-2 focus-visible:ring-offset-docs-panel"
    >
      {isMocha ? <SunIcon /> : <MoonIcon />}
    </button>
  )
}
