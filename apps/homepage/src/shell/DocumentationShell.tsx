import type { ReactElement } from "react"

import type { DocumentationShellProps } from "../app/contracts"

export function DocumentationShell({
  header,
  navigation,
  children,
}: DocumentationShellProps): ReactElement {
  return (
    <div id="top" className="flex min-h-screen flex-col bg-docs-page font-sans text-docs-text">
      {header}
      <div className="flex flex-1 flex-col md:flex-row">
        <aside className="w-full shrink-0 border-b border-docs-border bg-docs-panel md:w-60 md:border-b-0 md:border-r">
          {navigation}
        </aside>
        <main className="min-w-0 flex-1 px-6 py-10 md:px-12 md:py-14">{children}</main>
      </div>
    </div>
  )
}
