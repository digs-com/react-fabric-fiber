import { readFile } from "node:fs/promises"
import { dirname, join } from "node:path"
import { setTimeout as delay } from "node:timers/promises"
import { fileURLToPath } from "node:url"
import { act, createRef, type ReactElement } from "react"
import { createRoot } from "react-dom/client"
import { PDFPage, PDFPageObject } from "@digs/draft"
import { Canvas } from "@digs/react-fabric-fiber"
import { fabric } from "fabric"
import { getDocument, type PDFPageProxy } from "pdfjs-dist/legacy/build/pdf.mjs"
import { afterEach, describe, expect, it, vi } from "vitest"

const fixtures = join(dirname(fileURLToPath(import.meta.url)), "fixtures")

interface LoadedPage {
  page: PDFPageProxy
  destroy(): Promise<void>
}

async function loadSamplePage(name = "sample-blueprint.pdf"): Promise<LoadedPage> {
  const bytes = await readFile(join(fixtures, name))
  const loadingTask = getDocument({ data: new Uint8Array(bytes), useSystemFonts: true })
  const document = await loadingTask.promise
  const page = await document.getPage(1)
  return {
    page,
    destroy: () => loadingTask.destroy(),
  }
}

interface Bounds {
  left: number
  top: number
  width: number
  height: number
}

function canvasBounds(object: fabric.Object, page: PDFPageObject): Bounds {
  const local = object.getBoundingRect()
  const matrix = page.calcTransformMatrix()
  const corners = [
    { x: local.left, y: local.top },
    { x: local.left + local.width, y: local.top },
    { x: local.left, y: local.top + local.height },
    { x: local.left + local.width, y: local.top + local.height },
  ].map((corner) => fabric.util.transformPoint(new fabric.Point(corner.x, corner.y), matrix))
  const xs = corners.map((corner) => corner.x)
  const ys = corners.map((corner) => corner.y)
  const left = Math.min(...xs)
  const top = Math.min(...ys)
  return {
    left,
    top,
    width: Math.max(...xs) - left,
    height: Math.max(...ys) - top,
  }
}

interface Rendered {
  canvas: fabric.Canvas
  page(): PDFPageObject
  rerender(element: ReactElement): Promise<void>
  ready(): Promise<void>
  unmount(): Promise<void>
}

