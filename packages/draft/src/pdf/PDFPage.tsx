import { useLayoutEffect, useState, type ReactElement } from "react"
import { Primitive } from "@digs/react-fabric-fiber"
import type { PDFPageProxy } from "pdfjs-dist"

import { PDFPageObject } from "./PDFPageObject"

export interface PDFPageProps {
  page: PDFPageProxy
  scale?: number
  rotation?: number
  position?: readonly [number, number]
  opacity?: number
  background?: string | false
}

interface Failure {
  error: unknown
}

const DEFAULT_POSITION: readonly [number, number] = [0, 0]
const DEFAULT_FILL = "#ffffff"

export function PDFPage(props: PDFPageProps): ReactElement | null {
  const [object, setObject] = useState<PDFPageObject | null>(null)
  const [generation, setGeneration] = useState(0)
  const [failure, setFailure] = useState<Failure | null>(null)

  useLayoutEffect(() => {
    let active = true
    PDFPageObject.create(props.page).then(
      (created) => {
        if (!active) return
        setFailure(null)
        setGeneration((value) => value + 1)
        setObject(created)
      },
      (error: unknown) => {
        if (active) setFailure({ error })
      },
    )
    return () => {
      active = false
    }
  }, [props.page])

  if (failure) throw failure.error
  return object ? (
    <Primitive
      key={generation}
      object={object}
      position={props.position ?? DEFAULT_POSITION}
      scale={props.scale ?? 1}
      rotation={props.rotation ?? 0}
      opacity={props.opacity ?? 1}
      fill={props.background === false ? "" : (props.background ?? DEFAULT_FILL)}
    />
  ) : null
}
