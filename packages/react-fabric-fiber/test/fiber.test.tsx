import {
  act,
  cloneElement,
  Component,
  createContext,
  createRef,
  StrictMode,
  useContext,
  type ReactElement,
  type ReactNode,
  type Ref,
} from "react"
import { createRoot } from "react-dom/client"
import {
  applyProps,
  Canvas,
  Circle,
  createFabricComponent,
  Ellipse,
  Group,
  Image,
  Line,
  Path,
  Polygon,
  Polyline,
  Primitive,
  Rect,
  Text,
  Triangle,
  useFabric,
  useInvalidate,
  type FabricEvent,
  type RectProps,
} from "@digs/react-fabric-fiber"
import { fabric } from "fabric"
import { describe, expect, it, vi } from "vitest"

type Wrap = (canvas: ReactElement) => ReactElement

interface Rendered {
  canvas: fabric.Canvas
  rerender(ui: ReactElement, wrap?: Wrap): Promise<void>
  unmount(): Promise<void>
}

async function render(ui: ReactElement, wrap: Wrap = (element) => element): Promise<Rendered> {
  const container = document.createElement("div")
  document.body.appendChild(container)
  const root = createRoot(container)
  const canvasRef = createRef<fabric.Canvas>()

  const withCanvasRef = (element: ReactElement): ReactElement =>
    cloneElement(element as ReactElement<{ ref?: Ref<fabric.Canvas> }>, { ref: canvasRef })

  const mount = (element: ReactElement, wrapper: Wrap): ReactElement =>
    wrapper(withCanvasRef(element))

  await act(async () => {
    root.render(mount(ui, wrap))
  })

  const canvas = canvasRef.current
  if (!canvas) throw new Error("Canvas did not mount")

  return {
    canvas,
    async rerender(next, nextWrap = wrap) {
      await act(async () => {
        root.render(mount(next, nextWrap))
      })
    },
    async unmount() {
      await act(async () => {
        root.unmount()
      })
    },
  }
}

describe("mount", () => {
  it("creates fabric objects for canvas children", async () => {
    const { canvas } = await render(
      <Canvas width={400} height={300}>
        <Rect position={[10, 20]} width={50} height={30} fill="red" />
        <Circle radius={12} fill="blue" />
        <Text text="hello" fontSize={24} />
      </Canvas>,
    )

    const objects = canvas.getObjects()
    expect(objects.map((object) => object.type)).toEqual(["rect", "circle", "text"])

    const [rect, circle, text] = objects as [fabric.Rect, fabric.Circle, fabric.Text]
    expect(rect.left).toBe(10)
    expect(rect.top).toBe(20)
    expect(rect.width).toBe(50)
    expect(rect.height).toBe(30)
    expect(rect.fill).toBe("red")
    expect(circle.radius).toBe(12)
    expect(text.text).toBe("hello")
    expect(text.fontSize).toBe(24)
  })

  it("creates groups with nested objects", async () => {
    const { canvas } = await render(
      <Canvas>
        <Group>
          <Rect width={10} height={10} />
          <Circle radius={4} />
        </Group>
      </Canvas>,
    )

    const objects = canvas.getObjects()
    expect(objects).toHaveLength(1)

    const group = objects[0] as fabric.Group
    expect(group.type).toBe("group")
    expect(group._objects.map((object) => object.type)).toEqual(["rect", "circle"])
  })

  it("applies canvas options", async () => {
    const { canvas, rerender } = await render(
      <Canvas width={320} height={240} backgroundColor="#123456" />,
    )

    expect(canvas.getWidth()).toBe(320)
    expect(canvas.getHeight()).toBe(240)
    expect(canvas.backgroundColor).toBe("#123456")

    await rerender(<Canvas width={500} height={400} backgroundColor="#abcdef" />)

    expect(canvas.getWidth()).toBe(500)
    expect(canvas.getHeight()).toBe(400)
    expect(canvas.backgroundColor).toBe("#abcdef")
  })
})

