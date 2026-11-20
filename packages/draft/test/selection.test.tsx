import { act, createRef, type ReactElement } from "react"
import { createRoot } from "react-dom/client"
import { useSelection } from "@digs/draft"
import { Canvas, Rect } from "@digs/react-fabric-fiber"
import type { fabric } from "fabric"
import { describe, expect, it } from "vitest"

interface Rendered {
  canvas: fabric.Canvas
  selection(): readonly fabric.Object[]
  unmount(): Promise<void>
}

async function render(ui: ReactElement): Promise<Rendered> {
  const container = document.createElement("div")
  document.body.appendChild(container)
  const root = createRoot(container)
  const canvasRef = createRef<fabric.Canvas>()
  let selection: readonly fabric.Object[] = []

  function Probe(): null {
    selection = useSelection()
    return null
  }

  await act(async () => {
    root.render(
      <Canvas ref={canvasRef}>
        {ui}
        <Probe />
      </Canvas>,
    )
  })

  const canvas = canvasRef.current
  if (!canvas) throw new Error("Canvas did not mount")

  return {
    canvas,
    selection: () => selection,
    async unmount() {
      await act(async () => {
        root.unmount()
      })
      container.remove()
    },
  }
}

describe("useSelection", () => {
  it("tracks selection created, updated, and cleared events", async () => {
    const { canvas, selection, unmount } = await render(
      <>
        <Rect width={10} height={10} />
        <Rect width={20} height={20} />
      </>,
    )

    const [first, second] = canvas.getObjects()

    expect(selection()).toEqual([])

    await act(async () => {
      canvas.setActiveObject(first as fabric.Object)
    })
    expect(selection()).toEqual([first])

    const selected = selection()
    await act(async () => {
      canvas.fire("selection:updated")
    })
    expect(selection()).toBe(selected)

    await act(async () => {
      canvas.setActiveObject(second as fabric.Object)
    })
    expect(selection()).toEqual([second])

    await act(async () => {
      canvas.discardActiveObject()
    })
    expect(selection()).toEqual([])

    await unmount()
  })
})
