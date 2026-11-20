import type { fabric } from "fabric"
import type { PDFPageProxy } from "pdfjs-dist"

import { parseColor } from "./colors"
import { loadPageFonts } from "./fonts"
import { asPDFImageData, type PDFImageData } from "./images"
import type { Matrix } from "./matrix"
import { OPERATORS } from "./operators"
import {
  createTextObjects,
  type ReplacementGlyph,
  type TextColor,
  type TextContent,
  type TextItem,
} from "./text"
import { createVectorObjects, type OperatorList } from "./vectors"

interface TextStyle {
  fontFamily?: string
  fontSubstitution?: string
  fontSubstitutionLoadedName?: string
  ascent?: number
  vertical?: boolean
}

interface TextContentItem {
  str?: string
  transform?: number[]
  width?: number
  height?: number
  fontName?: string
}

interface TextContentResult {
  items: readonly TextContentItem[]
  styles: Record<string, TextStyle>
}

export interface PDFPageBuildOptions {
  scale: number
  rotation: number
  position: readonly [number, number]
  opacity: number
}

export interface PDFPageObjects {
  width: number
  height: number
  objects: fabric.Object[]
}

interface PDFObjectStore {
  get(id: string, callback: (data: unknown) => void, errorCallback: (error: unknown) => void): void
}

interface PDFOptionalContent {
  isVisible(properties: unknown): boolean
}

function readObjectStore(page: PDFPageProxy, name: "objs" | "commonObjs"): PDFObjectStore | null {
  const owner = Reflect.get(page, name)
  if (!owner || typeof owner !== "object") return null

  const get = Reflect.get(owner, "get")
  if (typeof get !== "function") return null

  return owner as PDFObjectStore
}

async function loadOptionalContent(page: PDFPageProxy): Promise<PDFOptionalContent | null> {
  const transport = Reflect.get(page, "_transport")
  if (!transport || typeof transport !== "object") return null
  const load = Reflect.get(transport, "getOptionalContentConfig")
  if (typeof load !== "function") return null

  try {
    const config = await (load.call(transport, 0) as Promise<PDFOptionalContent>)
    return typeof config.isVisible === "function" ? config : null
  } catch {
    return null
  }
}

function objectStoreFor(page: PDFPageProxy, id: string): PDFObjectStore | null {
  return readObjectStore(page, id.startsWith("g_") ? "commonObjs" : "objs")
}

function collectImageIds(operators: OperatorList): string[] {
  const ids = new Set<string>()

  for (let index = 0; index < operators.fnArray.length; index += 1) {
    const operator = operators.fnArray[index]
    const args = operators.argsArray[index] ?? []

    if (operator === OPERATORS.paintImageXObject && typeof args[0] === "string") {
      ids.add(args[0])
      continue
    }

    if (operator === OPERATORS.paintImageMaskXObject) {
      const reference = args[0]
      const id = reference && typeof reference === "object" ? Reflect.get(reference, "data") : null
      if (typeof id === "string") ids.add(id)
    }
  }

  return [...ids]
}

async function loadPageImages(
  page: PDFPageProxy,
  operators: OperatorList,
): Promise<Map<string, PDFImageData>> {
  const images = new Map<string, PDFImageData>()
  const ids = collectImageIds(operators)

  await Promise.all(
    ids.map((id) => {
      const store = objectStoreFor(page, id)
      if (!store) return Promise.resolve()

      let settle: (data: unknown) => void = () => undefined
      const promise = new Promise<void>((resolve) => {
        settle = (data: unknown): void => {
          const image = asPDFImageData(data)
          if (image) images.set(id, image)
          resolve()
        }
      })
      try {
        store.get(id, settle, () => settle(null))
      } catch {
        settle(null)
      }
      return promise
    }),
  )

  return images
}

const INVISIBLE_TEXT_RENDERING_MODES = new Set([3, 7])