describe("reconciliation", () => {
  it("updates existing fabric objects in place", async () => {
    const shape = (
      fill: string,
      x: number,
      y: number,
      scale: number,
      rotation: number,
    ): ReactElement => (
      <Canvas>
        <Rect
          position={[x, y]}
          scale={scale}
          rotation={rotation}
          fill={fill}
          width={40}
          height={20}
        />
      </Canvas>
    )

    const { canvas, rerender } = await render(shape("red", 1, 2, 1, 0))
    const before = canvas.getObjects()[0] as fabric.Rect
    expect(before.fill).toBe("red")

    await rerender(shape("blue", 5, 6, 2, 45))

    const after = canvas.getObjects()[0] as fabric.Rect
    expect(after).toBe(before)
    expect(canvas.getObjects()).toHaveLength(1)
    expect(after.fill).toBe("blue")
    expect(after.left).toBe(5)
    expect(after.top).toBe(6)
    expect(after.scaleX).toBe(2)
    expect(after.scaleY).toBe(2)
    expect(after.angle).toBe(45)
  })

  it("destroys fabric objects when they leave the tree", async () => {
    const tree = (showRect: boolean): ReactElement => (
      <Canvas>
        {showRect ? <Rect width={10} height={10} /> : null}
        <Circle radius={5} />
      </Canvas>
    )

    const { canvas, rerender } = await render(tree(true))
    expect(canvas.getObjects()).toHaveLength(2)

    await rerender(tree(false))

    expect(canvas.getObjects()).toHaveLength(1)
    expect(canvas.getObjects()[0]?.type).toBe("circle")
  })

  it("keeps keyed children in source order", async () => {
    const tree = (swapped: boolean): ReactElement => (
      <Canvas>
        {swapped ? <Circle key="b" radius={3} /> : null}
        <Rect key="a" width={10} height={10} />
        {swapped ? null : <Circle key="b" radius={3} />}
      </Canvas>
    )

    const { canvas, rerender } = await render(tree(false))
    expect(canvas.getObjects().map((object) => object.type)).toEqual(["rect", "circle"])

    await rerender(tree(true))
    expect(canvas.getObjects().map((object) => object.type)).toEqual(["circle", "rect"])
  })

  it("restores fabric defaults when a prop is removed", async () => {
    const tree = (withFill: boolean): ReactElement => (
      <Canvas>
        <Rect width={10} height={10} {...(withFill ? { fill: "red" } : {})} />
      </Canvas>
    )

    const { canvas, rerender } = await render(tree(true))
    const rect = canvas.getObjects()[0] as fabric.Rect
    expect(rect.fill).toBe("red")

    await rerender(tree(false))
    expect(rect.fill).toBe(new fabric.Rect().fill)
  })

  it("places a child added to a positioned group beside its siblings", async () => {
    const tree = (extra: boolean): ReactElement => (
      <Canvas>
        <Group position={[100, 80]}>
          <Rect position={[-60, -40]} width={50} height={60} />
          <Rect position={[10, -40]} width={50} height={60} />
          {extra ? <Rect position={[80, -40]} width={50} height={60} /> : null}
        </Group>
      </Canvas>
    )

    const { canvas, rerender } = await render(tree(false))
    const group = canvas.getObjects()[0] as fabric.Group
    const worldCenters = (): Array<[number, number]> =>
      group._objects.map((object) => {
        const point = fabric.util.transformPoint(
          object.getCenterPoint(),
          group.calcTransformMatrix(),
        )
        return [point.x, point.y]
      })

    await rerender(tree(true))

    const centers = worldCenters()
    expect(group.left).toBe(100)
    expect(group.top).toBe(80)
    expect(centers).toHaveLength(3)
    expect(centers[2]?.[0] ?? 0).toBeGreaterThan(centers[1]?.[0] ?? 0)
    expect(Math.abs((centers[2]?.[1] ?? 0) - (centers[1]?.[1] ?? 0))).toBeLessThan(20)
  })

  it("moves nested children between groups", async () => {
    const tree = (inGroup: boolean): ReactElement => (
      <Canvas>
        <Group>{inGroup ? <Rect width={10} height={10} /> : null}</Group>
        {inGroup ? null : <Rect width={10} height={10} />}
      </Canvas>
    )

    const { canvas, rerender } = await render(tree(true))
    const group = canvas.getObjects()[0] as fabric.Group
    expect(group._objects).toHaveLength(1)

    await rerender(tree(false))

    expect(group._objects).toHaveLength(0)
    expect(canvas.getObjects()).toHaveLength(2)
  })
})

const pathCommandCount = (path: fabric.Path): number => path.path?.length ?? 0

const fireClick = (object: fabric.Object, point = { x: 10, y: 10 }): void => {
  object.fire("mousedown", { pointer: point })
  object.fire("mouseup", { pointer: point, isClick: true })
}

