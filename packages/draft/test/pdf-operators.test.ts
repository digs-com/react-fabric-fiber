import { fabric } from "fabric"
import type { PDFPageProxy } from "pdfjs-dist"
import { describe, expect, it } from "vitest"

import { OPERATORS } from "../src/pdf/operators"
import { buildPDFPage } from "../src/pdf/page"

interface FakeObjects {
  objs?: Record<string, unknown>
  commonObjs?: Record<string, unknown>
}

function fakeStore(values: Record<string, unknown>, deferred: boolean) {
  return {
    get(
      id: string,
      callback: (data: unknown) => void,
      errorCallback: (error: unknown) => void,
    ): void {
      if (!(id in values)) {
        errorCallback(new Error(`Missing object ${id}`))
        return
      }
      const value = values[id]
      if (deferred) queueMicrotask(() => callback(value))
      else callback(value)
    },
  }
}

function fakePage(
  operatorList: unknown,
  textContent: unknown,
  objects: FakeObjects = {},
  deferred = false,
): PDFPageProxy {
  const page = {
    rotate: 0,
    getViewport: () => ({ width: 100, height: 100, transform: [1, 0, 0, -1, 0, 100] }),
    getOperatorList: async () => operatorList,
    getTextContent: async () => textContent,
    render: () => ({ promise: Promise.resolve() }),
    objs: fakeStore(objects.objs ?? {}, deferred),
    commonObjs: fakeStore(objects.commonObjs ?? {}, deferred),
  }
  return page as unknown as PDFPageProxy
}

function textsIn(objects: readonly fabric.Object[]): fabric.Text[] {
  return objects.filter((object): object is fabric.Text => object instanceof fabric.Text)
}

function rectangle(left: number, bottom: number, right: number, top: number): number[] {
  return [0, left, bottom, 1, right, bottom, 1, right, top, 1, left, top, 4]
}

function columnInk(objects: readonly fabric.Object[], zoom: number, x: number, y: number): number {
  const element = document.createElement("canvas")
  const canvas = new fabric.StaticCanvas(element, {
    width: 400,
    height: 400,
    backgroundColor: "#ffffff",
    renderOnAddRemove: false,
    enableRetinaScaling: false,
  })
  canvas.setViewportTransform([zoom, 0, 0, zoom, 0, 0])
  for (const object of objects) {
    object.objectCaching = false
    canvas.add(object)
  }
  canvas.renderAll()

  const context = element.getContext("2d")
  if (!context) return 0
  const data = context.getImageData(Math.round(x * zoom), Math.round(y * zoom) - 6, 1, 13).data
  let ink = 0
  for (let index = 0; index < data.length; index += 4) ink += (255 - (data[index] ?? 0)) / 255
  return ink
}

