import { act, createRef, type ReactElement } from "react"
import { createRoot } from "react-dom/client"
import { ViewportControls, type ViewportControlsHandle } from "@digs/draft"
import { Canvas, Rect } from "@digs/react-fabric-fiber"
import { fabric } from "fabric"
import { describe, expect, it, vi } from "vitest"

interface Rendered {
  canvas: fabric.Canvas
  rerender(element: ReactElement): Promise<void>
  unmount(): Promise<void>
}

async function render(element: ReactElement): Promise<Rendered> {
  const container = document.createElement("div")
  document.body.appendChild(container)
  const root = createRoot(container)
  const canvasRef = createRef<fabric.Canvas>()

  const scene = (next: ReactElement): ReactElement => (
    <Canvas ref={canvasRef} width={800} height={600}>
      {next}
    </Canvas>
  )

  const rerender = async (next: ReactElement): Promise<void> => {
    await act(async () => {
      root.render(scene(next))
    })
  }

  await rerender(element)

  const canvas = canvasRef.current
  if (!canvas) throw new Error("Canvas did not mount")

  return {
    canvas,
    rerender,
    async unmount() {
      await act(async () => {
        root.unmount()
      })
      container.remove()
    },
  }
}

interface PointerOptions {
  button?: number
  target?: fabric.Object
  ctrlKey?: boolean
  shiftKey?: boolean
  altKey?: boolean
  metaKey?: boolean
}

function firePointerDown(
  canvas: fabric.Canvas,
  x: number,
  y: number,
  options: PointerOptions = {},
): void {
  canvas.fire("mouse:down:before", {
    e: new MouseEvent("mousedown", {
      button: options.button ?? 0,
      altKey: options.altKey ?? false,
      ctrlKey: options.ctrlKey ?? false,
      metaKey: options.metaKey ?? false,
      shiftKey: options.shiftKey ?? false,
    }),
    pointer: new fabric.Point(x, y),
    target: options.target,
  })
}

function firePointerMove(canvas: fabric.Canvas, x: number, y: number): void {
  canvas.fire("mouse:move", {
    e: new MouseEvent("mousemove"),
    pointer: new fabric.Point(x, y),
  })
}

function firePointerUp(canvas: fabric.Canvas): void {
  canvas.fire("mouse:up:before", { e: new MouseEvent("mouseup") })
}

function fireWheel(
  canvas: fabric.Canvas,
  x: number,
  y: number,
  deltaY: number,
  options: PointerOptions = {},
): WheelEvent {
  const event = new WheelEvent("wheel", {
    cancelable: true,
    deltaY,
    altKey: options.altKey ?? false,
    ctrlKey: options.ctrlKey ?? false,
    metaKey: options.metaKey ?? false,
    shiftKey: options.shiftKey ?? false,
  })
  canvas.fire("mouse:wheel", {
    e: event,
    pointer: new fabric.Point(x, y),
  })
  return event
}

function translation(canvas: fabric.Canvas): readonly [number, number] {
  const viewport = canvas.viewportTransform ?? [1, 0, 0, 1, 0, 0]
  return [viewport[4] ?? 0, viewport[5] ?? 0]
}

interface TouchPoint {
  identifier: number
  clientX: number
  clientY: number
}

function touchEvent(type: string, touches: TouchPoint[], changed = touches): Event {
  const event = new Event(type, { bubbles: true, cancelable: true })
  Object.defineProperty(event, "touches", { value: touches })
  Object.defineProperty(event, "changedTouches", { value: changed })
  return event
}

function readUpperCanvas(canvas: fabric.Canvas): HTMLCanvasElement {
  const upperCanvas = canvas.getElement().nextElementSibling
  if (!(upperCanvas instanceof HTMLCanvasElement)) throw new Error("Missing upper canvas")
  return upperCanvas
}