describe("events", () => {
  it("invokes handlers for fabric interactions", async () => {
    const onClick = vi.fn()
    const onMoving = vi.fn()
    const onModified = vi.fn()

    const { canvas } = await render(
      <Canvas>
        <Rect
          width={10}
          height={10}
          onClick={onClick}
          onMoving={onMoving}
          onModified={onModified}
        />
      </Canvas>,
    )

    const rect = canvas.getObjects()[0] as fabric.Rect

    fireClick(rect)
    expect(onClick).toHaveBeenCalledTimes(1)

    const clickEvent = onClick.mock.calls[0]?.[0] as FabricEvent
    expect(clickEvent.target).toBe(rect)
    expect(clickEvent.type).toBe("mouseup")

    rect.fire("mousedown", { pointer: { x: 10, y: 10 } })
    rect.fire("mouseup", { pointer: { x: 90, y: 90 }, isClick: false })
    expect(onClick).toHaveBeenCalledTimes(1)

    rect.fire("moving", {})
    expect(onMoving).toHaveBeenCalledTimes(1)
    expect((onMoving.mock.calls[0]?.[0] as FabricEvent).target).toBe(rect)

    rect.fire("modified", {})
    expect(onModified).toHaveBeenCalledTimes(1)
  })

  it("swaps handlers without recreating the fabric object", async () => {
    const first = vi.fn()
    const second = vi.fn()

    const tree = (handler: (event: FabricEvent) => void): ReactElement => (
      <Canvas>
        <Rect width={10} height={10} onClick={handler} />
      </Canvas>
    )

    const { canvas, rerender } = await render(tree(first))
    const rect = canvas.getObjects()[0] as fabric.Rect

    fireClick(rect)
    expect(first).toHaveBeenCalledTimes(1)

    await rerender(tree(second))
    expect(canvas.getObjects()[0]).toBe(rect)

    fireClick(rect)
    expect(first).toHaveBeenCalledTimes(1)
    expect(second).toHaveBeenCalledTimes(1)

    await rerender(
      <Canvas>
        <Rect width={10} height={10} />
      </Canvas>,
    )
    fireClick(rect)
    expect(first).toHaveBeenCalledTimes(1)
    expect(second).toHaveBeenCalledTimes(1)
  })
})

describe("imperative access", () => {
  it("exposes fabric objects through refs", async () => {
    const rectRef = createRef<fabric.Object>()

    const { canvas } = await render(
      <Canvas>
        <Rect ref={rectRef} width={10} height={10} />
      </Canvas>,
    )

    expect(rectRef.current).toBe(canvas.getObjects()[0])
    expect(rectRef.current?.type).toBe("rect")
  })

  it("exposes the fabric canvas through useFabric", async () => {
    let seen: fabric.Canvas | null = null

    function Probe(): null {
      seen = useFabric()
      return null
    }

    const { canvas } = await render(
      <Canvas>
        <Probe />
        <Rect width={10} height={10} />
      </Canvas>,
    )

    expect(seen).toBe(canvas)
  })

  it("throws when useFabric is called outside a canvas", async () => {
    let captured: Error | null = null

    class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
      state = { failed: false }

      static getDerivedStateFromError(): { failed: boolean } {
        return { failed: true }
      }

      componentDidCatch(error: Error): void {
        captured = error
      }

      render(): ReactNode {
        return this.state.failed ? null : this.props.children
      }
    }

    function Probe(): null {
      useFabric()
      return null
    }

    const container = document.createElement("div")
    const root = createRoot(container)
    await act(async () => {
      root.render(
        <ErrorBoundary>
          <Probe />
        </ErrorBoundary>,
      )
    })

    expect(captured).toBeInstanceOf(Error)
    expect((captured as unknown as Error).message).toBe(
      "useFabric must be called inside a <Canvas> subtree.",
    )
  })
})

