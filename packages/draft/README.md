# @digs/draft

DRAFT — Digs React Additional Fiber Tooling. Reusable components and hooks for scenes built with [`@digs/react-fabric-fiber`](../react-fabric-fiber), in the spirit of `@react-three/drei`.

## Install

```sh
pnpm add @digs/draft @digs/react-fabric-fiber pdfjs-dist fabric react react-dom
```

`@digs/draft` peers on `@digs/react-fabric-fiber`, `pdfjs-dist@6`, `fabric@5`, and `react@19`. The package ships ESM, CJS, and type declarations.

## `<PDFPage>`

Draws a pdf.js page as a single custom fabric object. Vector operators become `fabric.Path` objects, and the pdf.js text layer becomes `fabric.Text` objects inside the page; the page is never rasterized.

```tsx
import { useEffect, useState } from "react"
import { PDFPage } from "@digs/draft"
import { Canvas } from "@digs/react-fabric-fiber"
import { getDocument, type PDFPageProxy } from "pdfjs-dist"

export function PDFViewer({ url }: { url: string }) {
  const [page, setPage] = useState<PDFPageProxy | null>(null)

  useEffect(() => {
    let active = true
    const task = getDocument({ url })
    task.promise
      .then((document) => document.getPage(1))
      .then((loaded) => {
        if (active) setPage(loaded)
      })
    return () => {
      active = false
      void task.destroy()
    }
  }, [url])

  return <Canvas>{page ? <PDFPage page={page} /> : null}</Canvas>
}
```

| Prop         | Default     | Description                                                  |
| ------------ | ----------- | ------------------------------------------------------------ |
| `page`       | required    | A loaded `PDFPageProxy`.                                     |
| `scale`      | `1`         | Group scale; the unscaled page is `viewport.width × height`. |
| `rotation`   | `0`         | Applied to the group's fabric `angle`.                       |
| `position`   | `[0, 0]`    | Top-left canvas offset of the page object.                   |
| `opacity`    | `1`         | Multiplies vector and text opacity.                          |
| `background` | `"#ffffff"` | Page background; pass `false` for a transparent page.        |

The component renders a `PDFPageObject`, a custom `fabric.Object` subclass (a `fabric.Group`) exported for imperative use. Build one imperatively with `await PDFPageObject.create(page, options)`; the constructor is private, and `options` is `fabric.IGroupOptions`, where `fill` paints the page background (`""` for transparent). Paths and text are present when the promise resolves, and `page.getViewport({ scale: 1 })` defines the unscaled page size. Changing `page` creates a new object; changing `scale`, `rotation`, `position`, `opacity`, or `background` updates the existing object in place through fabric group properties.

`PDFPageObject` does not cache the whole page in fabric. It keeps one off-screen bitmap of the page for interaction and draws that while the viewport is changing; about 120 ms after zoom or pan stops, it draws only the visible vector objects directly at device resolution. Deep zoom therefore shows sharp vectors instead of an upscaled cache, and only paths and text inside the viewport are drawn. Clipping regions that cover the whole page are ignored, identical clip regions share one object, and in browsers with `Path2D` each clipped path applies its clip while drawing instead of allocating a cache per path.

Current coverage:

- Solid RGB fills and strokes, even-odd fill rules, line width, caps, joins, miter limit, dash patterns, and alpha.
- Text positioning, rotation, font size, horizontal scaling, and graphics-state fill colors. Text painted in invisible or clipping render modes is omitted.
- Embedded PDF fonts are injected through pdf.js and used by `fabric.Text`, so glyphs keep the document's typeface. pdf.js system-font substitutions (Helvetica, Courier, …) are honored when available.
- Glyphs that the PDF's `ToUnicode` CMap maps to `U+FFFD` fall back to the embedded font's own glyph character instead of rendering `?`.
- Image masks and solid color image masks, including images that pdf.js delivers after the operator list and 1-bit masks with padded rows. Rasters larger than 8192 pixels per side or 4 megapixels are downsampled before painting.
- Standard image XObjects and inline images, including alpha masks (`SMask`), placed with their PDF transform and opacity.
- Embedded page rotation (`/Rotate`); the `rotation` prop adds to it.
- Form XObject transformation matrices, including nested text and images.

