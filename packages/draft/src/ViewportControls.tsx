import {
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type Ref,
} from "react"
import { useFabric } from "@digs/react-fabric-fiber"
import { fabric } from "fabric"

export type ViewportModifier = "alt" | "ctrl" | "meta" | "shift"

export interface ViewportPanLimits {
  x?: readonly [number, number]
  y?: readonly [number, number]
}

export interface ViewportPanBinding {
  button?: number
  modifiers?: readonly ViewportModifier[]
  target?: "background" | "canvas"
  limits?: ViewportPanLimits
}

export interface ViewportZoomBinding {
  modifiers?: readonly ViewportModifier[]
  sensitivity?: number
  minZoom?: number
  maxZoom?: number
}

export interface ViewportControlsProps {
  pan?: boolean
  panButton?: number
  panModifiers?: readonly ViewportModifier[]
  panTarget?: "background" | "canvas"
  panLimits?: ViewportPanLimits
  zoom?: boolean
  zoomModifiers?: readonly ViewportModifier[]
  sensitivity?: number
  minZoom?: number
  maxZoom?: number
  momentum?: number
  ref?: Ref<ViewportControlsHandle>
}

export interface ViewportControlsHandle {
  setPan(binding: ViewportPanBinding | false): void
  setZoom(binding: ViewportZoomBinding | false): void
}

interface ResolvedPanLimits {
  x: readonly [number, number] | null
  y: readonly [number, number] | null
}

interface ResolvedPanBinding {
  button: number
  modifiers: readonly ViewportModifier[]
  target: "background" | "canvas"
  limits: ResolvedPanLimits | null
}

interface ResolvedZoomBinding {
  sensitivity: number
  minZoom: number
  maxZoom: number
  modifiers: readonly ViewportModifier[]
}

interface ViewportConfig {
  pan: ResolvedPanBinding | null
  zoom: ResolvedZoomBinding | null
  momentum: number | undefined
}

interface PanGesture {
  pointerX: number
  pointerY: number
  viewportX: number
  viewportY: number
  lastPointerX: number
  lastPointerY: number
  lastMoveTime: number
  velocityX: number
  velocityY: number
  selection: boolean
  skipTargetFind: boolean
}

interface PendingPan {
  selection: boolean
  skipTargetFind: boolean
}

interface PinchGesture {
  startDistance: number
  startZoom: number
  startCenterX: number
  startCenterY: number
  startViewportX: number
  startViewportY: number
  selection: boolean
  skipTargetFind: boolean
}

interface PointerPosition {
  x: number
  y: number
}

const DEFAULT_ZOOM_SENSITIVITY = 0.001
const DEFAULT_MIN_ZOOM = 0.01
const DEFAULT_MAX_ZOOM = 20
const LINE_HEIGHT_PIXELS = 16
const PAGE_HEIGHT_PIXELS = 100
const MOMENTUM_FRAME_MS = 1000 / 60
const MOMENTUM_MAX_FRAME_MS = 64
const MOMENTUM_RELEASE_TIMEOUT_MS = 80
const MOMENTUM_MIN_VELOCITY = 0.02

function resolveMomentum(momentum: number | undefined): number | undefined {
  if (momentum === undefined) return undefined
  if (!Number.isFinite(momentum) || momentum < 0 || momentum >= 1) {
    throw new TypeError(
      "ViewportControls momentum must be a number from 0 (inclusive) to 1 (exclusive).",
    )
  }
  return momentum
}

function resolveAxisLimit(
  limit: readonly [number, number] | undefined,
  axis: "x" | "y",
): readonly [number, number] | null {
  if (limit === undefined) return null
  if (!Array.isArray(limit) || limit.length !== 2) {
    throw new TypeError(`ViewportControls panLimits.${axis} must be a [minimum, maximum] pair.`)
  }
  const [minimum, maximum] = limit
  if (!Number.isFinite(minimum) || !Number.isFinite(maximum)) {
    throw new TypeError(`ViewportControls panLimits.${axis} must contain finite numbers.`)
  }
  if (maximum < minimum) {
    throw new TypeError(
      `ViewportControls panLimits.${axis} maximum must be greater than or equal to its minimum.`,
    )
  }
  return [minimum, maximum]
}

