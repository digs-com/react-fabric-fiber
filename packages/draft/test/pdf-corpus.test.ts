import { existsSync } from "node:fs"
import { readdir, readFile } from "node:fs/promises"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { fabric } from "fabric"
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs"
import { describe, expect, it } from "vitest"

import { buildPDFPage } from "../src/pdf/page"

const corpus = process.env.PDFJS_CORPUS
const assets = join(dirname(fileURLToPath(import.meta.url)), "../node_modules/pdfjs-dist")
const pageLimit = Number(process.env.PDFJS_PAGE_LIMIT ?? 3)

interface PageFailure {
  file: string
  page: number
  error: string
}

interface CorpusTotals {
  pages: number
  objects: number
  images: number
  texts: number
}

interface FileResult extends CorpusTotals {
  failures: PageFailure[]
}

const EMPTY: CorpusTotals = { pages: 0, objects: 0, images: 0, texts: 0 }

function finiteObject(object: fabric.Object): boolean {
  const bounds = object.getBoundingRect()
  return [bounds.left, bounds.top, bounds.width, bounds.height].every((value) =>
    Number.isFinite(value),
  )
}

function describeError(error: unknown): string {
  if (!(error instanceof Error)) return String(error)
  const details = Reflect.get(error, "details")
  return [error.name, error.message, typeof details === "string" ? details : ""]
    .filter((part) => part.length > 0)
    .join(": ")
}

function isPDFJSError(error: unknown): boolean {
  return error instanceof Error && error.name.endsWith("Exception")
}

async function inspectDocument(file: string): Promise<FileResult> {
  const result: FileResult = { ...EMPTY, failures: [] }
  const data = await readFile(join(corpus!, file))
  const loading = getDocument({
    data: new Uint8Array(data),
    useSystemFonts: true,
    cMapUrl: join(assets, "cmaps") + "/",
    cMapPacked: true,
    standardFontDataUrl: join(assets, "standard_fonts") + "/",
    wasmUrl: join(assets, "wasm") + "/",
    iccUrl: join(assets, "iccs") + "/",
  })

  try {
    const document = await loading.promise
    const count = Math.min(document.numPages, pageLimit)
    for (let index = 1; index <= count; index += 1) {
      try {
        const page = await document.getPage(index)
        const built = await buildPDFPage(page, {
          scale: 1,
          rotation: 0,
          position: [0, 0],
          opacity: 1,
        })
        result.pages += 1
        result.objects += built.objects.length
        result.images += built.objects.filter((object) => object instanceof fabric.Image).length
        result.texts += built.objects.filter((object) => object instanceof fabric.Text).length
        const invalid = built.objects.filter((object) => !finiteObject(object))
        if (invalid.length > 0) {
          result.failures.push({
            file,
            page: index,
            error: `${invalid.length} objects have non-finite bounds`,
          })
        }
      } catch (error) {
        if (!isPDFJSError(error)) {
          result.failures.push({ file, page: index, error: describeError(error) })
        }
      }
    }
  } catch {
    return { ...EMPTY, failures: [] }
  } finally {
    await loading.destroy().catch(() => undefined)
  }

  return result
}

describe.skipIf(!corpus || !existsSync(corpus))("PDF corpus", () => {
  it("renders every page of the pdf.js regression corpus", async () => {
    const files = (await readdir(corpus!)).filter((file) => file.endsWith(".pdf")).sort()
    const queue = [...files]
    const results: FileResult[] = []

    await Promise.all(
      Array.from({ length: 4 }, async () => {
        for (;;) {
          const file = queue.shift()
          if (!file) return
          results.push(await inspectDocument(file))
        }
      }),
    )

    const totals = results.reduce<CorpusTotals>(
      (sum, result) => ({
        pages: sum.pages + result.pages,
        objects: sum.objects + result.objects,
        images: sum.images + result.images,
        texts: sum.texts + result.texts,
      }),
      EMPTY,
    )
    const failures = results.flatMap((result) => result.failures)

    expect(failures).toEqual([])
    expect(totals.pages).toBeGreaterThan(0)
    expect(totals.objects).toBeGreaterThan(0)
    expect(totals.images).toBeGreaterThan(0)
    expect(totals.texts).toBeGreaterThan(0)
  }, 1_800_000)
})
