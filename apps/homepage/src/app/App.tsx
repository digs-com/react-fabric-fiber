import {
  lazy,
  Suspense,
  useEffect,
  type ComponentType,
  type LazyExoticComponent,
  type ReactElement,
} from "react"
import type { MDXProps } from "mdx/types.js"

import { Article } from "../article/Article"
import { mdxComponents } from "../article/mdx-components"
import { SiteHeader } from "../header/SiteHeader"
import { navigationSections } from "../navigation/navigation"
import { SidebarNavigation } from "../navigation/SidebarNavigation"
import { usePathname } from "../navigation/usePathname"
import { SearchField } from "../search/SearchField"
import { DocumentationShell } from "../shell/DocumentationShell"
import { ColorSchemeToggle } from "../theme/ColorSchemeToggle"

const siteTitle = "react-fabric-fiber documentation"

type DocumentationContent = ComponentType<MDXProps>

function loadPage(
  load: () => Promise<{ default: DocumentationContent }>,
): LazyExoticComponent<DocumentationContent> {
  return lazy(load)
}

interface DocumentationPage {
  readonly title: string
  readonly content: LazyExoticComponent<DocumentationContent>
  readonly wide?: boolean
}

const pages: Readonly<Record<string, DocumentationPage>> = {
  "/": {
    title: "Getting started",
    content: loadPage(() => import("../article/getting-started.mdx")),
  },
  "/interactive-canvas": {
    title: "Interactive canvas",
    content: loadPage(() => import("../article/interactive-canvas.mdx")),
    wide: true,
  },
  "/groups": {
    title: "Groups",
    content: loadPage(() => import("../article/groups.mdx")),
    wide: true,
  },
  "/pdf-pages": {
    title: "PDF pages",
    content: loadPage(() => import("../article/pdf-pages.mdx")),
    wide: true,
  },
  "/viewport-controls": {
    title: "Viewport controls",
    content: loadPage(() => import("../article/viewport-controls.mdx")),
    wide: true,
  },
  "/elements": { title: "Elements", content: loadPage(() => import("../article/elements.mdx")) },
  "/events": { title: "Events", content: loadPage(() => import("../article/events.mdx")) },
  "/hooks": { title: "Hooks", content: loadPage(() => import("../article/hooks.mdx")) },
}

function NotFound(): ReactElement {
  return (
    <div>
      <h1 className="text-3xl font-bold tracking-tight md:text-4xl">Page not found</h1>
      <p className="mt-4 text-sm leading-7 text-docs-text md:text-base">
        No documentation page lives at this path.{" "}
        <a href="/" className="text-docs-accent underline underline-offset-4">
          Return to the getting started page
        </a>
        .
      </p>
    </div>
  )
}

export function App(): ReactElement {
  const pathname = usePathname()
  const page = pages[pathname]
  const Page = page?.content

  useEffect(() => {
    document.title = page ? `${page.title} · ${siteTitle}` : `Page not found · ${siteTitle}`
  }, [page])

  return (
    <DocumentationShell
      header={<SiteHeader search={<SearchField />} colorSchemeControl={<ColorSchemeToggle />} />}
      navigation={<SidebarNavigation sections={navigationSections} currentPath={pathname} />}
    >
      <Article wide={page?.wide}>
        <Suspense fallback={<p className="text-sm text-docs-muted">Loading page…</p>}>
          {Page ? <Page components={mdxComponents} /> : <NotFound />}
        </Suspense>
      </Article>
    </DocumentationShell>
  )
}
