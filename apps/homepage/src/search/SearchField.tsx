import type { ReactElement } from "react"

export function SearchField(): ReactElement {
  return (
    <input
      type="search"
      name="search"
      placeholder="Search documentation"
      aria-label="Search documentation"
      className="w-full rounded-md border border-docs-border bg-docs-control px-4 py-2.5 text-sm text-docs-text outline-none placeholder:text-docs-muted focus:border-docs-accent focus:ring-2 focus:ring-docs-accent"
    />
  )
}
