import type { ReactElement } from "react"

import type { SiteHeaderProps } from "../app/contracts"

const iconLinkClasses =
  "inline-flex h-9 w-9 items-center justify-center rounded-md text-docs-muted hover:text-docs-text focus:outline-none focus-visible:ring-2 focus-visible:ring-docs-accent focus-visible:ring-offset-2 focus-visible:ring-offset-docs-panel"

function GitHubIcon(): ReactElement {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5">
      <path d="M12 2C6.48 2 2 6.58 2 12.25c0 4.53 2.87 8.37 6.84 9.73.5.1.68-.22.68-.49l-.01-1.7c-2.78.62-3.37-1.37-3.37-1.37-.45-1.19-1.11-1.5-1.11-1.5-.91-.64.07-.63.07-.63 1 .07 1.53 1.06 1.53 1.06.89 1.57 2.34 1.12 2.91.86.09-.67.35-1.12.63-1.38-2.22-.26-4.56-1.14-4.56-5.07 0-1.12.39-2.03 1.03-2.75-.1-.26-.45-1.31.1-2.73 0 0 .84-.28 2.75 1.05a9.36 9.36 0 0 1 5 0c1.91-1.33 2.75-1.05 2.75-1.05.55 1.42.2 2.47.1 2.73.64.72 1.03 1.63 1.03 2.75 0 3.94-2.34 4.8-4.57 5.06.36.32.68.94.68 1.9l-.01 2.81c0 .27.18.6.69.49A10.26 10.26 0 0 0 22 12.25C22 6.58 17.52 2 12 2z" />
    </svg>
  )
}

export function SiteHeader({ search, colorSchemeControl }: SiteHeaderProps): ReactElement {
  return (
    <header className="sticky top-0 z-20 flex min-h-16 flex-wrap items-center gap-4 border-b border-docs-border bg-docs-panel px-5 py-3 md:flex-nowrap md:px-8">
      <a href="#introduction" className="shrink-0 text-sm font-semibold text-docs-text">
        react-fabric-fiber
      </a>
      <div className="order-3 w-full md:order-none md:w-auto md:max-w-[620px] md:flex-1">
        {search}
      </div>
      <div className="ml-auto flex shrink-0 items-center gap-1">
        <a
          href="https://github.com/digs-com/react-fabric-fiber"
          target="_blank"
          rel="noreferrer"
          aria-label="react-fabric-fiber on GitHub"
          className={iconLinkClasses}
        >
          <GitHubIcon />
        </a>
        {colorSchemeControl}
      </div>
    </header>
  )
}
