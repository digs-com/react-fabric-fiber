import { fabric } from "fabric"

import { drawWithClips, type Clipped, type RenderClip } from "./clip"
import { parseColor } from "./colors"
import { asPDFImageData, createImageObject, type PDFImageData } from "./images"
import { applyMatrix, asMatrix, matrixScale, multiply, type Matrix } from "./matrix"
import { OPERATORS as OPS } from "./operators"
import { createPathBuilder, pathFromDrawCommands, type Bounds } from "./path"

interface GraphicsState {
  lineWidth: number
  lineCap: CanvasLineCap
  lineJoin: CanvasLineJoin
  miterLimit: number
  dash: number[]
  dashOffset: number
  fill: string | null
  stroke: string | null
  fillAlpha: number
  strokeAlpha: number
}

interface ClipRegion {
  path: string
  bounds: Bounds
  fillRule: "nonzero" | "evenodd"
  parent: ClipRegion | null
  object?: fabric.Object
  path2d?: Path2D
}

class PDFPath extends fabric.Path implements Clipped {
  hairline?: boolean
  clips?: readonly RenderClip[]

  drawObject(ctx: CanvasRenderingContext2D): void {
    drawWithClips(this, ctx, () => super.drawObject(ctx))
  }

  _renderStroke(ctx: CanvasRenderingContext2D): void {
    if (!this.hairline) {
      super._renderStroke(ctx)
      return
    }

    const previous = this.strokeWidth
    const scale = contextScale(ctx)
    if (scale > 0) this.strokeWidth = HAIRLINE_STROKE_WIDTH / scale
    super._renderStroke(ctx)
    this.strokeWidth = previous
  }
}

interface SavedState {
  ctm: Matrix
  state: GraphicsState
  clip: ClipRegion | null
}

export interface OperatorList {
  fnArray: readonly number[]
  argsArray: readonly (readonly unknown[] | null | undefined)[]
}

export interface VectorOptions {
  viewportTransform: Matrix
  viewport: Bounds
  offset: readonly [number, number]
  opacity: number
  isVisible(properties: unknown): boolean
  getImage(id: string): PDFImageData | null
}

const LINE_CAPS: readonly CanvasLineCap[] = ["butt", "round", "square"]
const LINE_JOINS: readonly CanvasLineJoin[] = ["miter", "round", "bevel"]
// PDF 32000-1:2008 §8.4.3.2: line width 0 is the thinnest line at device resolution — one device pixel.
const HAIRLINE_STROKE_WIDTH = 1

const createGraphicsState = (): GraphicsState => ({
  lineWidth: 1,
  lineCap: "butt",
  lineJoin: "miter",
  miterLimit: 10,
  dash: [],
  dashOffset: 0,
  fill: "#000000",
  stroke: "#000000",
  fillAlpha: 1,
  strokeAlpha: 1,
})

const copyState = (state: GraphicsState): GraphicsState => ({ ...state, dash: [...state.dash] })

const numberAt = (args: readonly unknown[], index: number): number => {
  const value = args[index]
  return typeof value === "number" ? value : 0
}

const toMatrix = (args: readonly unknown[]): Matrix => [
  numberAt(args, 0),
  numberAt(args, 1),
  numberAt(args, 2),
  numberAt(args, 3),
  numberAt(args, 4),
  numberAt(args, 5),
]

const paintKind = (operator: number): { fill: boolean; stroke: boolean; evenOdd: boolean } => ({
  fill:
    operator === OPS.fill ||
    operator === OPS.eoFill ||
    operator === OPS.fillStroke ||
    operator === OPS.eoFillStroke ||
    operator === OPS.closeFillStroke ||
    operator === OPS.closeEOFillStroke ||
    operator === OPS.rawFillPath,
  stroke:
    operator === OPS.stroke ||
    operator === OPS.closeStroke ||
    operator === OPS.fillStroke ||
    operator === OPS.eoFillStroke ||
    operator === OPS.closeFillStroke ||
    operator === OPS.closeEOFillStroke,
  evenOdd:
    operator === OPS.eoFill || operator === OPS.eoFillStroke || operator === OPS.closeEOFillStroke,
})

