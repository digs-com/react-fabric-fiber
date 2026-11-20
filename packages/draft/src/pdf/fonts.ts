import type { PDFPageProxy } from "pdfjs-dist"

const fontLoads = new WeakMap<PDFPageProxy, Promise<ReadonlySet<string>>>()

async function loadFonts(page: PDFPageProxy): Promise<ReadonlySet<string>> {
  if (typeof document === "undefined" || !document.fonts) return new Set()

  try {
    const viewport = page.getViewport({ scale: 0.05 })
    const canvas = document.createElement("canvas")
    canvas.width = Math.max(1, Math.ceil(viewport.width))
    canvas.height = Math.max(1, Math.ceil(viewport.height))
    await page.render({ canvas, viewport }).promise
    await document.fonts.ready
  } catch {
    return new Set()
  }

  const families = new Set<string>()
  document.fonts.forEach((font) => families.add(font.family))
  return families
}

export function loadPageFonts(page: PDFPageProxy): Promise<ReadonlySet<string>> {
  const cached = fontLoads.get(page)
  if (cached) return cached

  const promise = loadFonts(page)
  fontLoads.set(page, promise)
  return promise
}
