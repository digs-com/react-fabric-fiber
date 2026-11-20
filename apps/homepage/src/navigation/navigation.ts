import type { NavigationSection } from "../app/contracts"

export const navigationSections: readonly NavigationSection[] = [
  {
    title: "Getting started",
    items: [{ label: "Getting started", href: "/" }],
  },
  {
    title: "Demos",
    items: [
      { label: "Interactive canvas", href: "/interactive-canvas" },
      { label: "Groups", href: "/groups" },
      { label: "PDF pages", href: "/pdf-pages" },
      { label: "Viewport controls", href: "/viewport-controls" },
    ],
  },
  {
    title: "Core concepts",
    items: [
      { label: "Elements", href: "/elements" },
      { label: "Events", href: "/events" },
      { label: "Hooks", href: "/hooks" },
    ],
  },
]
