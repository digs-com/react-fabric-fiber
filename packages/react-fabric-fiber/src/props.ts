import { fabric } from "fabric"

import { isEventHandlerKey } from "./events"
import type { FabricNode } from "./node"

interface MappedProp {
  read: (object: fabric.Object) => unknown
  apply: (object: fabric.Object, value: unknown) => void
}

const toNumber = (value: unknown, propName: string): number => {
  if (typeof value !== "number" || Number.isNaN(value)) {
    throw new TypeError(`"${propName}" expects a number, received ${String(value)}`)
  }
  return value
}

const toPair = (value: unknown, propName: string): [number, number] => {
  if (typeof value === "number") return [value, value]
  if (Array.isArray(value) && value.length === 2) {
    return [toNumber(value[0], propName), toNumber(value[1], propName)]
  }
  throw new TypeError(`"${propName}" expects a number or a [x, y] pair, received ${String(value)}`)
}

const setFabricProp = (object: fabric.Object, key: string, value: unknown): void => {
  object.set({ [key]: value } as unknown as Partial<fabric.Object>)
}

const MAPPED_PROPS: Record<string, MappedProp> = {
  position: {
    read: (object) => [object.left ?? 0, object.top ?? 0],
    apply: (object, value) => {
      const [x, y] = toPair(value, "position")
      object.set({ left: x, top: y })
    },
  },
  scale: {
    read: (object) => [object.scaleX ?? 1, object.scaleY ?? 1],
    apply: (object, value) => {
      const [x, y] = toPair(value, "scale")
      object.set({ scaleX: x, scaleY: y })
    },
  },
  rotation: {
    read: (object) => object.angle ?? 0,
    apply: (object, value) => {
      object.set({ angle: toNumber(value, "rotation") })
    },
  },
}

interface PolylineGeometry {
  points: Array<{ x: number; y: number }>
  _setPositionDimensions(options: { left?: number; top?: number }): void
}

interface PathGeometry {
  _setPath(path: string, options: { left?: number; top?: number }): void
}

const toPoints = (value: unknown): Array<{ x: number; y: number }> => {
  if (!Array.isArray(value)) throw new TypeError('"points" expects an array of { x, y } objects')

  return value.map((point: unknown) => {
    if (typeof point !== "object" || point === null) {
      throw new TypeError('"points" expects an array of { x, y } objects')
    }
    const x = Reflect.get(point, "x")
    const y = Reflect.get(point, "y")
    if (typeof x !== "number" || typeof y !== "number") {
      throw new TypeError('"points" expects an array of { x, y } objects')
    }
    return { x, y }
  })
}

const toPathString = (value: unknown): string => {
  if (typeof value !== "string") throw new TypeError('"path" expects an SVG path string')
  return value
}

const isImageElement = (
  value: unknown,
): value is HTMLImageElement | HTMLCanvasElement | HTMLVideoElement =>
  typeof value === "object" &&
  value !== null &&
  "nodeType" in value &&
  Reflect.get(value, "nodeType") === 1

interface FabricPropTarget {
  object: fabric.Object
  props: Record<string, unknown>
}

const applyFabricSpecialProp = (target: FabricPropTarget, key: string, value: unknown): boolean => {
  const object = target.object

  if (key === "points" && object instanceof fabric.Polyline) {
    const geometry = object as unknown as PolylineGeometry
    geometry.points = toPoints(value)
    geometry._setPositionDimensions({ left: object.left, top: object.top })
    object.dirty = true
    return true
  }

  if (key === "path" && object instanceof fabric.Path) {
    const geometry = object as unknown as PathGeometry
    geometry._setPath(toPathString(value), {
      left: object.left,
      top: object.top,
    })
    object.dirty = true
    return true
  }

  if (key === "element" && object instanceof fabric.Image) {
    if (typeof value === "string") object.setSrc(value, () => object.canvas?.requestRenderAll())
    else if (isImageElement(value)) {
      const element = value as unknown as HTMLImageElement | HTMLVideoElement
      object.setElement(element)
    } else
      throw new TypeError('"element" expects an image, canvas or video element, or a URL string')
    object.dirty = true
    return true
  }

  if (key === "src" && object instanceof fabric.Image) {
    if (typeof value !== "string") throw new TypeError('"src" expects a URL string')

    const image = object
    image.setSrc(
      value,
      (_loaded: fabric.Image, isError: boolean) => {
        image.setCoords()
        image.canvas?.requestRenderAll()

        if (isError) {
          const onError = target.props.onError
          if (typeof onError === "function") onError(value)
          return
        }

        const onLoad = target.props.onLoad
        if (typeof onLoad === "function") onLoad(image)
      },
      { crossOrigin: target.props.crossOrigin as string | undefined },
    )
    return true
  }

  return false
}