function resolvePanLimits(limits: ViewportPanLimits | undefined): ResolvedPanLimits | null {
  if (limits === undefined) return null
  return {
    x: resolveAxisLimit(limits.x, "x"),
    y: resolveAxisLimit(limits.y, "y"),
  }
}

function resolvePanBinding(
  enabled: boolean,
  button: number | undefined,
  modifiers: readonly ViewportModifier[] | undefined,
  target: "background" | "canvas" | undefined,
  limits: ViewportPanLimits | undefined,
): ResolvedPanBinding | null {
  if (!enabled) return null
  const resolvedButton = button ?? 0
  if (!Number.isInteger(resolvedButton) || resolvedButton < 0) {
    throw new TypeError("ViewportControls panButton must be a non-negative integer.")
  }
  return {
    button: resolvedButton,
    modifiers: modifiers ?? [],
    target: target ?? "canvas",
    limits: resolvePanLimits(limits),
  }
}

function resolveZoomBinding(
  enabled: boolean,
  modifiers: readonly ViewportModifier[] | undefined,
  sensitivity: number | undefined,
  minZoomValue: number | undefined,
  maxZoomValue: number | undefined,
): ResolvedZoomBinding | null {
  if (!enabled) return null
  const resolvedSensitivity = sensitivity ?? DEFAULT_ZOOM_SENSITIVITY
  const resolvedMinZoom = minZoomValue ?? DEFAULT_MIN_ZOOM
  const resolvedMaxZoom = maxZoomValue ?? DEFAULT_MAX_ZOOM
  if (!Number.isFinite(resolvedSensitivity) || resolvedSensitivity <= 0) {
    throw new TypeError("ViewportControls sensitivity must be a positive number.")
  }
  if (!Number.isFinite(resolvedMinZoom) || resolvedMinZoom <= 0) {
    throw new TypeError("ViewportControls minZoom must be a positive number.")
  }
  if (!Number.isFinite(resolvedMaxZoom) || resolvedMaxZoom < resolvedMinZoom) {
    throw new TypeError("ViewportControls maxZoom must be greater than or equal to minZoom.")
  }
  return {
    sensitivity: resolvedSensitivity,
    minZoom: resolvedMinZoom,
    maxZoom: resolvedMaxZoom,
    modifiers: modifiers ?? [],
  }
}

function resolveConfig(props: ViewportControlsProps): ViewportConfig {
  return {
    pan: resolvePanBinding(
      props.pan ?? true,
      props.panButton,
      props.panModifiers,
      props.panTarget,
      props.panLimits,
    ),
    zoom: resolveZoomBinding(
      props.zoom ?? true,
      props.zoomModifiers,
      props.sensitivity,
      props.minZoom,
      props.maxZoom,
    ),
    momentum: resolveMomentum(props.momentum),
  }
}

function sameModifiers(
  left: readonly ViewportModifier[],
  right: readonly ViewportModifier[],
): boolean {
  return left.length === right.length && left.every((modifier) => right.includes(modifier))
}

function sameAxisLimit(
  left: readonly [number, number] | null,
  right: readonly [number, number] | null,
): boolean {
  if (left === null || right === null) return left === right
  return left[0] === right[0] && left[1] === right[1]
}

function samePanLimits(left: ResolvedPanLimits | null, right: ResolvedPanLimits | null): boolean {
  if (left === null || right === null) return left === right
  return sameAxisLimit(left.x, right.x) && sameAxisLimit(left.y, right.y)
}

function samePanBindings(
  left: ResolvedPanBinding | null,
  right: ResolvedPanBinding | null,
): boolean {
  if (left === null || right === null) return left === right
  return (
    left.button === right.button &&
    left.target === right.target &&
    sameModifiers(left.modifiers, right.modifiers) &&
    samePanLimits(left.limits, right.limits)
  )
}

function sameZoomBindings(
  left: ResolvedZoomBinding | null,
  right: ResolvedZoomBinding | null,
): boolean {
  if (left === null || right === null) return left === right
  return (
    left.sensitivity === right.sensitivity &&
    left.minZoom === right.minZoom &&
    left.maxZoom === right.maxZoom &&
    sameModifiers(left.modifiers, right.modifiers)
  )
}

