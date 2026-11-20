import type { fabric } from "fabric"

import type { FabricNode } from "./node"
import type { FabricEvent } from "./types"

interface RawFabricEventOptions {
  e?: Event
  pointer?: fabric.Point
  absolutePointer?: fabric.Point
  isClick?: boolean
  button?: number
}

export const EVENT_PROPS = {
  onMouseDown: "mousedown",
  onMouseUp: "mouseup",
  onMouseMove: "mousemove",
  onMouseOver: "mouseover",
  onMouseOut: "mouseout",
  onClick: "mouseup",
  onMoving: "moving",
  onModified: "modified",
  onScaling: "scaling",
  onRotating: "rotating",
  onSelected: "selected",
  onDeselected: "deselected",
  onAdded: "added",
  onRemoved: "removed",
  onChanged: "changed",
} as const

export type EventPropName = keyof typeof EVENT_PROPS

export function isEventHandlerKey(key: string): key is EventPropName {
  return Object.prototype.hasOwnProperty.call(EVENT_PROPS, key)
}

function toFabricEvent(
  eventName: string,
  target: FabricNode["object"],
  options: RawFabricEventOptions,
): FabricEvent {
  return {
    type: eventName,
    target,
    e: options.e,
    pointer: options.pointer,
    absolutePointer: options.absolutePointer,
    isClick: options.isClick,
    button: options.button,
  }
}

const CLICK_MAX_DISTANCE = 4

function dispatch(
  node: FabricNode,
  propName: EventPropName,
  eventName: string,
  options: RawFabricEventOptions = {},
): void {
  const handler = node.props[propName]
  if (typeof handler !== "function") return

  handler(toFabricEvent(eventName, node.object, options))
}

function bind(
  node: FabricNode,
  key: string,
  eventName: string,
  handler: (options?: RawFabricEventOptions) => void,
): void {
  node.object.on(eventName, handler as (options?: unknown) => void)
  node.listeners.set(key, {
    event: eventName,
    handler: handler as (options?: unknown) => void,
  })
}

function unbind(node: FabricNode, key: string): void {
  const bound = node.listeners.get(key)
  if (!bound) return
  node.object.off(bound.event, bound.handler as (options?: RawFabricEventOptions) => void)
  node.listeners.delete(key)
}

function recordPointerDown(node: FabricNode, options: RawFabricEventOptions = {}): void {
  const pointer = options.pointer
  node.pointerDown = pointer ? { x: pointer.x, y: pointer.y } : null
}

function finishClick(node: FabricNode, options: RawFabricEventOptions = {}): void {
  const pointerDown = node.pointerDown
  node.pointerDown = null

  const pointer = options.pointer
  if (!pointerDown || !pointer) return
  if (options.isClick === false) return

  const dx = pointer.x - pointerDown.x
  const dy = pointer.y - pointerDown.y
  if (Math.hypot(dx, dy) > CLICK_MAX_DISTANCE) return

  dispatch(node, "onClick", EVENT_PROPS.onClick, options)
}

function syncClickHandlers(node: FabricNode): void {
  const isActive = typeof node.props.onClick === "function"
  const isBound = node.listeners.has("onClick:down")

  if (isActive && !isBound) {
    bind(node, "onClick:down", "mousedown", (options) => recordPointerDown(node, options))
    bind(node, "onClick:up", "mouseup", (options) => finishClick(node, options))
  } else if (!isActive && isBound) {
    unbind(node, "onClick:down")
    unbind(node, "onClick:up")
    node.pointerDown = null
  }
}

export function attachEventHandlers(node: FabricNode): void {
  for (const [propName, eventName] of Object.entries(EVENT_PROPS) as [EventPropName, string][]) {
    if (propName === "onClick") continue

    const isActive = typeof node.props[propName] === "function"
    const isBound = node.listeners.has(propName)

    if (isActive && !isBound) {
      bind(node, propName, eventName, (options) => dispatch(node, propName, eventName, options))
    } else if (!isActive && isBound) {
      unbind(node, propName)
    }
  }

  syncClickHandlers(node)
}

export function detachEventHandlers(node: FabricNode): void {
  for (const key of [...node.listeners.keys()]) unbind(node, key)
  node.pointerDown = null
}
