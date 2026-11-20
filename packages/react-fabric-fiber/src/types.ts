import type * as React from "react"
import type { fabric } from "fabric"

export type BuiltinFabricElement =
  | "rect"
  | "circle"
  | "ellipse"
  | "triangle"
  | "line"
  | "polyline"
  | "polygon"
  | "path"
  | "image"
  | "text"
  | "group"
  | "primitive"

export type FabricElementType = BuiltinFabricElement | (string & {})

export interface FabricEvent<E extends Event = Event> {
  type: string
  target: fabric.Object
  e: E | undefined
  pointer: fabric.Point | undefined
  absolutePointer: fabric.Point | undefined
  isClick: boolean | undefined
  button: number | undefined
}

export type FabricEventHandler<E extends Event = Event> = (event: FabricEvent<E>) => void

export interface FabricEventProps {
  onMouseDown?: FabricEventHandler
  onMouseUp?: FabricEventHandler
  onMouseMove?: FabricEventHandler
  onMouseOver?: FabricEventHandler
  onMouseOut?: FabricEventHandler
  onClick?: FabricEventHandler
  onMoving?: FabricEventHandler
  onModified?: FabricEventHandler
  onScaling?: FabricEventHandler
  onRotating?: FabricEventHandler
  onSelected?: FabricEventHandler
  onDeselected?: FabricEventHandler
  onAdded?: FabricEventHandler
  onRemoved?: FabricEventHandler
  onChanged?: FabricEventHandler
}

export interface FabricObjectProps extends FabricEventProps {
  /** Plain-object position in canvas coordinates; maps to fabric `left`/`top`. */
  position?: readonly [number, number]
  /** Uniform or per-axis scale; maps to fabric `scaleX`/`scaleY`. */
  scale?: number | readonly [number, number]
  /** Rotation in degrees; maps to fabric `angle`. */
  rotation?: number
  zIndex?: number
  visible?: boolean
  opacity?: number
  fill?: string
  stroke?: string | null
  strokeWidth?: number
  strokeDashArray?: readonly number[] | null
  selectable?: boolean
  evented?: boolean
  hasControls?: boolean
  hasBorders?: boolean
  lockMovementX?: boolean
  lockMovementY?: boolean
  shadow?: string | null
  ref?: React.Ref<fabric.Object>
}

export interface RectProps extends FabricObjectProps {
  width?: number
  height?: number
  rx?: number
  ry?: number
}

export interface CircleProps extends FabricObjectProps {
  radius?: number
  startAngle?: number
  endAngle?: number
}

export interface TextProps extends FabricObjectProps {
  text?: string
  fontSize?: number
  fontFamily?: string
  fontWeight?: string | number
  fontStyle?: string
  textAlign?: string
  lineHeight?: number
  charSpacing?: number
}

export interface GroupProps extends FabricObjectProps {
  children?: React.ReactNode
}

export interface LineProps extends FabricObjectProps {
  x1?: number
  y1?: number
  x2?: number
  y2?: number
}

export interface TriangleProps extends FabricObjectProps {
  width?: number
  height?: number
}

export interface EllipseProps extends FabricObjectProps {
  rx?: number
  ry?: number
}

export interface PointLike {
  x: number
  y: number
}

export interface PolylineProps extends FabricObjectProps {
  points?: ReadonlyArray<PointLike>
}

export type PolygonProps = PolylineProps

export interface PathProps extends FabricObjectProps {
  path: string
}

export interface ImageProps extends FabricObjectProps {
  element?: HTMLImageElement | HTMLCanvasElement | HTMLVideoElement | string
  src?: string
  crossOrigin?: string
  onLoad?: (image: fabric.Image) => void
  onError?: (src: string) => void
}

export interface PrimitiveProps extends FabricObjectProps {
  object: fabric.Object
  children?: React.ReactNode
}