describe("PDF operator rendering", () => {
  it("clips painted paths to the active PDF clip region", async () => {
    const page = fakePage(
      {
        fnArray: [
          OPERATORS.save,
          OPERATORS.clip,
          OPERATORS.constructPath,
          OPERATORS.constructPath,
          OPERATORS.constructPath,
          OPERATORS.constructPath,
          OPERATORS.restore,
          OPERATORS.constructPath,
        ],
        argsArray: [
          null,
          null,
          [OPERATORS.endPath, [rectangle(20, 20, 40, 40)], [20, 20, 40, 40]],
          [OPERATORS.fill, [rectangle(60, 60, 80, 80)], [60, 60, 80, 80]],
          [OPERATORS.fill, [rectangle(30, 30, 35, 35)], [30, 30, 35, 35]],
          [OPERATORS.fill, [rectangle(35, 35, 60, 60)], [35, 35, 60, 60]],
          null,
          [OPERATORS.fill, [rectangle(60, 60, 80, 80)], [60, 60, 80, 80]],
        ],
      },
      { items: [], styles: {} },
    )

    const result = await buildPDFPage(page, {
      scale: 1,
      rotation: 0,
      position: [0, 0],
      opacity: 1,
    })
    const paths = result.objects.filter((object) => object instanceof fabric.Path)

    expect(paths).toHaveLength(3)
    expect(paths[0]?.clipPath).toBeDefined()
    expect(paths[0]?.clipPath?.absolutePositioned).toBe(true)
    expect(paths[1]?.clipPath).toBeDefined()
    expect(paths[2]?.clipPath).toBeUndefined()
  })

  it("ignores clip regions that cover the whole viewport", async () => {
    const page = fakePage(
      {
        fnArray: [
          OPERATORS.save,
          OPERATORS.clip,
          OPERATORS.constructPath,
          OPERATORS.constructPath,
          OPERATORS.restore,
        ],
        argsArray: [
          null,
          null,
          [OPERATORS.endPath, [rectangle(0, 0, 100, 100)]],
          [OPERATORS.fill, [rectangle(20, 20, 40, 40)]],
          null,
        ],
      },
      { items: [], styles: {} },
    )

    const result = await buildPDFPage(page, {
      scale: 1,
      rotation: 0,
      position: [0, 0],
      opacity: 1,
    })
    const paths = result.objects.filter((object) => object instanceof fabric.Path)

    expect(paths).toHaveLength(1)
    expect(paths[0]?.clipPath).toBeUndefined()
  })

  it("shares one clip object between identical clip regions", async () => {
    const page = fakePage(
      {
        fnArray: [
          OPERATORS.save,
          OPERATORS.clip,
          OPERATORS.constructPath,
          OPERATORS.constructPath,
          OPERATORS.constructPath,
          OPERATORS.restore,
          OPERATORS.save,
          OPERATORS.clip,
          OPERATORS.constructPath,
          OPERATORS.constructPath,
          OPERATORS.restore,
        ],
        argsArray: [
          null,
          null,
          [OPERATORS.endPath, [rectangle(20, 20, 40, 40)]],
          [OPERATORS.fill, [rectangle(30, 30, 35, 35)]],
          [OPERATORS.fill, [rectangle(35, 35, 60, 60)]],
          null,
          null,
          null,
          [OPERATORS.endPath, [rectangle(20, 20, 40, 40)]],
          [OPERATORS.fill, [rectangle(25, 25, 30, 30)]],
          null,
        ],
      },
      { items: [], styles: {} },
    )

    const result = await buildPDFPage(page, {
      scale: 1,
      rotation: 0,
      position: [0, 0],
      opacity: 1,
    })
    const paths = result.objects.filter((object) => object instanceof fabric.Path)

    expect(paths).toHaveLength(3)
    expect(paths[0]?.clipPath).toBeDefined()
    expect(paths[1]?.clipPath).toBe(paths[0]?.clipPath)
    expect(paths[2]?.clipPath).toBe(paths[0]?.clipPath)
  })

  it("applies clips without fabric clip caches when Path2D is available", async () => {
    const globalScope = globalThis as { Path2D?: unknown }
    const previousPath2d = globalScope.Path2D
    globalScope.Path2D = class {
      constructor(_path: string) {}
    }

    try {
      const page = fakePage(
        {
          fnArray: [
            OPERATORS.save,
            OPERATORS.clip,
            OPERATORS.constructPath,
            OPERATORS.constructPath,
            OPERATORS.restore,
          ],
          argsArray: [
            null,
            null,
            [OPERATORS.endPath, [rectangle(20, 20, 40, 40)]],
            [OPERATORS.fill, [rectangle(30, 30, 35, 35)]],
            null,
          ],
        },
        { items: [], styles: {} },
      )

      const result = await buildPDFPage(page, {
        scale: 1,
        rotation: 0,
        position: [0, 0],
        opacity: 1,
      })
      const paths = result.objects.filter((object) => object instanceof fabric.Path)

      expect(paths).toHaveLength(1)
      expect(paths[0]?.clipPath).toBeUndefined()
      expect(Reflect.get(paths[0] as fabric.Object, "clips")).toHaveLength(1)
    } finally {
      globalScope.Path2D = previousPath2d
    }
  })

  it("applies typed-array form XObject matrices to paths", async () => {
    const form = new Float32Array([1, 0, 0, 1, 10, 20])
    const page = fakePage(
      {
        fnArray: [
          OPERATORS.save,
          OPERATORS.paintFormXObjectBegin,
          OPERATORS.constructPath,
          OPERATORS.paintFormXObjectEnd,
          OPERATORS.restore,
        ],
        argsArray: [
          null,
          [form, [0, 0, 20, 30]],
          [OPERATORS.fill, [[0, 0, 0, 1, 0, 10, 1, 10, 10, 1, 10, 0, 4]], [0, 0, 10, 10]],
          null,
          null,
        ],
      },
      { items: [], styles: {} },
    )

    const result = await buildPDFPage(page, {
      scale: 1,
      rotation: 0,
      position: [0, 0],
      opacity: 1,
    })
    const path = result.objects.find((object) => object instanceof fabric.Path)
    expect(path).toBeDefined()
    const bounds = path?.getBoundingRect()
    expect(bounds?.left).toBeCloseTo(10)
    expect(bounds?.top).toBeCloseTo(70)
    expect(bounds?.width).toBeCloseTo(10)
    expect(bounds?.height).toBeCloseTo(10)
  })

  it("draws zero-width strokes one device pixel wide at every zoom", async () => {
    const page = fakePage(
      {
        fnArray: [
          OPERATORS.setLineWidth,
          OPERATORS.constructPath,
          OPERATORS.setLineWidth,
          OPERATORS.constructPath,
        ],
        argsArray: [
          [0],
          [OPERATORS.stroke, [0, 10, 10, 1, 80, 10]],
          [2],
          [OPERATORS.stroke, [0, 10, 20, 1, 80, 20]],
        ],
      },
      { items: [], styles: {} },
    )

    const result = await buildPDFPage(page, {
      scale: 1,
      rotation: 0,
      position: [0, 0],
      opacity: 1,
    })

    const hairlineAt1 = columnInk(result.objects, 1, 50, 90)
    const hairlineAt4 = columnInk(result.objects, 4, 50, 90)
    const thickAt1 = columnInk(result.objects, 1, 50, 80)
    const thickAt4 = columnInk(result.objects, 4, 50, 80)

    expect(hairlineAt1).toBeGreaterThan(0.5)
    expect(hairlineAt1).toBeLessThan(1.5)
    expect(hairlineAt4).toBeGreaterThan(0.5)
    expect(hairlineAt4).toBeLessThan(1.5)
    expect(thickAt1).toBeGreaterThan(1.5)
    expect(thickAt4).toBeGreaterThan(6)
  })

  it("skips optional content that pdf.js reports as hidden", async () => {
    const page = fakePage(
      {
        fnArray: [
          OPERATORS.beginMarkedContentProps,
          OPERATORS.constructPath,
          OPERATORS.setFont,
          OPERATORS.showText,
          OPERATORS.endMarkedContent,
          OPERATORS.beginMarkedContentProps,
          OPERATORS.constructPath,
          OPERATORS.endMarkedContent,
        ],
        argsArray: [
          ["OC", { type: "OCMD", ids: ["hidden"] }],
          [OPERATORS.fill, [rectangle(10, 10, 40, 40)]],
          ["f1", 12],
          [[{ unicode: "Hi", fontChar: "H", width: 500 }]],
          null,
          ["OC", { type: "OCMD", ids: ["shown"] }],
          [OPERATORS.fill, [rectangle(60, 60, 90, 90)]],
          null,
        ],
      },
      {
        items: [
          {
            str: "Hi",
            transform: [12, 0, 0, 12, 10, 90],
            width: 14,
            height: 12,
            fontName: "f1",
          },
        ],
        styles: { f1: { fontFamily: "sans-serif", ascent: 0.8, vertical: false } },
      },
    )
    Reflect.set(page as unknown as Record<string, unknown>, "_transport", {
      getOptionalContentConfig: async () => ({
        isVisible: (properties: unknown) => {
          const ids = Reflect.get(properties as object, "ids")
          return Array.isArray(ids) && ids[0] === "shown"
        },
      }),
    })

    const result = await buildPDFPage(page, {
      scale: 1,
      rotation: 0,
      position: [0, 0],
      opacity: 1,
    })
    const paths = result.objects.filter((object) => object instanceof fabric.Path)
    const texts = result.objects.filter((object) => object instanceof fabric.Text)

    expect(paths).toHaveLength(1)
    expect(paths[0]?.getBoundingRect().left).toBeCloseTo(60)
    expect(texts).toHaveLength(0)
  })

  it("uses text fill colors and pdfjs font substitutions", async () => {
    const page = fakePage(
      {
        fnArray: [
          OPERATORS.save,
          OPERATORS.setFont,
          OPERATORS.setFillRGBColor,
          OPERATORS.showText,
          OPERATORS.restore,
        ],
        argsArray: [
          null,
          ["f1", 12],
          ["#0000ff"],
          [[{ unicode: "Hi", fontChar: "H", width: 500 }]],
          null,
        ],
      },
      {
        items: [
          {
            str: "Hi",
            transform: [12, 0, 0, 12, 10, 500],
            width: 14,
            height: 12,
            fontName: "f1",
          },
        ],
        styles: {
          f1: {
            fontFamily: "sans-serif",
            fontSubstitution: '"Courier",f1s,monospace',
            ascent: 0.8,
            vertical: false,
          },
        },
      },
    )

    const result = await buildPDFPage(page, {
      scale: 1,
      rotation: 0,
      position: [0, 0],
      opacity: 1,
    })
    const text = result.objects.find((object) => object instanceof fabric.Text)
    expect(text).toBeDefined()
    expect(text?.fill).toBe("#0000ff")
    expect(text?.fontFamily).toBe('"Courier",f1s,monospace')
  })

  it("keeps one fill color across text items split from a single showText", async () => {
    const page = fakePage(
      {
        fnArray: [
          OPERATORS.setFont,
          OPERATORS.setFillRGBColor,
          OPERATORS.showText,
          OPERATORS.setFillRGBColor,
          OPERATORS.showText,
        ],
        argsArray: [
          ["f1", 12],
          ["#0000ff"],
          [[{ unicode: "TOTAL AREA:3,327SF GROSS", fontChar: "T", width: 500 }]],
          ["#00ff00"],
          [[{ unicode: "NEXT", fontChar: "N", width: 500 }]],
        ],
      },
      {
        items: [
          {
            str: "TOTAL AREA:",
            transform: [12, 0, 0, 12, 10, 500],
            width: 30,
            height: 12,
            fontName: "f1",
          },
          {
            str: "3,327",
            transform: [12, 0, 0, 12, 40, 500],
            width: 30,
            height: 12,
            fontName: "f1",
          },
          {
            str: "SF GROSS",
            transform: [12, 0, 0, 12, 70, 500],
            width: 30,
            height: 12,
            fontName: "f1",
          },
          {
            str: "NEXT",
            transform: [12, 0, 0, 12, 100, 500],
            width: 30,
            height: 12,
            fontName: "f1",
          },
        ],
        styles: { f1: { fontFamily: "sans-serif", ascent: 0.8, vertical: false } },
      },
    )

    const result = await buildPDFPage(page, {
      scale: 1,
      rotation: 0,
      position: [0, 0],
      opacity: 1,
    })
    const texts = result.objects.filter(
      (object): object is fabric.Text => object instanceof fabric.Text,
    )
    expect(texts.map((text) => text.fill)).toEqual(["#0000ff", "#0000ff", "#0000ff", "#00ff00"])
  })

  it("ignores constructPath entries that carry no path data", async () => {
    const page = fakePage(
      {
        fnArray: [OPERATORS.constructPath],
        argsArray: [[OPERATORS.fill, [null], null]],
      },
      { items: [], styles: {} },
    )

    const result = await buildPDFPage(page, {
      scale: 1,
      rotation: 0,
      position: [0, 0],
      opacity: 1,
    })

    expect(result.objects).toEqual([])
  })

  it("skips text items whose transform is not finite", async () => {
    const page = fakePage(
      {
        fnArray: [OPERATORS.setFont, OPERATORS.showText],
        argsArray: [["f1", 12], [[{ unicode: "Broken" }]]],
      },
      {
        items: [
          {
            str: "Broken",
            transform: [Number.NaN, 0, 0, 12, 10, 500],
            width: 30,
            height: 12,
            fontName: "f1",
          },
        ],
        styles: { f1: { fontFamily: "sans-serif", ascent: 0.8, vertical: false } },
      },
    )

    const result = await buildPDFPage(page, {
      scale: 1,
      rotation: 0,
      position: [0, 0],
      opacity: 1,
    })

    expect(textsIn(result.objects)).toEqual([])
  })

  it("skips text painted with invisible rendering modes", async () => {
    const page = fakePage(
      {
        fnArray: [
          OPERATORS.setFont,
          OPERATORS.setFillRGBColor,
          OPERATORS.save,
          OPERATORS.setTextRenderingMode,
          OPERATORS.showText,
          OPERATORS.restore,
          OPERATORS.showText,
          OPERATORS.showText,
        ],
        argsArray: [
          ["f1", 12],
          ["#0000ff"],
          null,
          [3],
          [[{ unicode: "Hidden" }]],
          null,
          [[{ unicode: "Visible" }]],
          [[{ unicode: "After" }]],
        ],
      },
      {
        items: [
          {
            str: "Hidden",
            transform: [12, 0, 0, 12, 10, 500],
            width: 30,
            height: 12,
            fontName: "f1",
          },
          {
            str: "Visible",
            transform: [12, 0, 0, 12, 40, 500],
            width: 30,
            height: 12,
            fontName: "f1",
          },
          {
            str: "After",
            transform: [12, 0, 0, 12, 70, 500],
            width: 30,
            height: 12,
            fontName: "f1",
          },
        ],
        styles: { f1: { fontFamily: "sans-serif", ascent: 0.8, vertical: false } },
      },
    )

    const result = await buildPDFPage(page, {
      scale: 1,
      rotation: 0,
      position: [0, 0],
      opacity: 1,
    })

    expect(textsIn(result.objects).map((text) => text.text)).toEqual(["Visible", "After"])
  })

  it("converts CMYK fill colors to RGB", async () => {
    const page = fakePage(
      {
        fnArray: [OPERATORS.setFillCMYKColor, OPERATORS.constructPath],
        argsArray: [
          [0, 1, 0, 0],
          [OPERATORS.fill, [[0, 0, 0, 1, 0, 10, 1, 10, 10, 1, 10, 0, 4]], [0, 0, 10, 10]],
        ],
      },
      { items: [], styles: {} },
    )

    const result = await buildPDFPage(page, {
      scale: 1,
      rotation: 0,
      position: [0, 0],
      opacity: 1,
    })

    const path = result.objects.find((object) => object instanceof fabric.Path)
    expect(path?.fill).toBe("#ff00ff")
  })

  it("renders image XObjects that resolve after the operator list", async () => {
    const pixels = new Uint8ClampedArray(16)
    const page = fakePage(
      {
        fnArray: [OPERATORS.paintImageXObject],
        argsArray: [["img_p0_1"]],
      },
      { items: [], styles: {} },
      {
        objs: {
          img_p0_1: { width: 2, height: 2, kind: 3, data: pixels },
        },
      },
      true,
    )

    const result = await buildPDFPage(page, {
      scale: 1,
      rotation: 0,
      position: [0, 0],
      opacity: 1,
    })

    const image = result.objects.find(
      (object): object is fabric.Image => object instanceof fabric.Image,
    )
    expect(image).toBeDefined()
    expect(image?.getScaledWidth()).toBeCloseTo(1)
  })

  it("renders image masks from common objects with the current fill color", async () => {
    const page = fakePage(
      {
        fnArray: [OPERATORS.setFillRGBColor, OPERATORS.paintImageMaskXObject],
        argsArray: [["#ff0000"], [{ data: "g_d0_img_p0_1", width: 8, height: 1, count: 1 }]],
      },
      { items: [], styles: {} },
      {
        commonObjs: {
          g_d0_img_p0_1: { width: 8, height: 1, kind: 1, data: new Uint8Array([0]) },
        },
      },
    )

    const result = await buildPDFPage(page, {
      scale: 1,
      rotation: 0,
      position: [0, 0],
      opacity: 1,
    })

    const image = result.objects.find(
      (object): object is fabric.Image => object instanceof fabric.Image,
    )
    const element = image?.getElement() as unknown as HTMLCanvasElement
    const pixel = element.getContext("2d")?.getImageData(0, 0, 1, 1).data
    expect(pixel ? [...pixel] : null).toEqual([255, 0, 0, 255])
  })

  it("renders masks with non-byte-aligned widths", async () => {
    const page = fakePage(
      {
        fnArray: [OPERATORS.setFillRGBColor, OPERATORS.paintImageMaskXObject],
        argsArray: [["#ff0000"], [{ data: "mask_p0_1", width: 3, height: 2, count: 1 }]],
      },
      { items: [], styles: {} },
      {
        objs: {
          mask_p0_1: { width: 3, height: 2, kind: 1, data: new Uint8Array([0x40, 0xa0]) },
        },
      },
    )

    const result = await buildPDFPage(page, {
      scale: 1,
      rotation: 0,
      position: [0, 0],
      opacity: 1,
    })

    const image = result.objects.find(
      (object): object is fabric.Image => object instanceof fabric.Image,
    )
    const element = image?.getElement() as unknown as HTMLCanvasElement
    const pixels = element.getContext("2d")?.getImageData(0, 0, 3, 2).data
    expect(pixels ? [...pixels].filter((_, index) => index % 4 === 3) : null).toEqual([
      255, 0, 255, 0, 255, 0,
    ])
  })

  it("paints solid color image masks", async () => {
    const page = fakePage(
      {
        fnArray: [OPERATORS.setFillRGBColor, OPERATORS.paintSolidColorImageMask],
        argsArray: [["#00ff00"], []],
      },
      { items: [], styles: {} },
    )

    const result = await buildPDFPage(page, {
      scale: 1,
      rotation: 0,
      position: [0, 0],
      opacity: 1,
    })

    const path = result.objects.find((object) => object instanceof fabric.Path)
    expect(path?.fill).toBe("#00ff00")
    expect(path?.getBoundingRect().width).toBeCloseTo(1)
  })

  it("downsamples rasters larger than the canvas limit without changing display size", async () => {
    const page = fakePage(
      {
        fnArray: [OPERATORS.paintImageXObject],
        argsArray: [["img_p0_1"]],
      },
      { items: [], styles: {} },
      {
        objs: {
          img_p0_1: {
            width: 40000,
            height: 1,
            kind: 2,
            data: new Uint8ClampedArray(40000 * 3),
          },
        },
      },
    )

    const result = await buildPDFPage(page, {
      scale: 1,
      rotation: 0,
      position: [0, 0],
      opacity: 1,
    })

    const image = result.objects.find(
      (object): object is fabric.Image => object instanceof fabric.Image,
    )
    expect(image?.width).toBe(8192)
    expect((image?.width ?? 0) * (image?.scaleX ?? 0)).toBeCloseTo(1)
  })
})
