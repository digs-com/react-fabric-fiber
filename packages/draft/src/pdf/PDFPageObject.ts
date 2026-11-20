import { fabric } from "fabric"
import type { PDFPageProxy } from "pdfjs-dist"

import { buildPDFPage, type PDFPageObjects } from "./page"

export type PDFPageObjectOptions = fabric.IGroupOptions

interface LocalBounds {
  minX: number
  minY: number
  maxX: number
  maxY: number
}

const DEFAULT_FILL = "#ffffff"
const SETTLE_DELAY_MS = 120
const BASE_MAX_SIDE = 4096
const BASE_MAX_PIXELS = 16_777_216
const BOUNDS_PADDING = 2

function centerContent(
  objects: readonly fabric.Object[],
  width: number,
  height: number,
): fabric.Object[] {
  const centerX = width / 2
  const centerY = height / 2
  return objects.map((object): fabric.Object => {
    object.objectCaching = false
    object.set({
      left: (object.left ?? 0) - centerX,
      top: (object.top ?? 0) - centerY,
    })
    return object
  })
}

function baseScaleFor(width: number, height: number): number {
  if (width <= 0 || height <= 0) return 1
  const side = BASE_MAX_SIDE / Math.max(width, height)
  const area = Math.sqrt(BASE_MAX_PIXELS / (width * height))
  return Math.min(1, side, area)
}

function intersectsBounds(first: LocalBounds, second: LocalBounds): boolean {
  return (
    first.minX <= second.maxX &&
    first.maxX >= second.minX &&
    first.minY <= second.maxY &&
    first.maxY >= second.minY
  )
}

export class PDFPageObject extends fabric.Group {
  private content: fabric.Object[] = []
  private bounds = new WeakMap<fabric.Object, LocalBounds>()
  private baseCanvas: HTMLCanvasElement | null = null
  private settled = true
  private settleTimer: NodeJS.Timeout | undefined = undefined
  private lastTransform: string | null = null

  static async create(
    page: PDFPageProxy,
    options: PDFPageObjectOptions = {},
  ): Promise<PDFPageObject> {
    const built = await buildPDFPage(page, {
      scale: 1,
      rotation: page.rotate ?? 0,
      position: [0, 0],
      opacity: 1,
    })
    return new PDFPageObject(options, built)
  }

  private constructor(options: PDFPageObjectOptions, built: PDFPageObjects) {
    const { width, height } = built
    const content = centerContent(built.objects, width, height)

    super(
      content,
      {
        originX: "left",
        originY: "top",
        left: 0,
        top: 0,
        scaleX: 1,
        scaleY: 1,
        opacity: 1,
        objectCaching: false,
        selectable: false,
        evented: false,
        subTargetCheck: false,
        ...options,
        fill: options.fill ?? DEFAULT_FILL,
        width,
        height,
      },
      true,
    )

    this.content = content

    this.updateBounds()
    this.buildBase()
    this.dirty = true
    this.setCoords()
  }

  shouldCache(): boolean {
    return false
  }

  drawObject(ctx: CanvasRenderingContext2D): void {
    this.trackTransform()
    this.drawFill(ctx)
    if (!this.settled && this.drawBase(ctx)) return
    this.drawVisible(ctx)
  }

  private updateBounds(): void {
    this.bounds = new WeakMap()
    for (const object of this.content) {
      const rect = object.getBoundingRect(true, true)
      this.bounds.set(object, {
        minX: rect.left - BOUNDS_PADDING,
        minY: rect.top - BOUNDS_PADDING,
        maxX: rect.left + rect.width + BOUNDS_PADDING,
        maxY: rect.top + rect.height + BOUNDS_PADDING,
      })
    }
  }

  private trackTransform(): void {
    const viewport = this.canvas?.viewportTransform
    const transform = this.calcTransformMatrix()
    const key = [
      viewport?.join(":") ?? "",
      transform.join(":"),
      this.width ?? 0,
      this.height ?? 0,
    ].join("|")
    if (this.lastTransform === null) {
      this.lastTransform = key
      return
    }
    if (key === this.lastTransform) return
    this.lastTransform = key
    this.beginInteraction()
  }

  private beginInteraction(): void {
    this.settled = false
    clearTimeout(this.settleTimer)
    this.settleTimer = setTimeout(() => {
      this.settleTimer = undefined
      this.settled = true
      this.canvas?.requestRenderAll()
    }, SETTLE_DELAY_MS)
  }

  private drawFill(ctx: CanvasRenderingContext2D): void {
    if (!this.fill) return
    const width = this.width ?? 0
    const height = this.height ?? 0
    ctx.beginPath()
    ctx.rect(-width / 2, -height / 2, width, height)
    this._renderFill(ctx)
  }

  private drawBase(ctx: CanvasRenderingContext2D): boolean {
    const canvas = this.baseCanvas
    if (!canvas) return false
    const width = this.width ?? 0
    const height = this.height ?? 0
    ctx.drawImage(canvas, 0, 0, canvas.width, canvas.height, -width / 2, -height / 2, width, height)
    return true
  }

  private drawVisible(ctx: CanvasRenderingContext2D): void {
    const visible = this.visibleBounds()
    for (const object of this.getObjects()) {
      if (!visible) {
        object.render(ctx)
        continue
      }
      const bounds = this.bounds.get(object)
      if (!bounds || intersectsBounds(bounds, visible)) object.render(ctx)
    }
  }

  private visibleBounds(): LocalBounds | null {
    const canvas = this.canvas
    const viewport = canvas?.viewportTransform
    if (!canvas || !viewport) return null
    const width = canvas.getWidth()
    const height = canvas.getHeight()
    if (width <= 0 || height <= 0) return null

    const inverseViewport = fabric.util.invertTransform(viewport)
    const worldCorners = [
      fabric.util.transformPoint(new fabric.Point(0, 0), inverseViewport),
      fabric.util.transformPoint(new fabric.Point(width, 0), inverseViewport),
      fabric.util.transformPoint(new fabric.Point(width, height), inverseViewport),
      fabric.util.transformPoint(new fabric.Point(0, height), inverseViewport),
    ]
    const inversePage = fabric.util.invertTransform(this.calcTransformMatrix())
    const localCorners = worldCorners.map((point) => fabric.util.transformPoint(point, inversePage))
    const xs = localCorners.map((point) => point.x)
    const ys = localCorners.map((point) => point.y)
    return {
      minX: Math.min(...xs) - BOUNDS_PADDING,
      minY: Math.min(...ys) - BOUNDS_PADDING,
      maxX: Math.max(...xs) + BOUNDS_PADDING,
      maxY: Math.max(...ys) + BOUNDS_PADDING,
    }
  }

  private buildBase(): void {
    const width = this.width ?? 0
    const height = this.height ?? 0
    if (width <= 0 || height <= 0 || this.content.length === 0) return

    const scale = baseScaleFor(width, height)
    const canvas = fabric.util.createCanvasElement()
    canvas.width = Math.max(1, Math.ceil(width * scale))
    canvas.height = Math.max(1, Math.ceil(height * scale))
    const ctx = canvas.getContext("2d")
    if (!ctx) return

    ctx.translate(canvas.width / 2, canvas.height / 2)
    ctx.scale(scale, scale)
    const transformState = this as unknown as { _transformDone: boolean }
    transformState._transformDone = true
    try {
      for (const object of this.getObjects()) object.render(ctx)
    } finally {
      transformState._transformDone = false
    }

    this.baseCanvas = canvas
    this.canvas?.requestRenderAll()
  }
}