const RESERVED_PROPS = new Set([
  "children",
  "ref",
  "key",
  "object",
  "zIndex",
  "crossOrigin",
  "onLoad",
  "onError",
])

const readDefault = (object: fabric.Object, key: string): unknown => {
  const mapped = MAPPED_PROPS[key]
  if (mapped) return mapped.read(object)
  return Reflect.get(object, key)
}

const writeObjectProp = (target: FabricPropTarget, key: string, value: unknown): void => {
  if (applyFabricSpecialProp(target, key, value)) return

  const mapped = MAPPED_PROPS[key]
  if (mapped) mapped.apply(target.object, value)
  else setFabricProp(target.object, key, value)
}

export const writeProp = (node: FabricNode, key: string, value: unknown): void => {
  if (applyFabricSpecialProp(node, key, value)) return

  if (!node.defaults.has(key)) {
    node.defaults.set(key, {
      value: readDefault(node.object, key),
      own: Object.prototype.hasOwnProperty.call(node.object, key),
    })
  }

  writeObjectProp(node, key, value)
}

export function applyProps(object: fabric.Object, props: Record<string, unknown>): void {
  const target: FabricPropTarget = { object, props }

  for (const [key, value] of Object.entries(props)) {
    if (RESERVED_PROPS.has(key) || isEventHandlerKey(key) || value === undefined) continue
    writeObjectProp(target, key, value)
  }

  object.setCoords()
}

const restoreDefault = (node: FabricNode, key: string): void => {
  const entry = node.defaults.get(key)
  if (!entry) return

  if (!entry.own && entry.value === undefined) {
    delete (node.object as unknown as Record<string, unknown>)[key]
    return
  }

  const mapped = MAPPED_PROPS[key]
  if (mapped) mapped.apply(node.object, entry.value)
  else setFabricProp(node.object, key, entry.value)
}

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && Object.getPrototypeOf(value) === Object.prototype

const valuesEqual = (previous: unknown, next: unknown): boolean => {
  if (Object.is(previous, next)) return true

  if (Array.isArray(previous) && Array.isArray(next)) {
    return (
      previous.length === next.length &&
      previous.every((value, index) => Object.is(value, next[index]))
    )
  }

  if (isPlainObject(previous) && isPlainObject(next)) {
    const previousKeys = Object.keys(previous)
    return (
      previousKeys.length === Object.keys(next).length &&
      previousKeys.every((key) => Object.is(previous[key], next[key]))
    )
  }

  return false
}

export function diffProps(
  prevProps: Record<string, unknown>,
  nextProps: Record<string, unknown>,
): string[] {
  const keys = new Set([...Object.keys(prevProps), ...Object.keys(nextProps)])
  const changed: string[] = []

  for (const key of keys) {
    if (RESERVED_PROPS.has(key)) continue
    if (!valuesEqual(prevProps[key], nextProps[key])) changed.push(key)
  }

  return changed
}

export function applyNodeProps(
  node: FabricNode,
  prevProps: Record<string, unknown>,
  nextProps: Record<string, unknown>,
): void {
  node.props = { ...nextProps }

  for (const key of diffProps(prevProps, nextProps)) {
    if (isEventHandlerKey(key)) continue

    const value = nextProps[key]
    if (value === undefined) restoreDefault(node, key)
    else writeProp(node, key, value)
  }

  node.object.setCoords()
}