describe("primitives", () => {
  it("mounts an existing fabric object and applies props to it", async () => {
    const external = new fabric.Rect({ width: 60, height: 40, fill: "red" })
    const objectRef = createRef<fabric.Object>()

    const { canvas } = await render(
      <Canvas>
        <Primitive ref={objectRef} object={external} position={[30, 40]} fill="green" />
      </Canvas>,
    )

    expect(canvas.getObjects()).toEqual([external])
    expect(external.left).toBe(30)
    expect(external.top).toBe(40)
    expect(external.fill).toBe("green")
    expect(objectRef.current).toBe(external)
  })

  it("bridges events for primitive objects", async () => {
    const external = new fabric.Rect({ width: 20, height: 20 })
    const onClick = vi.fn()

    await render(
      <Canvas>
        <Primitive object={external} onClick={onClick} />
      </Canvas>,
    )

    fireClick(external)

    expect(onClick).toHaveBeenCalledTimes(1)
    expect((onClick.mock.calls[0]?.[0] as FabricEvent).target).toBe(external)
  })

  it("removes primitive objects without disposing them", async () => {
    const external = new fabric.Rect({ width: 20, height: 20, fill: "red" })
    const tree = (visible: boolean): ReactElement => (
      <Canvas>
        {visible ? <Primitive object={external} /> : null}
        <Circle radius={3} />
      </Canvas>
    )

    const { canvas, rerender } = await render(tree(true))
    expect(canvas.getObjects()).toContain(external)

    await rerender(tree(false))

    expect(canvas.getObjects()).not.toContain(external)
    expect(external.fill).toBe("red")
    expect(external.width).toBe(20)
  })

  it("mounts a new primitive when the key changes", async () => {
    const first = new fabric.Rect({ width: 10, height: 10, fill: "red" })
    const second = new fabric.Circle({ radius: 5, fill: "blue" })
    const onClick = vi.fn()

    const tree = (object: fabric.Object, key: string): ReactElement => (
      <Canvas>
        <Rect width={1} height={1} />
        <Primitive key={key} object={object} onClick={onClick} />
      </Canvas>
    )

    const { canvas, rerender } = await render(tree(first, "first"))
    expect(canvas.getObjects()).toHaveLength(2)
    expect(canvas.getObjects()[1]).toBe(first)

    fireClick(first)
    expect(onClick).toHaveBeenCalledTimes(1)

    await rerender(tree(second, "second"))

    expect(canvas.getObjects()).toHaveLength(2)
    expect(canvas.getObjects()[1]).toBe(second)
    expect(canvas.getObjects()).not.toContain(first)

    fireClick(second)
    expect(onClick).toHaveBeenCalledTimes(2)

    fireClick(first)
    expect(onClick).toHaveBeenCalledTimes(2)
  })

  it("hosts children when the primitive object is a group", async () => {
    const group = new fabric.Group([])
    const childRef = createRef<fabric.Object>()

    const { canvas } = await render(
      <Canvas>
        <Primitive object={group}>
          <Rect ref={childRef} width={20} height={20} />
        </Primitive>
      </Canvas>,
    )

    expect(canvas.getObjects()[0]).toBe(group)
    expect(group._objects).toHaveLength(1)
    expect(group._objects[0]).toBe(childRef.current)
  })

  it("hosts fresh children when the group primitive key changes", async () => {
    const firstGroup = new fabric.Group([])
    const secondGroup = new fabric.Group([])

    const tree = (object: fabric.Group, key: string): ReactElement => (
      <Canvas>
        <Primitive key={key} object={object}>
          <Rect width={20} height={20} />
        </Primitive>
      </Canvas>
    )

    const { canvas, rerender } = await render(tree(firstGroup, "first"))
    expect(firstGroup._objects).toHaveLength(1)

    await rerender(tree(secondGroup, "second"))

    expect(canvas.getObjects()[0]).toBe(secondGroup)
    expect(secondGroup._objects).toHaveLength(1)
    expect(canvas.getObjects()[0]?.type).toBe("group")
  })

  it("rejects primitives without a fabric object", async () => {
    function Broken(): ReactElement {
      return (
        <Canvas>
          <Primitive object={undefined as unknown as fabric.Object} />
        </Canvas>
      )
    }

    const container = document.createElement("div")
    const root = createRoot(container)

    await expect(
      act(async () => {
        root.render(<Broken />)
      }),
    ).rejects.toThrow("<Primitive> requires an `object` prop")
  })
})

