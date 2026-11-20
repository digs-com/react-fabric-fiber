import { useLayoutEffect, useState } from "react"

import type { ColorScheme, ColorSchemeController } from "../app/contracts"

function browserColorScheme(): ColorScheme {
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "mocha" : "latte"
}

export function useColorScheme(): ColorSchemeController {
  const [colorScheme, setColorScheme] = useState<ColorScheme>(browserColorScheme)

  useLayoutEffect(() => {
    document.documentElement.dataset.theme = colorScheme
  }, [colorScheme])

  return { colorScheme, setColorScheme }
}
