import { useState, type ReactElement } from "react"

import type { InstallationTabsProps } from "../app/contracts"

const tabClasses =
  "-mb-px rounded-t-md border-b-2 px-3 py-2 text-xs font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-docs-accent"

function tabStateClasses(isSelected: boolean): string {
  return isSelected
    ? `${tabClasses} border-docs-accent text-docs-accent`
    : `${tabClasses} border-transparent text-docs-muted hover:text-docs-text`
}

export function InstallationTabs({ methods, initialMethod }: InstallationTabsProps): ReactElement {
  const [selectedLabel, setSelectedLabel] = useState(initialMethod)
  const selected = methods.find((method) => method.label === selectedLabel) ?? methods[0]
  if (!selected) throw new Error("InstallationTabs requires at least one installation method")

  return (
    <div className="mt-4">
      <div
        role="tablist"
        aria-label="Package manager"
        className="flex flex-wrap gap-1 border-b border-docs-border"
      >
        {methods.map((method) => {
          const isSelected = method.label === selected.label
          return (
            <button
              key={method.label}
              type="button"
              role="tab"
              id={`installation-tab-${method.label}`}
              aria-selected={isSelected}
              aria-controls="installation-command"
              onClick={() => setSelectedLabel(method.label)}
              className={tabStateClasses(isSelected)}
            >
              {method.label}
            </button>
          )
        })}
      </div>
      <pre
        id="installation-command"
        role="tabpanel"
        aria-labelledby={`installation-tab-${selected.label}`}
        className="overflow-x-auto rounded-b-lg border border-t-0 border-docs-border bg-docs-code px-4 py-3 font-mono text-sm text-docs-text"
      >
        {selected.command}
      </pre>
    </div>
  )
}