function sameConfig(left: ViewportConfig, right: ViewportConfig): boolean {
  return (
    left.momentum === right.momentum &&
    samePanBindings(left.pan, right.pan) &&
    sameZoomBindings(left.zoom, right.zoom)
  )
}

function readPointer(event: fabric.IEvent): PointerPosition | null {
  const pointer = event.pointer
  if (pointer && Number.isFinite(pointer.x) && Number.isFinite(pointer.y)) {
    return { x: pointer.x, y: pointer.y }
  }
  const native = event.e
  if ("offsetX" in native && "offsetY" in native) {
    const mouseEvent = native as MouseEvent
    if (Number.isFinite(mouseEvent.offsetX) && Number.isFinite(mouseEvent.offsetY)) {
      return { x: mouseEvent.offsetX, y: mouseEvent.offsetY }
    }
  }
  return null
}

function matchesButton(event: Event, button: number): boolean {
  if ("touches" in event) return button === 0
  return (event as MouseEvent).button === button
}

function readTouchPoint(canvas: fabric.Canvas, touch: Touch): PointerPosition {
  const bounds = canvas.getElement().getBoundingClientRect()
  const scaleX = bounds.width === 0 ? 1 : canvas.getWidth() / bounds.width
  const scaleY = bounds.height === 0 ? 1 : canvas.getHeight() / bounds.height
  return {
    x: (touch.clientX - bounds.left) * scaleX,
    y: (touch.clientY - bounds.top) * scaleY,
  }
}

interface TouchPair {
  centerX: number
  centerY: number
  distance: number
}

function readTouchPair(canvas: fabric.Canvas, event: TouchEvent): TouchPair | null {
  const first = event.touches[0]
  const second = event.touches[1]
  if (!first || !second) return null
  const start = readTouchPoint(canvas, first)
  const end = readTouchPoint(canvas, second)
  return {
    centerX: (start.x + end.x) / 2,
    centerY: (start.y + end.y) / 2,
    distance: Math.hypot(end.x - start.x, end.y - start.y),
  }
}

function matchesModifiers(event: Event, modifiers: readonly ViewportModifier[]): boolean {
  const mouseEvent = event as MouseEvent
  return modifiers.every((modifier) => {
    if (modifier === "alt") return mouseEvent.altKey
    if (modifier === "ctrl") return mouseEvent.ctrlKey
    if (modifier === "meta") return mouseEvent.metaKey
    return mouseEvent.shiftKey
  })
}

function readWheelDelta(event: WheelEvent): number {
  if (!Number.isFinite(event.deltaY)) return 0
  if (event.deltaMode === 1) return event.deltaY * LINE_HEIGHT_PIXELS
  if (event.deltaMode === 2) return event.deltaY * PAGE_HEIGHT_PIXELS
  return event.deltaY
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), maximum)
}

function clampAxisTranslation(
  translation: number,
  zoom: number,
  viewportSize: number,
  limits: readonly [number, number] | null,
): number {
  if (limits === null) return translation
  const [minimum, maximum] = limits
  const visibleSize = viewportSize / zoom
  if (maximum - minimum <= visibleSize) {
    return viewportSize / 2 - zoom * ((minimum + maximum) / 2)
  }
  const limited = clamp(translation, viewportSize - zoom * maximum, -zoom * minimum)
  return limited === 0 ? 0 : limited
}

function clampPanTranslation(
  viewport: number[],
  canvas: fabric.Canvas,
  limits: ResolvedPanLimits,
): void {
  const zoom = viewport[0] ?? 1
  viewport[4] = clampAxisTranslation(viewport[4] ?? 0, zoom, canvas.getWidth(), limits.x)
  viewport[5] = clampAxisTranslation(viewport[5] ?? 0, zoom, canvas.getHeight(), limits.y)
}