describe("ViewportControls", () => {
  it("pans empty-canvas drags one-to-one across zoom levels", async () => {
    const { canvas, unmount } = await render(<ViewportControls />)

    expect(translation(canvas)).toEqual([0, 0])

    canvas.setZoom(2)
    firePointerDown(canvas, 10, 20)
    expect(canvas.selection).toBe(false)

    firePointerMove(canvas, 35, 70)
    expect(translation(canvas)).toEqual([25, 50])

    firePointerMove(canvas, 15, 30)
    expect(translation(canvas)).toEqual([5, 10])

    firePointerUp(canvas)
    expect(canvas.selection).toBe(true)

    firePointerMove(canvas, 200, 200)
    expect(translation(canvas)).toEqual([5, 10])

    await unmount()
  })

  it("pans over fabric objects by default and can be limited to the background", async () => {
    const rendered = await render(<ViewportControls />)
    const rect = new fabric.Rect({ width: 20, height: 20 })

    firePointerDown(rendered.canvas, 10, 20, { target: rect })
    firePointerMove(rendered.canvas, 50, 60)
    firePointerUp(rendered.canvas)
    expect(translation(rendered.canvas)).toEqual([40, 40])

    await rendered.rerender(<ViewportControls panTarget="background" />)
    firePointerDown(rendered.canvas, 10, 20, { target: rect })
    firePointerMove(rendered.canvas, 80, 100)
    firePointerUp(rendered.canvas)
    expect(translation(rendered.canvas)).toEqual([40, 40])
    expect(rendered.canvas.selection).toBe(true)

    await rendered.unmount()
  })

  it("claims native pointer input before fabric targets objects", async () => {
    const { canvas, unmount } = await render(
      <>
        <ViewportControls />
        <Rect position={[10, 10]} width={100} height={100} fill="#ef4444" />
      </>,
    )
    const rect = canvas.getObjects()[0]
    if (!(rect instanceof fabric.Rect)) throw new Error("Rect did not mount")
    const upperCanvas = canvas.getElement().nextElementSibling
    if (!(upperCanvas instanceof HTMLCanvasElement)) throw new Error("Missing upper canvas")

    upperCanvas.dispatchEvent(
      new MouseEvent("mousedown", {
        bubbles: true,
        button: 0,
        cancelable: true,
        clientX: 30,
        clientY: 30,
      }),
    )
    expect(canvas.skipTargetFind).toBe(true)
    expect(canvas.selection).toBe(false)

    document.dispatchEvent(new MouseEvent("mousemove", { clientX: 60, clientY: 70 }))
    document.dispatchEvent(new MouseEvent("mouseup", { clientX: 60, clientY: 70 }))

    expect(translation(canvas)).toEqual([30, 40])
    expect(rect.left).toBe(10)
    expect(rect.top).toBe(10)
    expect(canvas.skipTargetFind).toBe(false)
    expect(canvas.selection).toBe(true)

    await unmount()
  })

  it("continues panning with momentum after release", async () => {
    vi.useFakeTimers({ toFake: ["Date", "requestAnimationFrame", "cancelAnimationFrame"] })
    try {
      const { canvas, unmount } = await render(<ViewportControls momentum={0.9} />)

      firePointerDown(canvas, 0, 0)
      vi.advanceTimersByTime(10)
      firePointerMove(canvas, 100, 50)
      vi.advanceTimersByTime(10)
      firePointerMove(canvas, 200, 100)
      firePointerUp(canvas)
      expect(translation(canvas)).toEqual([200, 100])

      vi.advanceTimersByTime(100)
      const [glidedX, glidedY] = translation(canvas)
      expect(glidedX).toBeGreaterThan(200)
      expect(glidedY).toBeGreaterThan(100)

      vi.advanceTimersByTime(2000)
      const settled = translation(canvas)
      vi.advanceTimersByTime(500)
      expect(translation(canvas)).toEqual(settled)

      await unmount()
    } finally {
      vi.useRealTimers()
    }
  })

  it("does not glide without momentum", async () => {
    vi.useFakeTimers({ toFake: ["Date", "requestAnimationFrame", "cancelAnimationFrame"] })
    try {
      const { canvas, unmount } = await render(<ViewportControls />)

      firePointerDown(canvas, 0, 0)
      vi.advanceTimersByTime(10)
      firePointerMove(canvas, 100, 50)
      firePointerUp(canvas)

      vi.advanceTimersByTime(500)
      expect(translation(canvas)).toEqual([100, 50])

      await unmount()
    } finally {
      vi.useRealTimers()
    }
  })

  it("stops momentum at the configured limits", async () => {
    vi.useFakeTimers({ toFake: ["Date", "requestAnimationFrame", "cancelAnimationFrame"] })
    try {
      const { canvas, unmount } = await render(
        <ViewportControls panLimits={{ x: [0, 800], y: [0, 600] }} momentum={0.9} />,
      )

      canvas.setViewportTransform([2, 0, 0, 2, -700, -500])
      firePointerDown(canvas, 0, 0)
      vi.advanceTimersByTime(10)
      firePointerMove(canvas, -50, -50)
      firePointerUp(canvas)
      expect(translation(canvas)).toEqual([-750, -550])

      vi.advanceTimersByTime(100)
      expect(translation(canvas)).toEqual([-800, -600])

      vi.advanceTimersByTime(500)
      expect(translation(canvas)).toEqual([-800, -600])

      await unmount()
    } finally {
      vi.useRealTimers()
    }
  })

  it("rejects out-of-range momentum", async () => {
    await expect(render(<ViewportControls momentum={1} />)).rejects.toThrow(
      "ViewportControls momentum must be a number from 0 (inclusive) to 1 (exclusive).",
    )
  })

  it("pans with one-finger touch", async () => {
    const { canvas, unmount } = await render(<ViewportControls />)
    const upperCanvas = readUpperCanvas(canvas)

    upperCanvas.dispatchEvent(
      touchEvent("touchstart", [{ identifier: 1, clientX: 10, clientY: 20 }]),
    )
    expect(canvas.selection).toBe(false)

    upperCanvas.dispatchEvent(
      touchEvent("touchmove", [{ identifier: 1, clientX: 35, clientY: 70 }]),
    )
    expect(translation(canvas)).toEqual([25, 50])

    upperCanvas.dispatchEvent(
      touchEvent("touchend", [], [{ identifier: 1, clientX: 35, clientY: 70 }]),
    )
    expect(canvas.selection).toBe(true)

    await unmount()
  })

  it("zooms around a two-finger pinch", async () => {
    const { canvas, unmount } = await render(<ViewportControls minZoom={1} maxZoom={1.5} />)
    const upperCanvas = readUpperCanvas(canvas)

    upperCanvas.dispatchEvent(
      touchEvent("touchstart", [
        { identifier: 1, clientX: 100, clientY: 100 },
        { identifier: 2, clientX: 200, clientY: 100 },
      ]),
    )
    expect(canvas.selection).toBe(false)

    upperCanvas.dispatchEvent(
      touchEvent("touchmove", [
        { identifier: 1, clientX: 100, clientY: 100 },
        { identifier: 2, clientX: 300, clientY: 100 },
      ]),
    )
    expect(canvas.getZoom()).toBe(1.5)
    expect(translation(canvas)).toEqual([-25, -50])

    upperCanvas.dispatchEvent(
      touchEvent(
        "touchend",
        [{ identifier: 1, clientX: 100, clientY: 100 }],
        [{ identifier: 2, clientX: 300, clientY: 100 }],
      ),
    )
    expect(canvas.selection).toBe(true)

    upperCanvas.dispatchEvent(
      touchEvent("touchend", [], [{ identifier: 1, clientX: 100, clientY: 100 }]),
    )

    await unmount()
  })

  it("pans with a remapped pointer button", async () => {
    const { canvas, unmount } = await render(<ViewportControls panButton={1} />)

    firePointerDown(canvas, 10, 20)
    firePointerMove(canvas, 40, 60)
    firePointerUp(canvas)
    expect(translation(canvas)).toEqual([0, 0])

    firePointerDown(canvas, 10, 20, { button: 1 })
    firePointerMove(canvas, 40, 60)
    firePointerUp(canvas)
    expect(translation(canvas)).toEqual([30, 40])

    await unmount()
  })

  it("requires configured modifiers for pan and zoom", async () => {
    const { canvas, unmount } = await render(
      <ViewportControls panModifiers={["shift"]} zoomModifiers={["ctrl"]} />,
    )

    firePointerDown(canvas, 10, 20, { shiftKey: true })
    firePointerMove(canvas, 30, 50)
    firePointerUp(canvas)
    expect(translation(canvas)).toEqual([20, 30])

    firePointerDown(canvas, 10, 20)
    firePointerMove(canvas, 50, 90)
    firePointerUp(canvas)
    expect(translation(canvas)).toEqual([20, 30])

    const ignoredWheel = fireWheel(canvas, 100, 100, -100)
    expect(ignoredWheel.defaultPrevented).toBe(false)
    expect(canvas.getZoom()).toBe(1)

    const zoomWheel = fireWheel(canvas, 100, 100, -100, { ctrlKey: true })
    expect(zoomWheel.defaultPrevented).toBe(true)
    expect(canvas.getZoom()).toBeGreaterThan(1)

    await unmount()
  })

  it("disables pan and zoom bindings", async () => {
    const { canvas, unmount } = await render(<ViewportControls pan={false} zoom={false} />)

    firePointerDown(canvas, 10, 20)
    firePointerMove(canvas, 40, 60)
    firePointerUp(canvas)
    expect(translation(canvas)).toEqual([0, 0])
    expect(canvas.selection).toBe(true)

    const wheel = fireWheel(canvas, 100, 100, -100)
    expect(wheel.defaultPrevented).toBe(false)
    expect(canvas.getZoom()).toBe(1)

    await unmount()
  })

  it("clamps panning to the configured content limits", async () => {
    const { canvas, unmount } = await render(
      <ViewportControls panLimits={{ x: [0, 800], y: [0, 600] }} />,
    )

    firePointerDown(canvas, 10, 20)
    firePointerMove(canvas, 400, 300)
    firePointerUp(canvas)
    expect(translation(canvas)).toEqual([0, 0])

    canvas.setViewportTransform([2, 0, 0, 2, 0, 0])
    firePointerDown(canvas, 100, 100)
    firePointerMove(canvas, 1200, 900)
    firePointerUp(canvas)
    expect(translation(canvas)).toEqual([0, 0])

    firePointerDown(canvas, 100, 100)
    firePointerMove(canvas, -2000, -2000)
    firePointerUp(canvas)
    expect(translation(canvas)).toEqual([-800, -600])

    await unmount()
  })

  it("centers limited content that is smaller than the viewport", async () => {
    const { canvas, unmount } = await render(
      <ViewportControls panLimits={{ x: [0, 800], y: [0, 600] }} />,
    )

    canvas.setZoom(0.5)
    firePointerDown(canvas, 10, 20)
    firePointerMove(canvas, 600, 500)
    firePointerUp(canvas)
    expect(translation(canvas)).toEqual([200, 150])

    await unmount()
  })

  it("centers zoomed-out content inside pan limits", async () => {
    const { canvas, unmount } = await render(
      <ViewportControls panLimits={{ x: [0, 800], y: [0, 600] }} minZoom={0.5} maxZoom={4} />,
    )

    fireWheel(canvas, 100, 100, 10000)
    expect(canvas.getZoom()).toBe(0.5)
    expect(translation(canvas)).toEqual([200, 150])

    firePointerDown(canvas, 10, 20)
    firePointerMove(canvas, 400, 300)
    firePointerUp(canvas)
    expect(translation(canvas)).toEqual([200, 150])

    await unmount()
  })

  it("leaves axes without a limit unconstrained", async () => {
    const { canvas, unmount } = await render(<ViewportControls panLimits={{ x: [0, 800] }} />)

    canvas.setViewportTransform([2, 0, 0, 2, 0, 0])
    firePointerDown(canvas, 100, 100)
    firePointerMove(canvas, 1200, 500)
    firePointerUp(canvas)
    expect(translation(canvas)).toEqual([0, 400])

    await unmount()
  })

  it("rejects malformed limits", async () => {
    await expect(render(<ViewportControls panLimits={{ x: [10, 0] }} />)).rejects.toThrow(
      "ViewportControls panLimits.x maximum must be greater than or equal to its minimum.",
    )
  })

  it("zooms around the pointer and clamps to the configured range", async () => {
    const { canvas, unmount } = await render(<ViewportControls minZoom={1.5} maxZoom={2} />)

    const zoomIn = fireWheel(canvas, 100, 100, -10000)
    expect(zoomIn.defaultPrevented).toBe(true)
    expect(canvas.getZoom()).toBe(2)
    expect(translation(canvas)).toEqual([-100, -100])

    fireWheel(canvas, 100, 100, 10000)
    expect(canvas.getZoom()).toBe(1.5)
    expect(translation(canvas)).toEqual([-50, -50])

    await unmount()
  })

  it("remaps and disables bindings through the imperative handle", async () => {
    const controlsRef = createRef<ViewportControlsHandle>()
    const { canvas, unmount } = await render(<ViewportControls ref={controlsRef} />)

    expect(controlsRef.current).not.toBeNull()
    controlsRef.current?.setPan({ button: 1 })

    firePointerDown(canvas, 10, 20)
    firePointerMove(canvas, 40, 60)
    firePointerUp(canvas)
    expect(translation(canvas)).toEqual([0, 0])

    firePointerDown(canvas, 10, 20, { button: 1 })
    firePointerMove(canvas, 40, 60)
    firePointerUp(canvas)
    expect(translation(canvas)).toEqual([30, 40])

    controlsRef.current?.setZoom(false)
    const wheel = fireWheel(canvas, 100, 100, -100)
    expect(wheel.defaultPrevented).toBe(false)
    expect(canvas.getZoom()).toBe(1)

    controlsRef.current?.setPan(false)
    firePointerDown(canvas, 10, 20, { button: 1 })
    firePointerMove(canvas, 60, 80)
    firePointerUp(canvas)
    expect(translation(canvas)).toEqual([30, 40])

    await unmount()
  })

  it("updates bindings from props and detaches on unmount", async () => {
    const { canvas, rerender, unmount } = await render(<ViewportControls />)

    await rerender(<ViewportControls zoom={false} />)
    const wheel = fireWheel(canvas, 100, 100, -100)
    expect(wheel.defaultPrevented).toBe(false)
    expect(canvas.getZoom()).toBe(1)

    await rerender(<ViewportControls />)
    firePointerDown(canvas, 10, 20)
    firePointerMove(canvas, 40, 60)
    expect(translation(canvas)).toEqual([30, 40])
    firePointerUp(canvas)

    await rerender(<></>)
    firePointerDown(canvas, 10, 20, { button: 1 })
    firePointerMove(canvas, 70, 90)
    firePointerUp(canvas)
    expect(translation(canvas)).toEqual([30, 40])

    const detachedWheel = fireWheel(canvas, 100, 100, -100)
    expect(detachedWheel.defaultPrevented).toBe(false)
    expect(canvas.getZoom()).toBe(1)

    await unmount()
  })
})