describe("fabric primitives", () => {
  it("exposes every fabric primitive constructor", () => {
    const constructors = [
      "Line",
      "Circle",
      "Triangle",
      "Ellipse",
      "Rect",
      "Polyline",
      "Polygon",
      "Group",
      "Text",
      "Image",
      "Path",
    ]

    for (const name of constructors) {
      expect(typeof Reflect.get(fabric, name)).toBe("function")
    }

    expect(typeof fabric.Image.filters.Blur).toBe("function")
    expect(typeof fabric.Image.filters.Brightness).toBe("function")
  })

  it("mounts every primitive element", async () => {
    const imageElement = document.createElement("canvas")
    imageElement.width = 16
    imageElement.height = 16

    const { canvas } = await render(
      <Canvas>
        <Line x1={0} y1={0} x2={40} y2={20} stroke="red" />
        <Triangle width={30} height={20} fill="orange" />
        <Ellipse rx={25} ry={10} fill="purple" />
        <Polyline
          points={[
            { x: 0, y: 0 },
            { x: 20, y: 20 },
            { x: 40, y: 0 },
          ]}
          stroke="blue"
        />
        <Polygon
          points={[
            { x: 0, y: 0 },
            { x: 20, y: 0 },
            { x: 10, y: 20 },
          ]}
          fill="green"
        />
        <Path path="M 0 0 L 30 30" stroke="black" />
        <Image element={imageElement} position={[200, 200]} />
      </Canvas>,
    )

    expect(canvas.getObjects().map((object) => object.type)).toEqual([
      "line",
      "triangle",
      "ellipse",
      "polyline",
      "polygon",
      "path",
      "image",
    ])

    const [line, triangle, ellipse, polyline, polygon, path, image] = canvas.getObjects() as [
      fabric.Line,
      fabric.Triangle,
      fabric.Ellipse,
      fabric.Polyline,
      fabric.Polygon,
      fabric.Path,
      fabric.Image,
    ]

    expect([line.x1, line.y1, line.x2, line.y2]).toEqual([0, 0, 40, 20])
    expect(triangle.width).toBe(30)
    expect(ellipse.rx).toBe(25)
    expect(polyline.points).toHaveLength(3)
    expect(polygon.points).toHaveLength(3)
    expect(pathCommandCount(path)).toBeGreaterThan(0)
    expect(image.getElement()).toBe(imageElement)
    expect(image.left).toBe(200)
  })

  it("recomputes polyline and path geometry in place", async () => {
    const tree = (points: Array<{ x: number; y: number }>, path: string): ReactElement => (
      <Canvas>
        <Polyline points={points} />
        <Path path={path} />
      </Canvas>
    )

    const { canvas, rerender } = await render(
      tree(
        [
          { x: 0, y: 0 },
          { x: 10, y: 10 },
        ],
        "M 0 0 L 10 10",
      ),
    )

    const polyline = canvas.getObjects()[0] as fabric.Polyline
    const path = canvas.getObjects()[1] as fabric.Path
    const previousWidth = polyline.width ?? 0
    const previousPathLength = pathCommandCount(path)

    await rerender(
      tree(
        [
          { x: 0, y: 0 },
          { x: 30, y: 30 },
          { x: 60, y: 0 },
          { x: 90, y: 30 },
        ],
        "M 0 0 L 10 10 L 20 0 L 30 30",
      ),
    )

    expect(canvas.getObjects()[0]).toBe(polyline)
    expect(canvas.getObjects()[1]).toBe(path)
    expect(polyline.points).toHaveLength(4)
    expect(polyline.width ?? 0).toBeGreaterThan(previousWidth)
    expect(pathCommandCount(path)).toBeGreaterThan(previousPathLength)
  })

  it("swaps image elements in place", async () => {
    const first = document.createElement("canvas")
    first.width = 8
    first.height = 8
    const second = document.createElement("canvas")
    second.width = 40
    second.height = 24

    const tree = (element: HTMLCanvasElement): ReactElement => (
      <Canvas>
        <Image element={element} />
      </Canvas>
    )

    const { canvas, rerender } = await render(tree(first))
    const image = canvas.getObjects()[0] as fabric.Image

    await rerender(tree(second))

    expect(canvas.getObjects()[0]).toBe(image)
    expect(image.getElement()).toBe(second)
    expect(image.width).toBe(40)
  })
})