The first render of each page performs a small offscreen pdf.js render so pdf.js can inject its `@font-face` rules and resolve image dependencies; the raster output is discarded. Pass `useSystemFonts: true` and `fontExtraProperties: true` to `getDocument` for the closest pdf.js system-font substitution behavior.

Optional content groups are honored: content in layers that pdf.js reports hidden is skipped.

## Known issues

`pnpm harness:compare` diffs draft against pdf.js over the pdf.js regression corpus; these gaps remain.

| Area                                                        | Examples                                      | Effect                                                                                                            |
| ----------------------------------------------------------- | --------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Soft masks (`ExtGState /SMask`, masked transparency groups) | `issue21346.pdf`, `issue5044.pdf`             | Masked content paints fully opaque.                                                                               |
| Tiling patterns (`setFillColorN`)                           | `issue8565.pdf`, `22060_A1_01_Plans.pdf`      | Pattern fills fall back to the previous solid colour, usually black.                                              |
| Shadings (`shadingFill`)                                    | `radial_gradients.pdf`, `perf_shadings_*.pdf` | Gradient and mesh areas are blank.                                                                                |
| Stencil image masks                                         | `perf_images_stencil_masks.pdf`               | Stencils are not painted.                                                                                         |
| Annotation appearance streams                               | `annotation-stamp.pdf`, `issue21068.pdf`      | Annotations are not drawn even though pdf.js renders them.                                                        |
| Non-extractable text (Type3, no `/ToUnicode`)               | `endchar.pdf`, `issue4706.pdf`                | Vectors render, glyphs are missing because `getTextContent()` returns no items.                                   |
| Text z-order                                                | any page mixing text and later fills          | Text objects are added after all vector objects, so text paints above fills that the content stream paints later. |

PDFs that depend on these features render partially.

## `useSelection()`

Returns the canvas objects that are currently selected. The hook subscribes to `selection:created`, `selection:updated`, and `selection:cleared`, so it stays in sync with pointer selection, `<Primitive>` objects, and imperative `canvas.setActiveObject` calls.

```tsx
import type { ReactElement } from "react"
import { useSelection } from "@digs/draft"
import { Canvas, Rect } from "@digs/react-fabric-fiber"

function SelectionStatus(): null {
  const selection = useSelection()
  console.log(selection.map((object) => object.type))
  return null
}

export function Scene(): ReactElement {
  return (
    <Canvas>
      <Rect position={[40, 40]} width={80} height={80} fill="#ef4444" />
      <SelectionStatus />
    </Canvas>
  )
}
```

The hook must be called inside a `<Canvas>` subtree. It returns a new read-only array only when the active selection changes; the objects themselves are the live fabric instances.

## `<ViewportControls>`

Adds configurable pointer bindings that pan and zoom the fabric canvas. Render it inside `<Canvas>`; it renders no fabric objects.

```tsx
import { ViewportControls } from "@digs/draft"
import { Canvas, Rect } from "@digs/react-fabric-fiber"

export function Scene() {
  return (
    <Canvas>
      <ViewportControls />
      <Rect position={[40, 40]} width={80} height={80} fill="#ef4444" />
    </Canvas>
  )
}
```

| Prop            | Default     | Description                                                                                                            |
| --------------- | ----------- | ---------------------------------------------------------------------------------------------------------------------- |
| `pan`           | `true`      | Enables drag panning. Pass `false` to disable pan.                                                                     |
| `panButton`     | `0`         | Pointer button that starts a pan (0 is left, 1 is middle).                                                             |
| `panModifiers`  | `[]`        | Modifier keys that must be held to pan.                                                                                |
| `panTarget`     | `"canvas"`  | `"background"` only starts on empty canvas space and leaves object drags to fabric.                                    |
| `panLimits`     | `undefined` | Content bounds that clamp the viewport; each axis is an optional `[minimum, maximum]` pair.                            |
| `zoom`          | `true`      | Enables wheel and pinch zoom. Pass `false` to disable zoom.                                                            |
| `zoomModifiers` | `[]`        | Modifier keys that must be held to zoom with the wheel.                                                                |
| `sensitivity`   | `0.001`     | Exponential zoom rate per wheel pixel.                                                                                 |
| `minZoom`       | `0.01`      | Minimum zoom.                                                                                                          |
| `maxZoom`       | `20`        | Maximum zoom.                                                                                                          |
| `momentum`      | `undefined` | Velocity retained per 16 ms after release, from `0` (inclusive) to `1` (exclusive). `undefined` or `0` disables glide. |