function collectTextColors(
  operators: OperatorList,
  isVisible: (properties: unknown) => boolean,
): TextColor[] {
  const colors: TextColor[] = []
  const stack: Array<{ fill: string; fontName: string; renderingMode: number }> = []
  const contentStack: boolean[] = []
  let fill = "#000000"
  let fontName = ""
  let renderingMode = 0
  let visible = true

  for (let index = 0; index < operators.fnArray.length; index += 1) {
    const operator = operators.fnArray[index]
    const args = operators.argsArray[index] ?? []

    if (operator === OPERATORS.save) {
      stack.push({ fill, fontName, renderingMode })
    } else if (operator === OPERATORS.restore) {
      const previous = stack.pop()
      if (previous) ({ fill, fontName, renderingMode } = previous)
    } else if (operator === OPERATORS.beginMarkedContentProps) {
      contentStack.push(visible)
      if (args[0] === "OC") visible = visible && isVisible(args[1])
    } else if (operator === OPERATORS.endMarkedContent) {
      visible = contentStack.pop() ?? true
    } else if (operator === OPERATORS.setFont) {
      const name = args[0]
      if (typeof name === "string") fontName = name
    } else if (operator === OPERATORS.setTextRenderingMode) {
      const mode = args[0]
      if (typeof mode === "number") renderingMode = mode
    } else if (
      operator === OPERATORS.setFillGray ||
      operator === OPERATORS.setFillRGBColor ||
      operator === OPERATORS.setFillCMYKColor
    ) {
      fill = parseColor(args) ?? "#000000"
    } else if (operator === OPERATORS.setFillTransparent) {
      fill = "transparent"
    } else if (operator === OPERATORS.showText && fontName && Array.isArray(args[0])) {
      const text = (args[0] as unknown[])
        .filter((glyph) => typeof glyph === "object" && glyph !== null)
        .map((glyph) => Reflect.get(glyph, "unicode"))
        .filter((value): value is string => typeof value === "string")
        .join("")
      if (text.length > 0) {
        colors.push({
          fontName,
          color: fill,
          text,
          visible: visible && !INVISIBLE_TEXT_RENDERING_MODES.has(renderingMode),
        })
      }
    }
  }

  return colors
}

function collectReplacementGlyphs(operators: OperatorList): ReplacementGlyph[] {
  const replacements: ReplacementGlyph[] = []
  let fontName = ""

  for (let index = 0; index < operators.fnArray.length; index += 1) {
    const operator = operators.fnArray[index]
    const args = operators.argsArray[index] ?? []

    if (operator === OPERATORS.setFont) {
      const name = args[0]
      if (typeof name === "string") fontName = name
      continue
    }

    if (operator !== OPERATORS.showText || !fontName || !Array.isArray(args[0])) continue

    for (const glyph of args[0] as unknown[]) {
      if (typeof glyph !== "object" || glyph === null) continue
      const unicode = "unicode" in glyph ? glyph.unicode : undefined
      const fontChar = "fontChar" in glyph ? glyph.fontChar : undefined
      if (unicode === "\uFFFD" && typeof fontChar === "string" && fontChar.length > 0) {
        replacements.push({ fontName, character: fontChar })
      }
    }
  }

  return replacements
}

export async function buildPDFPage(
  page: PDFPageProxy,
  options: PDFPageBuildOptions,
): Promise<PDFPageObjects> {
  const viewport = page.getViewport({ scale: options.scale, rotation: options.rotation })
  const operators = await page.getOperatorList()
  const optionalContent = await loadOptionalContent(page)
  const isVisible = (properties: unknown): boolean =>
    optionalContent ? optionalContent.isVisible(properties) : true
  const images = await loadPageImages(page, operators as unknown as OperatorList)
  const fonts = await loadPageFonts(page)
  const textContent = await page.getTextContent()

  const content = textContent as unknown as TextContentResult
  const items = content.items.flatMap((item): TextItem[] => {
    if (typeof item.str !== "string" || !Array.isArray(item.transform)) return []
    if (!item.transform.every((value) => Number.isFinite(value))) return []
    const style = item.fontName ? content.styles[item.fontName] : undefined
    return [
      {
        str: item.str,
        transform: item.transform,
        width: typeof item.width === "number" ? item.width : 0,
        height: typeof item.height === "number" ? item.height : 0,
        fontName: item.fontName,
        fontFamily: style?.fontSubstitution ?? style?.fontFamily,
        substituted: Boolean(style?.fontSubstitution),
        ascent: style?.ascent,
        vertical: style?.vertical,
      },
    ]
  })

  const transform = viewport.transform as unknown as Matrix
  const offset = options.position
  const objects = [
    ...createVectorObjects(operators as unknown as OperatorList, {
      viewportTransform: transform,
      viewport: { minX: 0, minY: 0, maxX: viewport.width, maxY: viewport.height },
      offset,
      opacity: options.opacity,
      isVisible,
      getImage: (id) => images.get(id) ?? null,
    }),
    ...createTextObjects({ items } satisfies TextContent, {
      transform,
      offset,
      opacity: options.opacity,
      embeddedFonts: fonts,
      replacementGlyphs: collectReplacementGlyphs(operators as unknown as OperatorList),
      colors: collectTextColors(operators as unknown as OperatorList, isVisible),
    }),
  ]

  return { width: viewport.width, height: viewport.height, objects }
}