describe("escape hatches", () => {
  it("reports unknown element types", async () => {
    const Mystery = createFabricComponent("mystery")
    const container = document.createElement("div")
    const root = createRoot(container)

    await expect(
      act(async () => {
        root.render(
          <Canvas>
            <Mystery />
          </Canvas>,
        )
      }),
    ).rejects.toThrow("<mystery> is not a fabric element.")
  })

  it("exposes the canvas and invalidation through hooks", async () => {
    let seenCanvas: fabric.Canvas | null = null
    let invalidate: (() => void) | null = null

    function Probe(): null {
      seenCanvas = useFabric()
      invalidate = useInvalidate()
      return null
    }

    const { canvas } = await render(
      <Canvas>
        <Probe />
      </Canvas>,
    )
    const requestRenderAll = vi.spyOn(canvas, "requestRenderAll")

    await act(async () => {
      invalidate?.()
    })

    expect(seenCanvas).toBe(canvas)
    expect(requestRenderAll).toHaveBeenCalled()
  })

  it("mutates fabric objects imperatively with applyProps", () => {
    const rect = new fabric.Rect({ width: 10, height: 10 })

    applyProps(rect, { position: [5, 6], scale: 2, rotation: 30, fill: "crimson" })

    expect(rect.left).toBe(5)
    expect(rect.top).toBe(6)
    expect(rect.scaleX).toBe(2)
    expect(rect.angle).toBe(30)
    expect(rect.fill).toBe("crimson")
  })
})

const canvasFills = (canvas: fabric.Canvas): unknown[] =>
  canvas.getObjects().map((object) => (object as fabric.Rect).fill)

describe("managed ordering", () => {
  it("orders managed children by zIndex then JSX order", async () => {
    const { canvas } = await render(
      <Canvas>
        <Rect zIndex={2} width={10} height={10} fill="red" />
        <Rect zIndex={1} width={10} height={10} fill="blue" />
      </Canvas>,
    )

    expect(canvasFills(canvas)).toEqual(["blue", "red"])
  })

  it("repositions on zIndex changes without add or remove events", async () => {
    const onAdded = vi.fn()
    const onRemoved = vi.fn()
    const tree = (zIndex: number): ReactElement => (
      <Canvas>
        <Rect
          zIndex={zIndex}
          width={10}
          height={10}
          fill="red"
          onAdded={onAdded}
          onRemoved={onRemoved}
        />
        <Rect width={10} height={10} fill="blue" />
      </Canvas>
    )

    const { canvas, rerender } = await render(tree(1))
    expect(canvasFills(canvas)).toEqual(["blue", "red"])

    onAdded.mockClear()
    onRemoved.mockClear()

    await rerender(tree(-1))
    expect(canvasFills(canvas)).toEqual(["red", "blue"])
    expect(onAdded).not.toHaveBeenCalled()
    expect(onRemoved).not.toHaveBeenCalled()
  })
})

const ThemeContext = createContext("default")

describe("provider bridging", () => {
  it("provides outer context values to canvas children and updates them", async () => {
    let seenTheme = ""
    function Probe(): null {
      seenTheme = useContext(ThemeContext)
      return null
    }

    const wrap =
      (theme: string): Wrap =>
      (canvas) => <ThemeContext.Provider value={theme}>{canvas}</ThemeContext.Provider>

    const tree = (
      <Canvas>
        <Probe />
      </Canvas>
    )

    const { rerender } = await render(tree, wrap("dark"))
    expect(seenTheme).toBe("dark")

    await rerender(tree, wrap("light"))
    expect(seenTheme).toBe("light")
  })

  it("bridges the nearest provider value", async () => {
    const OrderContext = createContext("default")
    let seen = ""
    function Probe(): null {
      seen = useContext(OrderContext)
      return null
    }

    await render(
      <Canvas>
        <Probe />
      </Canvas>,
      (canvas) => (
        <OrderContext.Provider value="outer">
          <OrderContext.Provider value="inner">{canvas}</OrderContext.Provider>
        </OrderContext.Provider>
      ),
    )

    expect(seen).toBe("inner")
  })
})

