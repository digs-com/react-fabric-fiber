import {
  Suspense,
  use,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactElement,
  type Ref,
  type RefObject,
} from "react"
import { PDFPage, ViewportControls } from "@digs/draft"
import { Canvas } from "@digs/react-fabric-fiber"
import type { fabric } from "fabric"
import {
  getDocument,
  GlobalWorkerOptions,
  type PDFDocumentLoadingTask,
  type PDFDocumentProxy,
  type PDFPageProxy,
} from "pdfjs-dist"
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url"

GlobalWorkerOptions.workerSrc = workerUrl

const SAMPLE_URL = "/sample-blueprint.pdf"
const SAMPLE_NAME = "sample-blueprint.pdf"

const controlClasses =
  "rounded-md border border-docs-border bg-docs-control px-3 py-1.5 text-xs font-semibold text-docs-text hover:border-docs-accent disabled:opacity-40 focus:outline-none focus:ring-2 focus:ring-docs-accent"

interface PDFResource {
  readonly name: string
  readonly document: Promise<PDFDocumentProxy>
  destroy(): Promise<void>
}

interface ActiveDocument {
  readonly generation: number
  readonly document: PDFDocumentProxy
  readonly resource: PDFResource
}

const pageCache = new WeakMap<PDFDocumentProxy, Map<number, Promise<PDFPageProxy>>>()

function toResource(loadingTask: PDFDocumentLoadingTask, name: string): PDFResource {
  loadingTask.promise.catch(() => undefined)
  return {
    name,
    document: loadingTask.promise,
    destroy: () => loadingTask.destroy(),
  }
}

function openUrl(url: string, name: string): PDFResource {
  return toResource(getDocument({ url, useSystemFonts: true, fontExtraProperties: true }), name)
}

function openData(data: Uint8Array, name: string): PDFResource {
  return toResource(getDocument({ data, useSystemFonts: true, fontExtraProperties: true }), name)
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

const sampleResource = openUrl(SAMPLE_URL, SAMPLE_NAME)

function loadPage(document: PDFDocumentProxy, pageNumber: number): Promise<PDFPageProxy> {
  let pages = pageCache.get(document)
  if (!pages) {
    pages = new Map()
    pageCache.set(document, pages)
  }

  let page = pages.get(pageNumber)
  if (!page) {
    page = document.getPage(pageNumber)
    pages.set(pageNumber, page)
  }

  return page
}

interface StageSize {
  width: number
  height: number
}

function useStageSize(): { readonly stageRef: Ref<HTMLDivElement>; readonly size: StageSize } {
  const stageRef = useRef<HTMLDivElement | null>(null)
  const [size, setSize] = useState<StageSize>({ width: 0, height: 0 })

  useLayoutEffect(() => {
    const stage = stageRef.current
    if (!stage) return

    const measure = (): void =>
      setSize((current) =>
        current.width === stage.clientWidth && current.height === stage.clientHeight
          ? current
          : { width: stage.clientWidth, height: stage.clientHeight },
      )

    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(stage)
    return () => observer.disconnect()
  }, [])

  return { stageRef, size }
}

interface PageCanvasProps {
  readonly document: PDFDocumentProxy
  readonly pageNumber: number
  readonly showBackground: boolean
  readonly size: StageSize
  readonly fitKey: number
  readonly canvasRef: RefObject<fabric.Canvas | null>
}

function PageCanvas({
  document,
  pageNumber,
  showBackground,
  size,
  fitKey,
  canvasRef,
}: PageCanvasProps): ReactElement {
  const page = use(loadPage(document, pageNumber))
  const viewport = page.getViewport({ scale: 1 })
  const fitZoom = size.width / viewport.width
  const minZoom = fitZoom / 1.5
  const maxZoom = fitZoom * 15

  useLayoutEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    canvas.setViewportTransform([fitZoom, 0, 0, fitZoom, 0, 0])
    canvas.requestRenderAll()
  }, [
    canvasRef,
    fitZoom,
    fitKey,
    pageNumber,
    size.width,
    size.height,
    viewport.width,
    viewport.height,
  ])

  return (
    <Canvas ref={canvasRef} width={size.width} height={size.height} backgroundColor="#11111b">
      <ViewportControls
        panLimits={{ x: [0, viewport.width], y: [0, viewport.height] }}
        momentum={0.92}
        minZoom={minZoom}
        maxZoom={maxZoom}
      />
      <PDFPage page={page} background={showBackground ? "#ffffff" : false} />
    </Canvas>
  )
}

interface ViewerProps {
  readonly name: string
  readonly document: PDFDocumentProxy
  readonly isSample: boolean
  readonly pendingName: string | null
  readonly uploadError: string | null
  readonly onSelectFile: (file: File) => void
  readonly onRestoreSample: () => void
}