const applyGState = (state: GraphicsState, args: readonly unknown[]): void => {
  const entries = args[0]
  if (!Array.isArray(entries)) return

  for (const entry of entries) {
    if (!Array.isArray(entry)) continue
    const [key, value] = entry as [unknown, unknown]
    if (key === "ca" && typeof value === "number") state.fillAlpha = value
    else if (key === "CA" && typeof value === "number") state.strokeAlpha = value
    else if (key === "LW" && typeof value === "number") state.lineWidth = value
    else if (key === "LC" && typeof value === "number") {
      state.lineCap = LINE_CAPS[value] ?? "butt"
    } else if (key === "LJ" && typeof value === "number") {
      state.lineJoin = LINE_JOINS[value] ?? "miter"
    } else if (key === "ML" && typeof value === "number") state.miterLimit = value
    else if (key === "D" && Array.isArray(value)) {
      const [dash, offset] = value as [unknown, unknown]
      if (Array.isArray(dash)) {
        state.dash = dash.filter((entry): entry is number => typeof entry === "number")
      }
      if (typeof offset === "number") state.dashOffset = offset
    }
  }
}

const EMPTY_BOUNDS: Bounds = {
  minX: Infinity,
  minY: Infinity,
  maxX: -Infinity,
  maxY: -Infinity,
}

const intersectsBounds = (first: Bounds, second: Bounds): boolean =>
  first.minX <= second.maxX &&
  first.maxX >= second.minX &&
  first.minY <= second.maxY &&
  first.maxY >= second.minY

const BOUNDS_TOLERANCE = 1e-6

const coversBounds = (outer: Bounds, inner: Bounds): boolean =>
  outer.minX <= inner.minX + BOUNDS_TOLERANCE &&
  outer.minY <= inner.minY + BOUNDS_TOLERANCE &&
  outer.maxX >= inner.maxX - BOUNDS_TOLERANCE &&
  outer.maxY >= inner.maxY - BOUNDS_TOLERANCE

const intersectBounds = (first: Bounds, second: Bounds): Bounds => {
  const intersection = {
    minX: Math.max(first.minX, second.minX),
    minY: Math.max(first.minY, second.minY),
    maxX: Math.min(first.maxX, second.maxX),
    maxY: Math.min(first.maxY, second.maxY),
  }
  return intersection.minX <= intersection.maxX && intersection.minY <= intersection.maxY
    ? intersection
    : EMPTY_BOUNDS
}

const createClipRegion = (
  path: string,
  bounds: Bounds | null,
  fillRule: "nonzero" | "evenodd",
  parent: ClipRegion | null,
): ClipRegion => {
  const regionBounds = bounds ?? EMPTY_BOUNDS
  return {
    path,
    bounds: parent ? intersectBounds(parent.bounds, regionBounds) : regionBounds,
    fillRule,
    parent,
  }
}

const clipObject = (clip: ClipRegion): fabric.Object => {
  if (clip.object) return clip.object

  const object = new fabric.Path(clip.path, {
    absolutePositioned: true,
    fill: "#000000",
    stroke: null,
    fillRule: clip.fillRule,
    selectable: false,
    evented: false,
  } as never)
  if (clip.parent) object.clipPath = clipObject(clip.parent)
  clip.object = object
  return object
}

const clipChain = (clip: ClipRegion): ClipRegion[] => {
  const chain: ClipRegion[] = []
  for (let region: ClipRegion | null = clip; region; region = region.parent) {
    chain.unshift(region)
  }
  return chain
}

const clipPath2d = (clip: ClipRegion): Path2D | null => {
  if (typeof Path2D === "undefined") return null
  if (!clip.path2d) clip.path2d = new Path2D(clip.path)
  return clip.path2d
}

const contextScale = (ctx: CanvasRenderingContext2D): number => {
  const { a, b, c, d } = ctx.getTransform()
  return Math.max(Math.hypot(a, b), Math.hypot(c, d))
}