describe("image lifecycle", () => {
  it("reports loads, sets the element, and forwards crossOrigin", async () => {
    const element = document.createElement("img")
    const calls: Array<{ url: string; crossOrigin: string | undefined }> = []
    const loadImage = vi
      .spyOn(fabric.util, "loadImage")
      .mockImplementation((url, callback, context, crossOrigin) => {
        calls.push({ url, crossOrigin })
        const invoke = callback as unknown as (
          this: unknown,
          image: unknown,
          isError: boolean,
        ) => void
        invoke.call(context, element, false)
      })
    const onLoad = vi.fn()
    const onError = vi.fn()

    try {
      const { canvas } = await render(
        <Canvas>
          <Image
            src="https://example.com/a.png"
            crossOrigin="anonymous"
            onLoad={onLoad}
            onError={onError}
          />
        </Canvas>,
      )

      const image = canvas.getObjects()[0] as fabric.Image
      expect(onLoad).toHaveBeenCalledWith(image)
      expect(onError).not.toHaveBeenCalled()
      expect(image.getElement()).toBe(element)
      expect(calls).toEqual([{ url: "https://example.com/a.png", crossOrigin: "anonymous" }])
    } finally {
      loadImage.mockRestore()
    }
  })

  it("reports failures with the failing src", async () => {
    const loadImage = vi
      .spyOn(fabric.util, "loadImage")
      .mockImplementation((_url, callback, context) => {
        const invoke = callback as unknown as (
          this: unknown,
          image: unknown,
          isError: boolean,
        ) => void
        invoke.call(context, null, true)
      })
    const onLoad = vi.fn()
    const onError = vi.fn()

    try {
      await render(
        <Canvas>
          <Image src="https://example.com/missing.png" onLoad={onLoad} onError={onError} />
        </Canvas>,
      )

      expect(onError).toHaveBeenCalledWith("https://example.com/missing.png")
      expect(onLoad).not.toHaveBeenCalled()
    } finally {
      loadImage.mockRestore()
    }
  })

  it("reloads on src changes with the current handlers", async () => {
    const first = vi.fn()
    const second = vi.fn()
    const loadImage = vi
      .spyOn(fabric.util, "loadImage")
      .mockImplementation((_url, callback, context) => {
        const invoke = callback as unknown as (
          this: unknown,
          image: unknown,
          isError: boolean,
        ) => void
        invoke.call(context, document.createElement("img"), false)
      })

    const tree = (src: string, onLoad: (image: fabric.Image) => void): ReactElement => (
      <Canvas>
        <Image src={src} onLoad={onLoad} />
      </Canvas>
    )

    try {
      const { rerender } = await render(tree("https://example.com/a.png", first))
      expect(first).toHaveBeenCalledTimes(1)

      await rerender(tree("https://example.com/b.png", second))
      expect(first).toHaveBeenCalledTimes(1)
      expect(second).toHaveBeenCalledTimes(1)
    } finally {
      loadImage.mockRestore()
    }
  })
})

describe("removal semantics", () => {
  it("fires onRemoved for a canvas child exactly once", async () => {
    const onRemoved = vi.fn()
    const tree = (show: boolean): ReactElement => (
      <Canvas>{show ? <Rect width={10} height={10} onRemoved={onRemoved} /> : null}</Canvas>
    )

    const { rerender } = await render(tree(true))
    await rerender(tree(false))

    expect(onRemoved).toHaveBeenCalledTimes(1)
    expect((onRemoved.mock.calls[0]?.[0] as FabricEvent).target).toBeInstanceOf(fabric.Rect)
  })

  it("fires onRemoved for a group child exactly once", async () => {
    const onRemoved = vi.fn()
    const tree = (show: boolean): ReactElement => (
      <Canvas>
        <Group>{show ? <Rect width={10} height={10} onRemoved={onRemoved} /> : null}</Group>
      </Canvas>
    )

    const { rerender } = await render(tree(true))
    await rerender(tree(false))

    expect(onRemoved).toHaveBeenCalledTimes(1)
    expect((onRemoved.mock.calls[0]?.[0] as FabricEvent).target).toBeInstanceOf(fabric.Rect)
  })

  it("deletes props that fabric never owned when they are removed", async () => {
    const tree = (withData: boolean): ReactElement => (
      <Canvas>
        <Rect
          width={10}
          height={10}
          {...(withData ? ({ data: { id: 1 } } as unknown as RectProps) : {})}
        />
      </Canvas>
    )

    const { canvas, rerender } = await render(tree(true))
    const rect = canvas.getObjects()[0] as fabric.Rect
    expect("data" in rect).toBe(true)

    await rerender(tree(false))
    expect("data" in rect).toBe(false)
  })

  it("resets captured mapped defaults when position is removed", async () => {
    const tree = (positioned: boolean): ReactElement => (
      <Canvas>
        <Rect width={10} height={10} {...(positioned ? { position: [10, 20] as const } : {})} />
      </Canvas>
    )

    const { canvas, rerender } = await render(tree(true))
    const rect = canvas.getObjects()[0] as fabric.Rect
    expect(rect.left).toBe(10)
    expect(rect.top).toBe(20)

    await rerender(tree(false))
    expect(rect.left).toBe(0)
    expect(rect.top).toBe(0)
  })

  it("requires a new key to change the primitive object", async () => {
    const first = new fabric.Rect({ width: 10, height: 10 })
    const second = new fabric.Circle({ radius: 5 })
    const tree = (object: fabric.Object): ReactElement => (
      <Canvas>
        <Primitive object={object} />
      </Canvas>
    )

    const { rerender } = await render(tree(first))

    await expect(rerender(tree(second))).rejects.toThrow(
      "Changing the <Primitive> object prop is not supported. Pass a new key to mount the new object.",
    )
  })
})

