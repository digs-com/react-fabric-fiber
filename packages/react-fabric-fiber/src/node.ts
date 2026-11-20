import type { fabric } from "fabric"

import type { ExternalObjectPlacement } from "./reconciler"
import type { FabricElementType, PointLike } from "./types"

export interface RootContainer {
  canvas: fabric.Canvas
  children: FabricNode[]
  externalObjectPlacement: ExternalObjectPlacement
}

export interface BoundListener {
  event: string
  handler: (options?: unknown) => void
}

export interface PropDefault {
  value: unknown
  own: boolean
}

export interface FabricNode {
  type: FabricElementType
  object: fabric.Object
  props: Record<string, unknown>
  defaults: Map<string, PropDefault>
  parent: FabricNode | null
  children: FabricNode[]
  root: RootContainer
  listeners: Map<string, BoundListener>
  pointerDown: PointLike | null
  hiddenVisible: boolean | undefined
}
