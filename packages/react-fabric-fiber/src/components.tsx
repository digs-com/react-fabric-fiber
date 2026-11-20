import {
  createElement,
  useCallback,
  useLayoutEffect,
  useRef,
  type CSSProperties,
  type ReactElement,
  type ReactNode,
  type Ref,
} from "react"
import type { fabric } from "fabric"
import { FiberProvider, useContextBridge } from "its-fine"

import {
  createRoot,
  type ExternalObjectPlacement,
  type FabricCanvasFactory,
  type FabricRoot,
} from "./reconciler"
import type {
  CircleProps,
  EllipseProps,
  GroupProps,
  ImageProps,
  LineProps,
  PathProps,
  PolygonProps,
  PolylineProps,
  PrimitiveProps,
  RectProps,
  TextProps,
  TriangleProps,
} from "./types"

interface CanvasSize {
  width: number
  height: number
}

const measureElement = (element: Element | null): CanvasSize | null => {
  const rect = element?.getBoundingClientRect()
  if (!rect || rect.width <= 0 || rect.height <= 0) return null
  return { width: Math.round(rect.width), height: Math.round(rect.height) }
}

const createHostElement = (type: string, props: object): ReactElement =>
  createElement(type as unknown as React.ElementType, props as never)

export function createFabricComponent<P extends object>(
  type: string,
  displayName?: string,
): (props: P) => ReactElement {
  const Component = (props: P): ReactElement => createHostElement(type, props)
  Component.displayName = displayName ?? type
  return Component
}

export const Rect = (props: RectProps): ReactElement => createHostElement("rect", props)
export const Circle = (props: CircleProps): ReactElement => createHostElement("circle", props)
export const Ellipse = (props: EllipseProps): ReactElement => createHostElement("ellipse", props)
export const Triangle = (props: TriangleProps): ReactElement => createHostElement("triangle", props)
export const Line = (props: LineProps): ReactElement => createHostElement("line", props)
export const Polyline = (props: PolylineProps): ReactElement => createHostElement("polyline", props)
export const Polygon = (props: PolygonProps): ReactElement => createHostElement("polygon", props)
export const Path = (props: PathProps): ReactElement => createHostElement("path", props)
export const Image = (props: ImageProps): ReactElement => createHostElement("image", props)
export const Text = (props: TextProps): ReactElement => createHostElement("text", props)
export const Group = (props: GroupProps): ReactElement => createHostElement("group", props)
export const Primitive = (props: PrimitiveProps): ReactElement =>
  createHostElement("primitive", props)

Rect.displayName = "Rect"
Circle.displayName = "Circle"
Ellipse.displayName = "Ellipse"
Triangle.displayName = "Triangle"
Line.displayName = "Line"
Polyline.displayName = "Polyline"
Polygon.displayName = "Polygon"
Path.displayName = "Path"
Image.displayName = "Image"
Text.displayName = "Text"
Group.displayName = "Group"
Primitive.displayName = "Primitive"

export interface CanvasProps extends Omit<
  fabric.ICanvasOptions,
  "width" | "height" | "backgroundColor"
> {
  width?: number
  height?: number
  backgroundColor?: string | fabric.Pattern
  className?: string
  style?: CSSProperties
  children?: ReactNode
  canvasFactory?: FabricCanvasFactory
  externalObjectPlacement?: ExternalObjectPlacement
  ref?: Ref<fabric.Canvas>
}

export function Canvas(props: CanvasProps): ReactElement {
  return (
    <FiberProvider>
      <CanvasImpl {...props} />
    </FiberProvider>
  )
}

function CanvasImpl({
  ref,
  width,
  height,
  backgroundColor,
  className,
  style,
  children,
  canvasFactory,
  externalObjectPlacement,
  ...options
}: CanvasProps): ReactElement {
  const ContextBridge = useContextBridge()
  const containerRef = useRef<HTMLDivElement | null>(null)
  const rootRef = useRef<FabricRoot | null>(null)
  const initialRef = useRef({
    options,
    width,
    height,
    backgroundColor,
    canvasFactory,
    externalObjectPlacement,
  })
  const sizeRef = useRef({ width, height })

  const applySize = useCallback((canvas: fabric.Canvas, measured: CanvasSize | null): void => {
    const explicit = sizeRef.current
    const size = {
      width: explicit.width ?? measured?.width ?? canvas.getWidth(),
      height: explicit.height ?? measured?.height ?? canvas.getHeight(),
    }
    if (size.width === canvas.getWidth() && size.height === canvas.getHeight()) return
    canvas.setDimensions(size)
  }, [])

  const attachCanvas = useCallback(
    (element: HTMLCanvasElement | null): (() => void) | void => {
      if (!element) return

      const initial = initialRef.current
      const container = element.parentElement
      const measured = measureElement(container)
      const root = createRoot(
        element,
        {
          ...(initial.options as fabric.ICanvasOptions),
          width: initial.width ?? measured?.width ?? element.width,
          height: initial.height ?? measured?.height ?? element.height,
          backgroundColor: initial.backgroundColor,
        },
        {
          canvasFactory: initial.canvasFactory,
          externalObjectPlacement: initial.externalObjectPlacement,
        },
      )
      rootRef.current = root

      const observer =
        container === null || typeof ResizeObserver === "undefined"
          ? null
          : new ResizeObserver(() => applySize(root.canvas, measureElement(container)))
      if (observer && container) observer.observe(container)

      return () => {
        observer?.disconnect()
        rootRef.current = null
        root.unmount()
      }
    },
    [applySize],
  )

  useLayoutEffect(() => {
    rootRef.current?.render(<ContextBridge>{children}</ContextBridge>)
  })

  useLayoutEffect(() => {
    sizeRef.current = { width, height }
    const canvas = rootRef.current?.canvas
    if (!canvas) return
    applySize(canvas, measureElement(containerRef.current))
  }, [width, height, applySize])

  useLayoutEffect(() => {
    const canvas = rootRef.current?.canvas
    if (!canvas) return

    if (backgroundColor !== undefined) {
      canvas.setBackgroundColor(backgroundColor, () => canvas.requestRenderAll())
    } else {
      canvas.requestRenderAll()
    }
  }, [backgroundColor])

  useLayoutEffect(() => {
    const canvas = rootRef.current?.canvas
    if (!canvas || !ref) return

    if (typeof ref === "function") {
      const cleanup = ref(canvas)
      return typeof cleanup === "function"
        ? () => {
            cleanup()
          }
        : () => {
            ref(null)
          }
    }

    ref.current = canvas
    return () => {
      ref.current = null
    }
  }, [ref])

  return (
    <div
      className={className}
      style={{
        position: "relative",
        width: width ?? "100%",
        height: height ?? "100%",
        overflow: "hidden",
        ...style,
      }}
    >
      <div ref={containerRef} style={{ width: "100%", height: "100%" }}>
        <canvas ref={attachCanvas} style={{ display: "block" }} />
      </div>
    </div>
  )
}