export function ViewportControls({
  pan,
  zoom,
  momentum,
  panButton,
  panModifiers,
  panTarget,
  panLimits,
  zoomModifiers,
  sensitivity,
  minZoom,
  maxZoom,
  ref,
}: ViewportControlsProps): null {
  const canvas = useFabric()
  const controls = useMemo(
    (): ViewportControlsProps => ({
      pan,
      zoom,
      momentum,
      panButton,
      panModifiers,
      panTarget,
      panLimits,
      zoomModifiers,
      sensitivity,
      minZoom,
      maxZoom,
    }),
    [
      pan,
      zoom,
      momentum,
      panButton,
      panModifiers,
      panTarget,
      panLimits,
      zoomModifiers,
      sensitivity,
      minZoom,
      maxZoom,
    ],
  )
  const [initialConfig] = useState<ViewportConfig>(() => resolveConfig(controls))
  const configRef = useRef<ViewportConfig>(initialConfig)
  const previousPropsRef = useRef<ViewportConfig | null>(null)
  const gestureRef = useRef<PanGesture | null>(null)
  const pendingRef = useRef<PendingPan | null>(null)
  const momentumFrameRef = useRef<number | null>(null)

  useLayoutEffect(() => {
    const next = resolveConfig(controls)
    const previous = previousPropsRef.current
    previousPropsRef.current = next
    if (previous === null || !sameConfig(previous, next)) configRef.current = next
  }, [controls])

  useImperativeHandle(
    ref,
    () => ({
      setPan(binding) {
        if (binding === false) {
          configRef.current = { ...configRef.current, pan: null }
          return
        }
        configRef.current = {
          ...configRef.current,
          pan: resolvePanBinding(
            true,
            binding.button,
            binding.modifiers,
            binding.target,
            binding.limits,
          ),
        }
      },
      setZoom(binding) {
        if (binding === false) {
          configRef.current = { ...configRef.current, zoom: null }
          return
        }
        configRef.current = {
          ...configRef.current,
          zoom: resolveZoomBinding(
            true,
            binding.modifiers,
            binding.sensitivity,
            binding.minZoom,
            binding.maxZoom,
          ),
        }
      },
    }),
    [],
  )

  useEffect(() => {
    let pinchGesture: PinchGesture | null = null

    const stopMomentum = (): void => {
      const frame = momentumFrameRef.current
      if (frame === null) return
      cancelAnimationFrame(frame)
      momentumFrameRef.current = null
    }

    const startMomentum = (gesture: PanGesture): void => {
      const momentum = configRef.current.momentum
      if (momentum === undefined || momentum === 0) return
      if (Date.now() - gesture.lastMoveTime > MOMENTUM_RELEASE_TIMEOUT_MS) return
      let velocityX = gesture.velocityX
      let velocityY = gesture.velocityY
      if (Math.hypot(velocityX, velocityY) < MOMENTUM_MIN_VELOCITY) return
      let lastFrameTime = Date.now()
      const frame = (): void => {
        momentumFrameRef.current = null
        const config = configRef.current
        if (config.momentum === undefined || config.pan === null) return
        const now = Date.now()
        const elapsed = Math.min(now - lastFrameTime, MOMENTUM_MAX_FRAME_MS)
        lastFrameTime = now
        const viewport = (canvas.viewportTransform ?? [1, 0, 0, 1, 0, 0]).slice()
        const previousX = viewport[4] ?? 0
        const previousY = viewport[5] ?? 0
        viewport[4] = previousX + velocityX * elapsed
        viewport[5] = previousY + velocityY * elapsed
        if (config.pan.limits) clampPanTranslation(viewport, canvas, config.pan.limits)
        if (viewport[4] === previousX) velocityX = 0
        if (viewport[5] === previousY) velocityY = 0
        canvas.setViewportTransform(viewport)
        canvas.requestRenderAll()
        const decay = Math.pow(config.momentum, elapsed / MOMENTUM_FRAME_MS)
        velocityX *= decay
        velocityY *= decay
        if (Math.hypot(velocityX, velocityY) < MOMENTUM_MIN_VELOCITY) return
        momentumFrameRef.current = requestAnimationFrame(frame)
      }
      momentumFrameRef.current = requestAnimationFrame(frame)
    }

    const finishPan = (): PanGesture | null => {
      const gesture = gestureRef.current
      const pending = pendingRef.current
      gestureRef.current = null
      pendingRef.current = null
      if (!gesture && !pending) return null
      canvas.selection = gesture?.selection ?? pending?.selection ?? true
      canvas.skipTargetFind = gesture?.skipTargetFind ?? pending?.skipTargetFind ?? false
      canvas.setCursor(canvas.defaultCursor ?? "default")
      return gesture
    }

    const endPan = (): void => {
      const gesture = finishPan()
      if (gesture) startMomentum(gesture)
    }

    const finishPinch = (): void => {
      const pinch = pinchGesture
      if (!pinch) return
      pinchGesture = null
      canvas.selection = pinch.selection
      canvas.skipTargetFind = pinch.skipTargetFind
      canvas.setCursor(canvas.defaultCursor ?? "default")
    }

    const startPinch = (event: TouchEvent): void => {
      if (event.touches.length < 2) return
      if (pinchGesture) {
        event.preventDefault()
        return
      }
      const binding = configRef.current.zoom
      const pair = readTouchPair(canvas, event)
      if (!binding || !pair || pair.distance === 0) return
      stopMomentum()
      finishPan()
      const viewport = canvas.viewportTransform ?? [1, 0, 0, 1, 0, 0]
      pinchGesture = {
        startDistance: pair.distance,
        startZoom: viewport[0] ?? 1,
        startCenterX: pair.centerX,
        startCenterY: pair.centerY,
        startViewportX: viewport[4] ?? 0,
        startViewportY: viewport[5] ?? 0,
        selection: canvas.selection ?? true,
        skipTargetFind: canvas.skipTargetFind,
      }
      canvas.selection = false
      canvas.skipTargetFind = true
      event.preventDefault()
    }

    const movePinch = (event: TouchEvent): void => {
      const pinch = pinchGesture
      if (!pinch) return
      const binding = configRef.current.zoom
      const pair = readTouchPair(canvas, event)
      if (!binding || !pair || pair.distance === 0) {
        finishPinch()
        return
      }
      event.preventDefault()
      const nextZoom = clamp(
        pinch.startZoom * (pair.distance / pinch.startDistance),
        binding.minZoom,
        binding.maxZoom,
      )
      const worldX = (pinch.startCenterX - pinch.startViewportX) / pinch.startZoom
      const worldY = (pinch.startCenterY - pinch.startViewportY) / pinch.startZoom
      const viewport = (canvas.viewportTransform ?? [1, 0, 0, 1, 0, 0]).slice()
      viewport[0] = nextZoom
      viewport[3] = nextZoom
      viewport[4] = pair.centerX - nextZoom * worldX
      viewport[5] = pair.centerY - nextZoom * worldY
      const limits = configRef.current.pan?.limits
      if (limits) clampPanTranslation(viewport, canvas, limits)
      canvas.setViewportTransform(viewport)
      canvas.requestRenderAll()
    }

    const claimPanCapture = (event: Event): void => {
      const binding = configRef.current.pan
      if (!binding || binding.target !== "canvas" || gestureRef.current || pendingRef.current) {
        return
      }
      if (!matchesButton(event, binding.button)) return
      if (!matchesModifiers(event, binding.modifiers)) return
      pendingRef.current = {
        selection: canvas.selection ?? true,
        skipTargetFind: canvas.skipTargetFind,
      }
      canvas.selection = false
      canvas.skipTargetFind = true
    }

    const handleTouchStart = (event: TouchEvent): void => {
      if (event.touches.length >= 2) {
        startPinch(event)
        return
      }
      claimPanCapture(event)
    }

    const handleTouchMove = (event: TouchEvent): void => {
      movePinch(event)
    }

    const handleTouchEnd = (event: TouchEvent): void => {
      if (event.touches.length < 2) finishPinch()
    }

    const startPan = (event: fabric.IEvent): void => {
      stopMomentum()
      if (pinchGesture) return
      const binding = configRef.current.pan
      if (!binding || gestureRef.current) return
      if (binding.target === "background" && event.target != null) return
      if (!matchesButton(event.e, binding.button)) return
      if (!matchesModifiers(event.e, binding.modifiers)) return
      const pointer = readPointer(event)
      if (!pointer) return
      const pending = pendingRef.current
      pendingRef.current = null
      const viewport = canvas.viewportTransform ?? [1, 0, 0, 1, 0, 0]
      const now = Date.now()
      gestureRef.current = {
        pointerX: pointer.x,
        pointerY: pointer.y,
        viewportX: viewport[4] ?? 0,
        viewportY: viewport[5] ?? 0,
        lastPointerX: pointer.x,
        lastPointerY: pointer.y,
        lastMoveTime: now,
        velocityX: 0,
        velocityY: 0,
        selection: pending?.selection ?? canvas.selection ?? true,
        skipTargetFind: pending?.skipTargetFind ?? canvas.skipTargetFind,
      }
      canvas.selection = false
      canvas.skipTargetFind = true
      canvas.setCursor("grabbing")
    }

    const movePan = (event: fabric.IEvent): void => {
      if (pinchGesture) return
      const gesture = gestureRef.current
      if (!gesture) return
      const pointer = readPointer(event)
      if (!pointer) return
      const now = Date.now()
      const elapsed = now - gesture.lastMoveTime
      if (elapsed > 0) {
        gesture.velocityX = (pointer.x - gesture.lastPointerX) / elapsed
        gesture.velocityY = (pointer.y - gesture.lastPointerY) / elapsed
        gesture.lastPointerX = pointer.x
        gesture.lastPointerY = pointer.y
        gesture.lastMoveTime = now
      }
      const viewport = (canvas.viewportTransform ?? [1, 0, 0, 1, 0, 0]).slice()
      viewport[4] = gesture.viewportX + pointer.x - gesture.pointerX
      viewport[5] = gesture.viewportY + pointer.y - gesture.pointerY
      const limits = configRef.current.pan?.limits
      if (limits) clampPanTranslation(viewport, canvas, limits)
      canvas.setViewportTransform(viewport)
      canvas.requestRenderAll()
      canvas.setCursor("grabbing")
    }

    const zoomViewport = (event: fabric.IEvent): void => {
      const binding = configRef.current.zoom
      if (!binding || !matchesModifiers(event.e, binding.modifiers)) return
      const pointer = readPointer(event)
      if (!pointer) return
      const delta = readWheelDelta(event.e as WheelEvent)
      if (delta === 0) return
      stopMomentum()
      event.e.preventDefault()
      event.e.stopPropagation()
      const currentZoom = canvas.getZoom()
      const nextZoom = clamp(
        currentZoom * Math.exp(-delta * binding.sensitivity),
        binding.minZoom,
        binding.maxZoom,
      )
      if (nextZoom === currentZoom) return
      canvas.zoomToPoint(new fabric.Point(pointer.x, pointer.y), nextZoom)
      const limits = configRef.current.pan?.limits
      if (limits) {
        const viewport = (canvas.viewportTransform ?? [1, 0, 0, 1, 0, 0]).slice()
        clampPanTranslation(viewport, canvas, limits)
        canvas.setViewportTransform(viewport)
      }
      canvas.requestRenderAll()
    }

    const canvasEventTarget = canvas.getElement()?.parentElement ?? canvas.getElement()

    canvas.on("mouse:down:before", startPan)
    canvas.on("mouse:move", movePan)
    canvas.on("mouse:up:before", endPan)
    canvas.on("mouse:wheel", zoomViewport)
    canvasEventTarget?.addEventListener("mousedown", claimPanCapture, true)
    canvasEventTarget?.addEventListener("pointerdown", claimPanCapture, true)
    canvasEventTarget?.addEventListener("touchstart", handleTouchStart, {
      capture: true,
      passive: false,
    })
    canvasEventTarget?.addEventListener("touchmove", handleTouchMove, {
      capture: true,
      passive: false,
    })
    canvasEventTarget?.addEventListener("touchend", handleTouchEnd, true)
    canvasEventTarget?.addEventListener("touchcancel", handleTouchEnd, true)

    return () => {
      stopMomentum()
      finishPinch()
      canvas.off("mouse:down:before", startPan)
      canvas.off("mouse:move", movePan)
      canvas.off("mouse:up:before", endPan)
      canvas.off("mouse:wheel", zoomViewport)
      canvasEventTarget?.removeEventListener("mousedown", claimPanCapture, true)
      canvasEventTarget?.removeEventListener("pointerdown", claimPanCapture, true)
      canvasEventTarget?.removeEventListener("touchstart", handleTouchStart, true)
      canvasEventTarget?.removeEventListener("touchmove", handleTouchMove, true)
      canvasEventTarget?.removeEventListener("touchend", handleTouchEnd, true)
      canvasEventTarget?.removeEventListener("touchcancel", handleTouchEnd, true)
      finishPan()
    }
  }, [canvas])

  return null
}