async function render(element: ReactElement): Promise<Rendered> {
  const container = document.createElement("div")
  document.body.appendChild(container)
  const root = createRoot(container)
  const canvasRef = createRef<fabric.Canvas>()

  const scene = (next: ReactElement): ReactElement => (
    <Canvas ref={canvasRef} width={1200} height={1000}>
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

  const page = (): PDFPageObject => {
    const object = canvas
      .getObjects()
      .find((candidate): candidate is PDFPageObject => candidate instanceof PDFPageObject)
    if (!object) throw new Error("PDFPage did not mount")
    return object
  }

  return {
    canvas,
    page,
    rerender,
    async ready() {
      for (let attempt = 0; attempt < 500; attempt += 1) {
        await act(async () => {
          await delay(10)
        })
        const created = canvas.getObjects().some((candidate) => candidate instanceof PDFPageObject)
        if (created) return
      }
      throw new Error("PDF page did not render")
    },
    async unmount() {
      await act(async () => {
        root.unmount()
      })
      container.remove()
    },
  }
}

describe("PDFPage", () => {
  let loaded: LoadedPage | null = null

  afterEach(async () => {
    await loaded?.destroy()
    loaded = null
  })

  it("renders the sample page as a single fabric object of paths and text", async () => {
    loaded = await loadSamplePage()
    const rendered = await render(<PDFPage page={loaded.page} />)
    await rendered.ready()

    expect(rendered.canvas.getObjects()).toHaveLength(1)

    const page = rendered.page()
    expect(page).toBeInstanceOf(fabric.Object)
    expect(page).toBeInstanceOf(fabric.Group)
    const objects = page.getObjects()
    expect(page.fill).toBe("#ffffff")

    const paths = objects.filter((object): object is fabric.Path => object instanceof fabric.Path)
    const texts = objects.filter((object): object is fabric.Text => object instanceof fabric.Text)

    expect(objects).toHaveLength(paths.length + texts.length)
    expect(paths.length).toBeGreaterThan(300)
    expect(texts.length).toBeGreaterThan(50)
    expect(texts.some((text) => text.text?.includes("Great Room"))).toBe(true)
    expect(texts.some((text) => Math.abs(text.angle ?? 0) > 1)).toBe(true)
    expect(
      paths.some((path) => typeof path.stroke === "string" && (path.strokeWidth ?? 0) > 0),
    ).toBe(true)
    expect(paths.some((path) => typeof path.fill === "string")).toBe(true)

    await rendered.unmount()
  }, 30000)

  it("applies scale and position to the page", async () => {
    loaded = await loadSamplePage()
    const rendered = await render(<PDFPage page={loaded.page} scale={0.5} position={[10, 20]} />)
    await rendered.ready()

    const page = rendered.page()

    const viewport = loaded.page.getViewport({ scale: 1 })
    expect(page.left).toBe(10)
    expect(page.top).toBe(20)
    expect(page.scaleX).toBeCloseTo(0.5)
    expect(page.scaleY).toBeCloseTo(0.5)
    expect(page.width).toBeCloseTo(viewport.width)
    expect(page.height).toBeCloseTo(viewport.height)

    const room = page
      .getObjects()
      .find(
        (object): object is fabric.Text =>
          object instanceof fabric.Text && (object.text?.includes("Great Room") ?? false),
      )
    expect(room).toBeDefined()
    expect(room?.fontSize).toBeCloseTo(15)
    const bounds = room ? canvasBounds(room, page) : null
    expect(bounds?.left).toBeGreaterThanOrEqual(10)
    expect(bounds?.top).toBeGreaterThanOrEqual(20)

    await rendered.unmount()
  }, 30000)

  it("places embedded images on the page", async () => {
    loaded = await loadSamplePage("image.pdf")
    const rendered = await render(<PDFPage page={loaded.page} />)
    await rendered.ready()

    const page = rendered.page()
    const images = page
      .getObjects()
      .filter((object): object is fabric.Image => object instanceof fabric.Image)

    expect(images).toHaveLength(1)
    const image = images[0]
    const bounds = image ? canvasBounds(image, page) : null
    expect(bounds?.left).toBeCloseTo(100)
    expect(bounds?.top).toBeCloseTo(50)
    expect(bounds?.width).toBeCloseTo(50)
    expect(bounds?.height).toBeCloseTo(50)

    await rendered.unmount()
  }, 30000)

  it("uses the page's embedded rotation", async () => {
    loaded = await loadSamplePage("rotated.pdf")
    expect(loaded.page.rotate).toBe(90)

    const rendered = await render(<PDFPage page={loaded.page} />)
    await rendered.ready()

    const page = rendered.page()
    expect(page.width).toBeCloseTo(100)
    expect(page.height).toBeCloseTo(200)

    await rendered.unmount()
  }, 30000)

  it("omits the background when disabled", async () => {
    loaded = await loadSamplePage()
    const rendered = await render(<PDFPage page={loaded.page} background={false} />)
    await rendered.ready()

    expect(rendered.page().fill).toBe("")

    await rendered.unmount()
  }, 30000)

  it("reconfigures the same page object when props change", async () => {
    loaded = await loadSamplePage()
    const rendered = await render(<PDFPage page={loaded.page} />)
    await rendered.ready()

    const page = rendered.page()
    const content = page.getObjects()
    await rendered.rerender(
      <PDFPage page={loaded.page} scale={0.5} position={[5, 6]} background={false} />,
    )
    await rendered.ready()

    expect(rendered.page()).toBe(page)
    expect(page.left).toBe(5)
    expect(page.top).toBe(6)
    expect(page.scaleX).toBeCloseTo(0.5)
    expect(page.scaleY).toBeCloseTo(0.5)
    expect(page.fill).toBe("")
    expect(content.every((object) => page.getObjects().includes(object))).toBe(true)

    const room = page
      .getObjects()
      .find(
        (object): object is fabric.Text =>
          object instanceof fabric.Text && (object.text?.includes("Great Room") ?? false),
      )
    expect(room?.fontSize).toBeCloseTo(15)

    await rendered.unmount()
  }, 30000)

  it("rotates the same page object when the rotation changes", async () => {
    loaded = await loadSamplePage()
    const rendered = await render(<PDFPage page={loaded.page} />)
    await rendered.ready()

    const page = rendered.page()
    await rendered.rerender(<PDFPage page={loaded.page} rotation={90} />)
    await rendered.ready()

    expect(rendered.page()).toBe(page)
    expect(page.angle).toBe(90)

    await rendered.unmount()
  }, 30000)

  it("draws the base bitmap while zooming and visible vectors after settling", async () => {
    loaded = await loadSamplePage()
    const rendered = await render(<PDFPage page={loaded.page} />)
    await rendered.ready()
    await act(async () => {
      await delay(200)
    })

    const page = rendered.page()
    const children = page.getObjects().filter((object) => !(object instanceof fabric.Rect))
    const spies = children.map((object) => vi.spyOn(object, "render"))

    await act(async () => {
      rendered.canvas.setViewportTransform([3, 0, 0, 3, -3000, -2000])
      rendered.canvas.renderAll()
    })
    expect(spies.filter((spy) => spy.mock.calls.length > 0)).toHaveLength(0)

    await act(async () => {
      await delay(200)
    })
    await act(async () => {
      rendered.canvas.renderAll()
    })

    const drawn = spies.filter((spy) => spy.mock.calls.length > 0)
    expect(drawn.length).toBeGreaterThan(0)
    expect(drawn.length).toBeLessThan(children.length)

    await rendered.unmount()
  }, 30000)

  it("does not cache the page group", async () => {
    loaded = await loadSamplePage()
    const rendered = await render(<PDFPage page={loaded.page} />)
    await rendered.ready()
    await act(async () => {
      rendered.canvas.renderAll()
    })

    const page = rendered.page()
    expect(page.objectCaching).toBe(false)
    expect(page.shouldCache()).toBe(false)
    expect("_cacheCanvas" in page ? page._cacheCanvas : undefined).toBeFalsy()

    await rendered.unmount()
  }, 30000)
})
