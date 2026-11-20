import { fabric } from "fabric"

import { ClippedImage } from "./clip"
import { applyMatrix, type Matrix } from "./matrix"

export interface PDFImageData {
  width: number
  height: number
  data?: Uint8ClampedArray | Uint8Array
  kind?: number
  bitmap?: CanvasImageSource | null
}

export interface ImagePaintOptions {
  matrix: Matrix
  opacity: number
  color?: string | null
}

const GRAYSCALE_1BPP = 1
const RGB_24BPP = 2
const RGBA_32BPP = 3
const MAX_RASTER_SIDE = 8192
const MAX_RASTER_PIXELS = 4_194_304

function isByteArray(value: unknown): value is Uint8ClampedArray | Uint8Array {
  return (
    ArrayBuffer.isView(value) &&
    !(value instanceof DataView) &&
    Reflect.get(value, "BYTES_PER_ELEMENT") === 1
  )
}

export function asPDFImageData(value: unknown): PDFImageData | null {
  if (!value || typeof value !== "object") return null

  const width = Reflect.get(value, "width")
  const height = Reflect.get(value, "height")
  const data = Reflect.get(value, "data")
  const kind = Reflect.get(value, "kind")
  const bitmap = Reflect.get(value, "bitmap")

  if (typeof width !== "number" || typeof height !== "number") return null
  if (!Number.isFinite(width) || !Number.isFinite(height)) return null
  if (width <= 0 || height <= 0) return null

  if (isByteArray(data) && typeof kind === "number") {
    return { width, height, data, kind }
  }
  if (bitmap && typeof bitmap === "object") {
    return { width, height, bitmap: bitmap as CanvasImageSource }
  }

  return null
}

function toRgb(color: string | null | undefined): [number, number, number] {
  const value = color?.replace("#", "")
  if (!value || (value.length !== 3 && value.length !== 6)) return [0, 0, 0]
  const expanded =
    value.length === 3
      ? value
          .split("")
          .map((part) => part + part)
          .join("")
      : value
  const number = Number.parseInt(expanded, 16)
  return [(number >> 16) & 0xff, (number >> 8) & 0xff, number & 0xff]
}

function rasterSize(image: PDFImageData): [number, number] {
  const scale = Math.min(
    1,
    MAX_RASTER_SIDE / image.width,
    MAX_RASTER_SIDE / image.height,
    Math.sqrt(MAX_RASTER_PIXELS / (image.width * image.height)),
  )
  return [
    Math.max(1, Math.round(image.width * scale)),
    Math.max(1, Math.round(image.height * scale)),
  ]
}

function fillPixels(
  image: PDFImageData & { data: Uint8ClampedArray | Uint8Array; kind: number },
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  color?: string | null,
): void {
  const { data, kind } = image
  const direct = width === image.width && height === image.height

  if (kind === RGBA_32BPP) {
    if (direct) {
      pixels.set(data.subarray(0, pixels.length))
      return
    }
    for (let y = 0; y < height; y += 1) {
      const sourceY = Math.min(image.height - 1, Math.floor((y * image.height) / height))
      for (let x = 0; x < width; x += 1) {
        const sourceX = Math.min(image.width - 1, Math.floor((x * image.width) / width))
        const source = (sourceY * image.width + sourceX) * 4
        const target = (y * width + x) * 4
        pixels[target] = data[source] ?? 0
        pixels[target + 1] = data[source + 1] ?? 0
        pixels[target + 2] = data[source + 2] ?? 0
        pixels[target + 3] = data[source + 3] ?? 255
      }
    }
    return
  }

  if (kind === RGB_24BPP) {
    if (direct) {
      for (let source = 0, target = 0; target < pixels.length; source += 3, target += 4) {
        pixels[target] = data[source] ?? 0
        pixels[target + 1] = data[source + 1] ?? 0
        pixels[target + 2] = data[source + 2] ?? 0
        pixels[target + 3] = 255
      }
      return
    }
    for (let y = 0; y < height; y += 1) {
      const sourceY = Math.min(image.height - 1, Math.floor((y * image.height) / height))
      for (let x = 0; x < width; x += 1) {
        const sourceX = Math.min(image.width - 1, Math.floor((x * image.width) / width))
        const source = (sourceY * image.width + sourceX) * 3
        const target = (y * width + x) * 4
        pixels[target] = data[source] ?? 0
        pixels[target + 1] = data[source + 1] ?? 0
        pixels[target + 2] = data[source + 2] ?? 0
        pixels[target + 3] = 255
      }
    }
    return
  }

  if (kind === GRAYSCALE_1BPP) {
    const mask = color !== undefined
    const [red, green, blue] = toRgb(color)
    const rowBytes = (image.width + 7) >> 3
    if (direct) {
      for (let y = 0; y < height; y += 1) {
        for (let x = 0; x < width; x += 1) {
          const bit = (data[y * rowBytes + (x >> 3)] ?? 0) & (0x80 >> (x & 7))
          const target = (y * width + x) * 4
          if (mask) {
            pixels[target] = red
            pixels[target + 1] = green
            pixels[target + 2] = blue
            pixels[target + 3] = bit ? 0 : 255
          } else {
            const gray = bit ? 255 : 0
            pixels[target] = gray
            pixels[target + 1] = gray
            pixels[target + 2] = gray
            pixels[target + 3] = 255
          }
        }
      }
      return
    }
    for (let y = 0; y < height; y += 1) {
      const sourceY = Math.min(image.height - 1, Math.floor((y * image.height) / height))
      for (let x = 0; x < width; x += 1) {
        const sourceX = Math.min(image.width - 1, Math.floor((x * image.width) / width))
        const bit = (data[sourceY * rowBytes + (sourceX >> 3)] ?? 0) & (0x80 >> (sourceX & 7))
        const target = (y * width + x) * 4
        if (mask) {
          pixels[target] = red
          pixels[target + 1] = green
          pixels[target + 2] = blue
          pixels[target + 3] = bit ? 0 : 255
        } else {
          const gray = bit ? 255 : 0
          pixels[target] = gray
          pixels[target + 1] = gray
          pixels[target + 2] = gray
          pixels[target + 3] = 255
        }
      }
    }
  }
}

function createCanvas(image: PDFImageData, color?: string | null): HTMLCanvasElement | null {
  if (typeof document === "undefined") return null

  const [width, height] = rasterSize(image)
  const canvas = document.createElement("canvas")
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext("2d")
  if (!context) return null

  if (image.bitmap) {
    context.drawImage(image.bitmap, 0, 0, width, height)
    return canvas
  }
  if (!image.data || image.kind === undefined) return null

  const imageData = context.createImageData(width, height)
  fillPixels({ ...image, data: image.data, kind: image.kind }, imageData.data, width, height, color)
  context.putImageData(imageData, 0, 0)
  return canvas
}

export function createImageObject(
  image: PDFImageData,
  options: ImagePaintOptions,
): ClippedImage | null {
  const canvas = createCanvas(image, options.color)
  if (!canvas) return null

  const decomposed = fabric.util.qrDecompose([...options.matrix])
  const [left, top] = applyMatrix(options.matrix, image.width / 2, image.height / 2)

  return new ClippedImage(canvas, {
    originX: "center",
    originY: "center",
    left,
    top,
    scaleX: decomposed.scaleX * (image.width / canvas.width),
    scaleY: decomposed.scaleY * (image.height / canvas.height),
    angle: decomposed.angle,
    skewX: decomposed.skewX,
    skewY: decomposed.skewY,
    opacity: options.opacity,
    selectable: false,
    evented: false,
  })
}