const installClip = (object: fabric.Object & Clipped, clip: ClipRegion): void => {
  const clips: RenderClip[] = []

  for (const region of clipChain(clip)) {
    const path = clipPath2d(region)
    if (!path) {
      object.clipPath = clipObject(clip)
      return
    }
    const clipPath = clipObject(region) as fabric.Path
    clips.push({
      path,
      fillRule: region.fillRule,
      matrix: clipPath.calcTransformMatrix() as unknown as Matrix,
      offsetX: clipPath.pathOffset.x,
      offsetY: clipPath.pathOffset.y,
    })
  }

  object.clips = clips
}

const applyPaint = (
  operator: number,
  path: string,
  bounds: Bounds | null,
  state: GraphicsState,
  matrix: Matrix,
  options: VectorOptions,
  objects: fabric.Object[],
  clip: ClipRegion | null,
): void => {
  const kind = paintKind(operator)
  if (!kind.fill && !kind.stroke) return

  const fill = kind.fill ? state.fill : null
  const stroke = kind.stroke ? state.stroke : null
  if (fill === null && stroke === null) return
  if (clip && (!bounds || !intersectsBounds(bounds, clip.bounds))) return

  const scale = matrixScale(matrix)
  const hairline = kind.stroke && state.lineWidth === 0
  const strokeWidth = kind.stroke ? (hairline ? HAIRLINE_STROKE_WIDTH : state.lineWidth * scale) : 0
  const alpha =
    options.opacity * Math.min(kind.fill ? state.fillAlpha : 1, kind.stroke ? state.strokeAlpha : 1)
  if (alpha <= 0) return

  const object = new PDFPath(path, {
    fill,
    stroke,
    strokeWidth,
    strokeLineCap: state.lineCap,
    strokeLineJoin: state.lineJoin,
    strokeMiterLimit: state.miterLimit,
    strokeDashArray:
      kind.stroke && state.dash.length > 0 ? state.dash.map((value) => value * scale) : null,
    strokeDashOffset: kind.stroke ? state.dashOffset * scale : 0,
    fillRule: kind.evenOdd ? "evenodd" : "nonzero",
    opacity: alpha,
    selectable: false,
    evented: false,
  } as never)
  object.hairline = hairline

  object.set({
    left: (object.left ?? 0) + options.offset[0],
    top: (object.top ?? 0) + options.offset[1],
  })
  if (clip) installClip(object, clip)
  objects.push(object)
}