class TestCanvas extends fabric.Canvas {}

const factoryCanvas = (
  created: TestCanvas[],
): ((element: HTMLCanvasElement, options: fabric.ICanvasOptions) => TestCanvas) => {
  return (element, options) => {
    const canvas = new TestCanvas(element, options)
    created.push(canvas)
    return canvas
  }
}

const pageRect = (fill: string): fabric.Rect => new fabric.Rect({ width: 10, height: 10, fill })

describe("canvas ownership", () => {
  it("constructs the canvas through the factory and disposes it on unmount", async () => {
    const created: TestCanvas[] = []
    const dispose = vi.spyOn(TestCanvas.prototype, "dispose")

    const { canvas, unmount } = await render(
      <Canvas width={120} height={80} selection={false} canvasFactory={factoryCanvas(created)} />,
    )

    expect(created).toEqual([canvas])
    expect(canvas).toBeInstanceOf(TestCanvas)
    expect(canvas.selection).toBe(false)
    expect(canvas.getWidth()).toBe(120)
    expect(canvas.getHeight()).toBe(80)
    expect(dispose).not.toHaveBeenCalled()

    await unmount()

    expect(dispose).toHaveBeenCalledTimes(1)
    expect(dispose.mock.contexts[0]).toBe(canvas)
  })

  it("disposes only the superseded canvas when strict mode remounts", async () => {
    const created: TestCanvas[] = []
    const dispose = vi.spyOn(TestCanvas.prototype, "dispose")

    const { canvas, unmount } = await render(
      <Canvas canvasFactory={factoryCanvas(created)} />,
      (element) => <StrictMode>{element}</StrictMode>,
    )

    expect(created.length).toBeGreaterThan(1)
    expect(created[created.length - 1]).toBe(canvas)
    expect(dispose.mock.contexts).toEqual(created.slice(0, -1))

    await unmount()

    expect(dispose).toHaveBeenCalledTimes(created.length)
    expect(dispose.mock.contexts[dispose.mock.contexts.length - 1]).toBe(canvas)
  })
})

describe("external object placement", () => {
  it("hoists managed children above external objects when placement is below", async () => {
    const rendered = await render(<Canvas externalObjectPlacement="below" />)
    const { rerender } = rendered

    rendered.canvas.add(pageRect("page"))

    await rerender(
      <Canvas externalObjectPlacement="below">
        <Rect zIndex={2} width={10} height={10} fill="red" />
        <Rect zIndex={1} width={10} height={10} fill="blue" />
      </Canvas>,
    )

    expect(canvasFills(rendered.canvas)).toEqual(["page", "blue", "red"])
  })

  it("repairs the managed block after an external insertion and zIndex change", async () => {
    const tree = (redZIndex: number): ReactElement => (
      <Canvas externalObjectPlacement="below">
        <Rect zIndex={redZIndex} width={10} height={10} fill="red" />
        <Rect zIndex={1} width={10} height={10} fill="blue" />
      </Canvas>
    )

    const { canvas, rerender } = await render(tree(2))
    canvas.add(pageRect("page"))
    await rerender(tree(2))
    expect(canvasFills(canvas)).toEqual(["page", "blue", "red"])

    canvas.add(pageRect("second"))
    const added = vi.fn()
    const removed = vi.fn()
    canvas.on("object:added", added)
    canvas.on("object:removed", removed)

    await rerender(tree(0))

    expect(canvasFills(canvas)).toEqual(["page", "second", "red", "blue"])
    expect(added).not.toHaveBeenCalled()
    expect(removed).not.toHaveBeenCalled()
  })

  it("leaves external objects above managed children by default", async () => {
    const tree = (extra: boolean): ReactElement => (
      <Canvas>
        <Rect width={10} height={10} fill="red" />
        {extra ? <Rect width={10} height={10} fill="blue" /> : null}
      </Canvas>
    )

    const { canvas, rerender } = await render(tree(false))
    canvas.add(pageRect("page"))
    expect(canvasFills(canvas)).toEqual(["red", "page"])

    await rerender(tree(true))

    expect(canvasFills(canvas)).toEqual(["red", "blue", "page"])
  })
})