Momentum continues the pan after release using the velocity of the final pointer movement. Higher values glide farther; `0.9` retains 90% of the velocity every frame. The glide stops below one pixel per 50 ms, when it reaches `panLimits`, or when a new pan or zoom starts. A release more than 80 ms after the last pointer move does not glide.

Touch input uses the same controls. One finger drags to pan under the same `panTarget` rules, and the pan keeps momentum after release. Two fingers pinch to zoom around their midpoint and respect `minZoom`, `maxZoom`, and `panLimits`. `panButton`, `panModifiers`, and `zoomModifiers` are intended for mouse and pen input: a one-finger pan is treated as the primary button with no modifiers, and pinch zoom ignores `zoomModifiers`. Pass `pan={false}` or `zoom={false}` to disable the corresponding touch gesture.

With the default `panTarget: "canvas"`, the pan gesture takes precedence over fabric object targeting, so object selection and dragging are suspended while the pan is active. Use `panTarget="background"` to keep object interactions and pan only from empty canvas space.

`panModifiers` and `zoomModifiers` list the `"alt"`, `"ctrl"`, `"meta"`, or `"shift"` keys that must be held. `panButton` selects the pointer button (0 is left, 1 is middle). `sensitivity` is the exponential zoom rate per wheel pixel; increase it for faster zooming.

`panLimits` restricts the visible viewport to content bounds in canvas coordinates. Each axis is an optional `[minimum, maximum]` pair; an omitted axis stays unconstrained. Drags stop when a content edge reaches the viewport edge, and an axis whose content is smaller than the viewport is centered instead.

```tsx
<ViewportControls
  panLimits={{ x: [0, 800], y: [0, 600] }}
  momentum={0.92}
/>

<ViewportControls panButton={1} zoom={false} />

<ViewportControls
  panTarget="background"
  panModifiers={["shift"]}
  zoomModifiers={["ctrl"]}
  sensitivity={0.002}
  minZoom={0.25}
  maxZoom={8}
/>
```

The component exposes an imperative handle for remapping or disabling bindings at runtime:

```tsx
import { useRef } from "react"
import { ViewportControls, type ViewportControlsHandle } from "@digs/draft"

const controls = useRef<ViewportControlsHandle>(null)

<ViewportControls ref={controls} />

controls.current?.setPan({ button: 1 })
controls.current?.setZoom(false)
```

Imperative settings remain in effect until a control prop changes. Rendering new control values replaces the imperative pan and zoom settings.

## Development

```sh
pnpm --filter @digs/draft typecheck
pnpm --filter @digs/draft build
pnpm exec vitest run packages/draft/test
```

The PDF integration suite renders `test/fixtures/sample-blueprint.pdf` and asserts that the operator stream becomes fabric paths and text.

The pdf.js regression corpus is rendered when `PDFJS_CORPUS` points at a clone of `test/pdfs` from [mozilla/pdf.js](https://github.com/mozilla/pdf.js). It builds the first three pages of every document and fails on rendering errors or non-finite geometry; set `PDFJS_PAGE_LIMIT` to change the page count.

```sh
git clone --depth 1 --filter=blob:none --sparse https://github.com/mozilla/pdf.js /tmp/pdfjs
git -C /tmp/pdfjs sparse-checkout set test/pdfs
PDFJS_CORPUS=/tmp/pdfjs/test/pdfs pnpm exec vitest run packages/draft/test/pdf-corpus.test.ts
```
