import type { ReactElement } from "react"

import type { SidebarNavigationProps } from "../app/contracts"

const commonLinkClasses =
  "block rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-docs-accent"

function itemClasses(href: string, currentPath: string): string {
  return href === currentPath
    ? `${commonLinkClasses} bg-docs-control font-medium text-docs-accent`
    : `${commonLinkClasses} text-docs-muted hover:bg-docs-control hover:text-docs-text`
}

export function SidebarNavigation({ sections, currentPath }: SidebarNavigationProps): ReactElement {
  return (
    <nav
      aria-label="Documentation"
      className="p-6 md:sticky md:top-16 md:max-h-[calc(100vh-4rem)] md:overflow-y-auto"
    >
      <div className="space-y-8">
        {sections.map((section) => (
          <div key={section.title}>
            <h2 className="text-xs font-semibold uppercase tracking-wider text-docs-muted">
              {section.title}
            </h2>
            <ul className="mt-3 space-y-1">
              {section.items.map((item) => {
                const isCurrent = item.href === currentPath
                return (
                  <li key={item.href}>
                    <a
                      href={item.href}
                      aria-current={isCurrent ? "location" : undefined}
                      className={itemClasses(item.href, currentPath)}
                    >
                      {item.label}
                    </a>
                  </li>
                )
              })}
            </ul>
          </div>
        ))}
      </div>
    </nav>
  )
}
