import { useEffect, useRef, useState, type ReactElement } from "react"
import {
  ViewportControls,
  type ViewportControlsHandle,
  type ViewportPanBinding,
  type ViewportZoomBinding,
} from "@digs/draft"
import { Canvas, Circle, Group, Line, Rect, Text } from "@digs/react-fabric-fiber"
import { fabric } from "fabric"

const GRID = Array.from({ length: 51 }, (_, index) => index * 50 - 500)

const PAN_OPTIONS = [
  { value: "left", label: "left drag · entire canvas" },
  { value: "middle", label: "middle drag · entire canvas" },
  { value: "shift", label: "shift + left drag · entire canvas" },
  { value: "background", label: "left drag · background only" },
  { value: "off", label: "disabled" },
] as const

const ZOOM_OPTIONS = [
  { value: "wheel", label: "wheel" },
  { value: "ctrl", label: "ctrl + wheel" },
  { value: "off", label: "disabled" },
] as const

type PanMode = (typeof PAN_OPTIONS)[number]["value"]
type ZoomMode = (typeof ZOOM_OPTIONS)[number]["value"]

const PAN_BINDINGS: Record<PanMode, ViewportPanBinding | false> = {
  left: { button: 0, target: "canvas" },
  middle: { button: 1, target: "canvas" },
  shift: { button: 0, modifiers: ["shift"], target: "canvas" },
  background: { button: 0, target: "background" },
  off: false,
}

const ZOOM_BINDINGS: Record<ZoomMode, ViewportZoomBinding | false> = {
  wheel: {},
  ctrl: { modifiers: ["ctrl"] },
  off: false,
}

const controlClasses =
  "rounded-md border border-docs-border bg-docs-control px-3 py-1.5 text-xs font-semibold text-docs-text hover:border-docs-accent focus:outline-none focus:ring-2 focus:ring-docs-accent"
const selectClasses =
  "rounded-md border border-docs-border bg-docs-control px-2 py-1 text-xs text-docs-text focus:outline-none focus:ring-2 focus:ring-docs-accent"

interface ViewportReadout {
  zoom: number
  x: number
  y: number
}

function readViewport(canvas: fabric.Canvas): ViewportReadout {
  const viewport = canvas.viewportTransform ?? [1, 0, 0, 1, 0, 0]
  return { zoom: viewport[0] ?? 1, x: viewport[4] ?? 0, y: viewport[5] ?? 0 }
}

function Grid(): ReactElement {
  return (
    <>
      {GRID.map((value) => (
        <Line
          key={`vertical-${value}`}
          x1={value}
          y1={-500}
          x2={value}
          y2={2000}
          stroke="#313244"
          strokeWidth={1}
          selectable={false}
          evented={false}
        />
      ))}
      {GRID.map((value) => (
        <Line
          key={`horizontal-${value}`}
          x1={-500}
          y1={value}
          x2={2000}
          y2={value}
          stroke="#313244"
          strokeWidth={1}
          selectable={false}
          evented={false}
        />
      ))}
      <Line
        x1={-500}
        y1={0}
        x2={2000}
        y2={0}
        stroke="#45475a"
        strokeWidth={2}
        selectable={false}
        evented={false}
      />
      <Line
        x1={0}
        y1={-500}
        x2={0}
        y2={2000}
        stroke="#45475a"
        strokeWidth={2}
        selectable={false}
        evented={false}
      />
      <Text
        position={[14, -30]}
        text="0, 0"
        fontSize={14}
        fill="#a6adc8"
        selectable={false}
        evented={false}
      />
    </>
  )
}

function Scene(): ReactElement {
  return (
    <>
      <Grid />
      <Group position={[170, 120]} rotation={-6}>
        <Rect
          position={[-80, -55]}
          width={160}
          height={110}
          rx={14}
          fill="#f38ba8"
          stroke="#f5c2e7"
          strokeWidth={2}
        />
        <Circle position={[80, 55]} radius={34} fill="#89b4fa" stroke="#b4befe" strokeWidth={2} />
        <Text position={[-64, 30]} text="group" fontSize={20} fill="#11111b" />
      </Group>
      <Rect
        position={[520, 100]}
        width={190}
        height={120}
        rx={12}
        fill="#cba6f7"
        stroke="#e6c7ff"
        strokeWidth={2}
      />
      <Text position={[542, 245]} text="drag me in background mode" fontSize={16} fill="#cba6f7" />
      <Circle position={[420, 360]} radius={64} fill="#a6e3a1" stroke="#c6f7c1" strokeWidth={2} />
      <Text position={[700, 390]} text="scroll to zoom" fontSize={22} fill="#cdd6f4" />
    </>
  )
}

export function ViewportDemo(): ReactElement {
  const canvasRef = useRef<fabric.Canvas | null>(null)
  const controlsRef = useRef<ViewportControlsHandle>(null)
  const [panMode, setPanMode] = useState<PanMode>("left")
  const [zoomMode, setZoomMode] = useState<ZoomMode>("wheel")
  const [readout, setReadout] = useState<ViewportReadout>({ zoom: 1, x: 0, y: 0 })

  useEffect(() => {
    controlsRef.current?.setPan(PAN_BINDINGS[panMode])
  }, [panMode])

  useEffect(() => {
    controlsRef.current?.setZoom(ZOOM_BINDINGS[zoomMode])
  }, [zoomMode])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const syncReadout = (): void => {
      const next = readViewport(canvas)
      setReadout((current) =>
        current.zoom === next.zoom && current.x === next.x && current.y === next.y ? current : next,
      )
    }

    canvas.on("after:render", syncReadout)
    syncReadout()

    return () => {
      canvas.off("after:render", syncReadout)
    }
  }, [])

  const zoomBy = (factor: number): void => {
    const canvas = canvasRef.current
    if (!canvas) return
    const center = new fabric.Point(canvas.getWidth() / 2, canvas.getHeight() / 2)
    canvas.zoomToPoint(center, Math.min(Math.max(canvas.getZoom() * factor, 0.01), 20))
    canvas.requestRenderAll()
  }

  const resetView = (): void => {
    const canvas = canvasRef.current
    if (!canvas) return
    canvas.setViewportTransform([1, 0, 0, 1, 0, 0])
    canvas.requestRenderAll()
  }

  return (
    <div className="mt-4">
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-2 text-xs text-docs-muted">
          pan
          <select
            className={selectClasses}
            value={panMode}
            onChange={(event) => setPanMode(event.currentTarget.value as PanMode)}
          >
            {PAN_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2 text-xs text-docs-muted">
          zoom
          <select
            className={selectClasses}
            value={zoomMode}
            onChange={(event) => setZoomMode(event.currentTarget.value as ZoomMode)}
          >
            {ZOOM_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <button type="button" className={controlClasses} onClick={() => zoomBy(1.25)}>
          zoom in
        </button>
        <button type="button" className={controlClasses} onClick={() => zoomBy(0.8)}>
          zoom out
        </button>
        <button type="button" className={controlClasses} onClick={resetView}>
          reset view
        </button>
      </div>
      <div className="mt-3 h-[560px] w-full overflow-hidden rounded-lg border border-docs-border">
        <Canvas ref={canvasRef} backgroundColor="#11111b">
          <ViewportControls ref={controlsRef} />
          <Scene />
        </Canvas>
      </div>
      <p aria-live="polite" className="mt-2 font-mono text-xs text-docs-muted">
        zoom {readout.zoom.toFixed(3)} · translation [{Math.round(readout.x)},{" "}
        {Math.round(readout.y)}]
      </p>
    </div>
  )
}