function Viewer({
  name,
  document,
  isSample,
  pendingName,
  uploadError,
  onSelectFile,
  onRestoreSample,
}: ViewerProps): ReactElement {
  const canvasRef = useRef<fabric.Canvas | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const { stageRef, size } = useStageSize()
  const [pageNumber, setPageNumber] = useState(1)
  const [showBackground, setShowBackground] = useState(true)
  const [fitKey, setFitKey] = useState(0)

  return (
    <div className="mt-4">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          className={controlClasses}
          disabled={pendingName !== null}
          onClick={() => fileInputRef.current?.click()}
        >
          {pendingName === null ? "open pdf" : "reading pdf…"}
        </button>
        {isSample ? null : (
          <button type="button" className={controlClasses} onClick={onRestoreSample}>
            use sample pdf
          </button>
        )}
        <button
          type="button"
          className={controlClasses}
          disabled={pageNumber === 1}
          onClick={() => setPageNumber((value) => Math.max(1, value - 1))}
        >
          previous page
        </button>
        <button
          type="button"
          className={controlClasses}
          disabled={pageNumber >= document.numPages}
          onClick={() => setPageNumber((value) => Math.min(document.numPages, value + 1))}
        >
          next page
        </button>
        <button
          type="button"
          className={controlClasses}
          onClick={() => setShowBackground((value) => !value)}
        >
          page background {showBackground ? "on" : "off"}
        </button>
        <button
          type="button"
          className={controlClasses}
          onClick={() => {
            setShowBackground(true)
            setFitKey((value) => value + 1)
          }}
        >
          reset
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="application/pdf,.pdf"
          className="hidden"
          onChange={(event) => {
            const input = event.currentTarget
            const file = input.files?.[0]
            input.value = ""
            if (file) onSelectFile(file)
          }}
        />
      </div>
      {uploadError ? (
        <p role="alert" className="mt-2 text-xs font-semibold text-docs-danger">
          {uploadError}
        </p>
      ) : null}
      <p className="mt-2 font-mono text-xs text-docs-muted">
        {name} · page {pageNumber} / {document.numPages} · vector paths, not a raster image
      </p>
      <div
        ref={stageRef}
        className="mt-3 h-[70vh] min-h-[420px] w-full overflow-hidden rounded-lg border border-docs-border"
      >
        {size.width > 0 && size.height > 0 ? (
          <Suspense fallback={<p className="p-4 text-xs text-docs-muted">Rendering page…</p>}>
            <PageCanvas
              key={pageNumber}
              document={document}
              pageNumber={pageNumber}
              showBackground={showBackground}
              size={size}
              fitKey={fitKey}
              canvasRef={canvasRef}
            />
          </Suspense>
        ) : null}
      </div>
    </div>
  )
}

function PdfDocumentDemo(): ReactElement {
  const sampleDocument = use(sampleResource.document)
  const [active, setActive] = useState<ActiveDocument>({
    generation: 0,
    document: sampleDocument,
    resource: sampleResource,
  })
  const [pendingName, setPendingName] = useState<string | null>(null)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const uploadToken = useRef(0)
  const loadingResource = useRef<PDFResource | null>(null)

  function discard(resource: PDFResource): void {
    if (loadingResource.current === resource) loadingResource.current = null
    void resource.destroy()
  }

  useEffect(
    () => () => {
      uploadToken.current += 1
      const resource = loadingResource.current
      loadingResource.current = null
      if (resource) void resource.destroy()
    },
    [],
  )

  useEffect(() => {
    const { resource } = active
    if (resource === sampleResource) return
    return () => {
      void resource.destroy()
    }
  }, [active])

  async function selectFile(file: File): Promise<void> {
    const token = uploadToken.current + 1
    uploadToken.current = token
    setPendingName(file.name)
    setUploadError(null)
    let opened: PDFResource | null = null
    try {
      const created = openData(new Uint8Array(await file.arrayBuffer()), file.name)
      opened = created
      loadingResource.current = created
      if (token !== uploadToken.current) {
        discard(created)
        return
      }
      const document = await created.document
      if (token !== uploadToken.current) {
        discard(created)
        return
      }
      loadingResource.current = null
      setActive((current) => ({
        generation: current.generation + 1,
        document,
        resource: created,
      }))
    } catch (error) {
      if (opened) discard(opened)
      if (token === uploadToken.current) {
        setUploadError(`Could not open ${file.name}: ${describeError(error)}`)
      }
    } finally {
      if (token === uploadToken.current) setPendingName(null)
    }
  }

  function restoreSample(): void {
    uploadToken.current += 1
    const resource = loadingResource.current
    loadingResource.current = null
    if (resource) void resource.destroy()
    setPendingName(null)
    setUploadError(null)
    setActive((current) => ({
      generation: current.generation + 1,
      document: sampleDocument,
      resource: sampleResource,
    }))
  }

  return (
    <Viewer
      key={active.generation}
      name={active.resource.name}
      document={active.document}
      isSample={active.resource === sampleResource}
      pendingName={pendingName}
      uploadError={uploadError}
      onSelectFile={selectFile}
      onRestoreSample={restoreSample}
    />
  )
}

export function PdfPageDemo(): ReactElement {
  return (
    <Suspense fallback={<p className="mt-4 text-xs text-docs-muted">Loading {SAMPLE_NAME}…</p>}>
      <PdfDocumentDemo />
    </Suspense>
  )
}