export function createVectorObjects(
  operatorList: OperatorList,
  options: VectorOptions,
): fabric.Object[] {
  const objects: fabric.Object[] = []
  const state = createGraphicsState()
  const saved: SavedState[] = []
  let builder = createPathBuilder()
  let ctm: Matrix = [1, 0, 0, 1, 0, 0]
  let clip: ClipRegion | null = null
  let pendingClip: "nonzero" | "evenodd" | null = null
  const contentStack: boolean[] = []
  let contentVisible = true

  const totalMatrix = (): Matrix => multiply(options.viewportTransform, ctm)

  const clipCache = new Map<ClipRegion | null, Map<string, ClipRegion>>()

  const resolveClip = (
    path: string,
    bounds: Bounds | null,
    rectangle: Bounds | null,
    fillRule: "nonzero" | "evenodd",
    parent: ClipRegion | null,
  ): ClipRegion | null => {
    if (rectangle && coversBounds(rectangle, options.viewport)) return parent
    if (parent && rectangle && coversBounds(rectangle, parent.bounds)) return parent

    const key = `${fillRule}\u0000${path}`
    let regions = clipCache.get(parent)
    if (!regions) {
      regions = new Map()
      clipCache.set(parent, regions)
    }
    const existing = regions.get(key)
    if (existing) return existing

    const region = createClipRegion(path, bounds, fillRule, parent)
    regions.set(key, region)
    return region
  }

  const paint = (operator: number): void => {
    if (!builder.isEmpty() && contentVisible) {
      applyPaint(
        operator,
        builder.toString(),
        builder.bounds(),
        state,
        totalMatrix(),
        options,
        objects,
        clip,
      )
    }
    builder = createPathBuilder()
  }

  const paintImage = (image: PDFImageData, color?: string | null): void => {
    if (!contentVisible || image.width <= 0 || image.height <= 0) return
    const unit: Matrix = [1 / image.width, 0, 0, -1 / image.height, 0, 1]
    const matrix = multiply(
      [1, 0, 0, 1, options.offset[0], options.offset[1]],
      multiply(totalMatrix(), unit),
    )
    const corners = [
      applyMatrix(matrix, 0, 0),
      applyMatrix(matrix, 1, 0),
      applyMatrix(matrix, 1, 1),
      applyMatrix(matrix, 0, 1),
    ]
    const xs = corners.map(([x]) => x)
    const ys = corners.map(([, y]) => y)
    const bounds: Bounds = {
      minX: Math.min(...xs),
      minY: Math.min(...ys),
      maxX: Math.max(...xs),
      maxY: Math.max(...ys),
    }
    if (clip && !intersectsBounds(bounds, clip.bounds)) return
    const object = createImageObject(image, {
      matrix,
      opacity: options.opacity * state.fillAlpha,
      color,
    })
    if (object) {
      if (clip) installClip(object, clip)
      objects.push(object)
    }
  }

  for (let index = 0; index < operatorList.fnArray.length; index += 1) {
    const operator = operatorList.fnArray[index] as number
    const args = operatorList.argsArray[index] ?? []

    switch (operator) {
      case OPS.save:
        saved.push({ ctm, state: copyState(state), clip })
        break
      case OPS.restore: {
        const previous = saved.pop()
        if (previous) {
          ctm = previous.ctm
          Object.assign(state, previous.state)
          clip = previous.clip
        }
        break
      }
      case OPS.transform:
        ctm = multiply(ctm, toMatrix(args))
        break
      case OPS.setLineWidth:
        state.lineWidth = numberAt(args, 0)
        break
      case OPS.setLineCap:
        state.lineCap = LINE_CAPS[numberAt(args, 0)] ?? "butt"
        break
      case OPS.setLineJoin:
        state.lineJoin = LINE_JOINS[numberAt(args, 0)] ?? "miter"
        break
      case OPS.setMiterLimit:
        state.miterLimit = numberAt(args, 0)
        break
      case OPS.setDash: {
        const dash = args[0]
        state.dash = Array.isArray(dash)
          ? dash.filter((entry): entry is number => typeof entry === "number")
          : []
        state.dashOffset = numberAt(args, 1)
        break
      }
      case OPS.setGState:
        applyGState(state, args)
        break
      case OPS.setFillGray:
      case OPS.setFillRGBColor:
      case OPS.setFillCMYKColor:
        state.fill = parseColor(args)
        break
      case OPS.setStrokeGray:
      case OPS.setStrokeRGBColor:
      case OPS.setStrokeCMYKColor:
        state.stroke = parseColor(args)
        break
      case OPS.setFillTransparent:
        state.fill = null
        break
      case OPS.setStrokeTransparent:
        state.stroke = null
        break
      case OPS.moveTo:
        builder.moveTo(numberAt(args, 0), numberAt(args, 1), totalMatrix())
        break
      case OPS.lineTo:
        builder.lineTo(numberAt(args, 0), numberAt(args, 1), totalMatrix())
        break
      case OPS.curveTo:
        builder.curveTo(
          numberAt(args, 0),
          numberAt(args, 1),
          numberAt(args, 2),
          numberAt(args, 3),
          numberAt(args, 4),
          numberAt(args, 5),
          totalMatrix(),
        )
        break
      case OPS.curveTo2:
        builder.curveTo2(
          numberAt(args, 0),
          numberAt(args, 1),
          numberAt(args, 2),
          numberAt(args, 3),
          totalMatrix(),
        )
        break
      case OPS.curveTo3:
        builder.curveTo3(
          numberAt(args, 0),
          numberAt(args, 1),
          numberAt(args, 2),
          numberAt(args, 3),
          totalMatrix(),
        )
        break
      case OPS.closePath:
        builder.closePath()
        break
      case OPS.rectangle:
        builder.rectangle(
          numberAt(args, 0),
          numberAt(args, 1),
          numberAt(args, 2),
          numberAt(args, 3),
          totalMatrix(),
        )
        break
      case OPS.stroke:
      case OPS.closeStroke:
      case OPS.fill:
      case OPS.eoFill:
      case OPS.fillStroke:
      case OPS.eoFillStroke:
      case OPS.closeFillStroke:
      case OPS.closeEOFillStroke:
        paint(operator)
        break
      case OPS.constructPath: {
        const paintOperator = typeof args[0] === "number" ? args[0] : OPS.endPath
        const data = args[1]
        if (
          !data ||
          (typeof data !== "object" && typeof data !== "function") ||
          !("length" in data)
        ) {
          if (pendingClip) {
            clip = createClipRegion("", null, pendingClip, clip)
            pendingClip = null
          }
          break
        }
        const packed = data as ArrayLike<unknown>
        const first = packed[0]
        const commands =
          first && (typeof first === "object" || typeof first === "function")
            ? (first as ArrayLike<number>)
            : (packed as ArrayLike<number>)
        if (!("length" in commands)) break
        const drawn = pathFromDrawCommands(commands, totalMatrix())
        if (pendingClip) {
          clip = resolveClip(drawn.path, drawn.bounds, drawn.rectangle, pendingClip, clip)
          pendingClip = null
        }
        const kind = paintKind(paintOperator)
        if (contentVisible && (kind.fill || kind.stroke) && drawn.path.length > 0) {
          applyPaint(
            paintOperator,
            drawn.path,
            drawn.bounds,
            state,
            totalMatrix(),
            options,
            objects,
            clip,
          )
        }
        break
      }
      case OPS.paintImageXObject: {
        const reference = args[0]
        const image =
          typeof reference === "string" ? options.getImage(reference) : asPDFImageData(reference)
        if (image) paintImage(image)
        break
      }
      case OPS.paintInlineImageXObject: {
        const image = asPDFImageData(args[0])
        if (image) paintImage(image)
        break
      }
      case OPS.paintImageMaskXObject: {
        const reference = args[0]
        const id =
          reference && typeof reference === "object" ? Reflect.get(reference, "data") : null
        const image = typeof id === "string" ? options.getImage(id) : asPDFImageData(reference)
        if (image && state.fill !== null) paintImage(image, state.fill)
        break
      }
      case OPS.paintSolidColorImageMask: {
        if (!contentVisible) break
        const mask = createPathBuilder()
        mask.moveTo(0, 0, totalMatrix())
        mask.lineTo(1, 0, totalMatrix())
        mask.lineTo(1, 1, totalMatrix())
        mask.lineTo(0, 1, totalMatrix())
        mask.closePath()
        applyPaint(
          OPS.fill,
          mask.toString(),
          mask.bounds(),
          state,
          totalMatrix(),
          options,
          objects,
          clip,
        )
        break
      }
      case OPS.paintFormXObjectBegin: {
        saved.push({ ctm, state: copyState(state), clip })
        const matrix = asMatrix(args[0])
        if (matrix) ctm = multiply(ctm, matrix)
        break
      }
      case OPS.paintFormXObjectEnd: {
        const previous = saved.pop()
        if (previous) {
          ctm = previous.ctm
          Object.assign(state, previous.state)
          clip = previous.clip
        }
        break
      }
      case OPS.beginMarkedContentProps: {
        contentStack.push(contentVisible)
        if (args[0] === "OC") contentVisible = contentVisible && options.isVisible(args[1])
        break
      }
      case OPS.endMarkedContent:
        contentVisible = contentStack.pop() ?? true
        break
      case OPS.clip:
        pendingClip = "nonzero"
        break
      case OPS.eoClip:
        pendingClip = "evenodd"
        break
      case OPS.endPath:
        break
      default:
        break
    }
  }

  return objects
}
