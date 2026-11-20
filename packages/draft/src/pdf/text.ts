import { fabric } from "fabric"

import { multiply, type Matrix } from "./matrix"

export interface TextItem {
  str: string
  transform: number[]
  width: number
  height: number
  fontName?: string
  fontFamily?: string
  substituted?: boolean
  fill?: string
  ascent?: number
  vertical?: boolean
}

export interface ReplacementGlyph {
  fontName: string
  character: string
}

export interface TextColor {
  fontName: string
  color: string
  text: string
  visible: boolean
}

export interface TextContent {
  items: readonly TextItem[]
}

export interface TextOptions {
  transform: Matrix
  offset: readonly [number, number]
  opacity: number
  embeddedFonts: ReadonlySet<string>
  replacementGlyphs: readonly ReplacementGlyph[]
  colors: readonly TextColor[]
}

const FALLBACK_FONT = "sans-serif"
const FALLBACK_ASCENT = 0.8

interface ColorRun {
  color: string
  remaining: string
  visible: boolean
}

const normalizeColorText = (value: string): string => value.normalize("NFKC").replace(/\s+/g, "")

export function createTextObjects(content: TextContent, options: TextOptions): fabric.Object[] {
  const objects: fabric.Object[] = []
  const replacements = new Map<string, string[]>()

  for (const glyph of options.replacementGlyphs) {
    const queue = replacements.get(glyph.fontName) ?? []
    queue.push(glyph.character)
    replacements.set(glyph.fontName, queue)
  }

  const nextReplacement = (fontName: string): string | undefined =>
    replacements.get(fontName)?.shift()

  const colors = new Map<string, ColorRun[]>()
  const lastColors = new Map<string, string>()

  for (const event of options.colors) {
    const queue = colors.get(event.fontName) ?? []
    queue.push({
      color: event.color,
      remaining: normalizeColorText(event.text),
      visible: event.visible,
    })
    colors.set(event.fontName, queue)
  }

  const takeColor = (fontName: string, text: string): ColorRun | undefined => {
    const queue = colors.get(fontName)
    if (!queue) return undefined

    let remaining = normalizeColorText(text)
    if (remaining.length === 0) {
      return queue.find((run) => run.remaining.length > 0)
    }

    let matched: ColorRun | undefined

    while (queue.length > 0) {
      const run = queue[0]
      if (!run) break
      if (run.remaining.length === 0) {
        queue.shift()
        continue
      }

      const index = run.remaining.indexOf(remaining)
      if (index !== -1) {
        run.remaining = run.remaining.slice(index + remaining.length)
        return matched ?? run
      }

      if (remaining.startsWith(run.remaining)) {
        matched ??= run
        remaining = remaining.slice(run.remaining.length)
        queue.shift()
        continue
      }

      queue.shift()
    }

    return matched
  }

  for (const item of content.items) {
    if (item.str.trim().length === 0) continue

    const transform = multiply(options.transform, item.transform as unknown as Matrix)
    const fontSize = Math.hypot(transform[2], transform[3])
    if (!Number.isFinite(fontSize) || fontSize <= 0) continue

    const ascent = fontSize * (item.ascent || FALLBACK_ASCENT)
    let angle = Math.atan2(transform[1], transform[0])
    if (item.vertical) angle += Math.PI / 2

    const left = transform[4] + (angle === 0 ? 0 : ascent * Math.sin(angle))
    const top = transform[5] - ascent * Math.cos(angle)

    const embedded =
      !item.substituted && item.fontName ? options.embeddedFonts.has(item.fontName) : false
    const text = embedded
      ? item.str.replace(/\uFFFD/g, () => {
          const replacement = item.fontName ? nextReplacement(item.fontName) : undefined
          return replacement ?? "\uFFFD"
        })
      : item.str

    const nextColor = item.fontName ? takeColor(item.fontName, item.str) : undefined
    const visible = nextColor?.visible ?? true
    if (!visible) continue

    const fill =
      nextColor?.color ??
      (item.fontName ? lastColors.get(item.fontName) : undefined) ??
      item.fill ??
      "#000000"
    if (item.fontName) lastColors.set(item.fontName, fill)

    const object = new fabric.Text(text, {
      left: left + options.offset[0],
      top: top + options.offset[1],
      fontSize,
      fontFamily: embedded && item.fontName ? item.fontName : item.fontFamily || FALLBACK_FONT,
      fill,
      angle: (angle * 180) / Math.PI,
      originX: "left",
      originY: "top",
      opacity: options.opacity,
      selectable: false,
      evented: false,
    })

    const targetWidth = item.vertical ? item.height : item.width
    const measuredWidth = object.width ?? 0
    if (targetWidth > 0 && measuredWidth > 0) {
      object.set({ scaleX: targetWidth / measuredWidth })
    }

    objects.push(object)
  }

  return objects
}
