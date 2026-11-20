import type { ReactNode } from "react"

export interface DocumentationShellProps {
  readonly header: ReactNode
  readonly navigation: ReactNode
  readonly children: ReactNode
}

export interface SiteHeaderProps {
  readonly search: ReactNode
  readonly colorSchemeControl: ReactNode
}

export interface NavigationItem {
  readonly label: string
  readonly href: string
}

export interface NavigationSection {
  readonly title: string
  readonly items: readonly NavigationItem[]
}

export interface SidebarNavigationProps {
  readonly sections: readonly NavigationSection[]
  readonly currentPath: string
}

export interface ArticleProps {
  readonly children: ReactNode
  readonly wide?: boolean
}

export interface InstallationMethod {
  readonly label: string
  readonly command: string
}

export interface InstallationTabsProps {
  readonly methods: readonly InstallationMethod[]
  readonly initialMethod: string
}

export type ColorScheme = "latte" | "mocha"

export interface ColorSchemeController {
  readonly colorScheme: ColorScheme
  readonly setColorScheme: (colorScheme: ColorScheme) => void
}
