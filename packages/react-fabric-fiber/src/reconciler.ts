import { createElement, type ReactNode } from "react"
import { fabric } from "fabric"
import Reconciler from "react-reconciler"

import { FabricProvider } from "./context"
import { fabricHostConfig } from "./hostConfig"
import invariant from "./invariant"
import type { FabricNode, RootContainer } from "./node"

const CONCURRENT_ROOT = 1

type RuntimeReconciler = Omit<
  Reconciler.Reconciler<RootContainer, FabricNode, never, never, never, fabric.Object>,
  "createContainer" | "flushSync" | "injectIntoDevTools"
> & {
  createContainer(
    containerInfo: RootContainer,
    tag: Reconciler.RootTag,
    hydrationCallbacks: null,
    isStrictMode: boolean,
    concurrentUpdatesByDefaultOverride: null,
    identifierPrefix: string,
    onUncaughtError: (error: unknown) => void,
    onCaughtError: (error: unknown) => void,
    onRecoverableError: (error: unknown) => void,
    transitionCallbacks: null,
  ): Reconciler.OpaqueRoot
  flushSyncFromReconciler(callback: () => void): void
  updateContainerSync(
    element: ReactNode,
    container: Reconciler.OpaqueRoot,
    parentComponent: null,
    callback: null,
  ): Reconciler.Lane
  injectIntoDevTools(): boolean
}

export const reconciler = Reconciler(fabricHostConfig) as unknown as RuntimeReconciler

reconciler.injectIntoDevTools()

export interface FabricRoot {
  canvas: fabric.Canvas
  render(children: ReactNode): void
  unmount(): void
}

export type FabricCanvasFactory = (
  element: HTMLCanvasElement,
  options: fabric.ICanvasOptions,
) => fabric.Canvas

export type ExternalObjectPlacement = "above" | "below"

export type CreateRootOptions = {
  canvasFactory?: FabricCanvasFactory
  externalObjectPlacement?: ExternalObjectPlacement
}

const forwardError = (error: unknown): void => {
  console.error(error)
}

export function createRoot(
  element: HTMLCanvasElement,
  options: fabric.ICanvasOptions = {},
  rootOptions: CreateRootOptions = {},
): FabricRoot {
  const canvas =
    rootOptions.canvasFactory?.(element, options) ?? new fabric.Canvas(element, options)
  const container: RootContainer = {
    canvas,
    children: [],
    externalObjectPlacement: rootOptions.externalObjectPlacement ?? "above",
  }
  const fiberRoot = reconciler.createContainer(
    container,
    CONCURRENT_ROOT,
    null,
    false,
    null,
    "",
    forwardError,
    forwardError,
    forwardError,
    null,
  )
  let mounted = true

  return {
    canvas,
    render(children) {
      invariant(mounted, "Cannot render into an unmounted fabric root.")
      reconciler.flushSyncFromReconciler(() => {
        reconciler.updateContainerSync(
          createElement(FabricProvider, { value: { canvas } }, children),
          fiberRoot,
          null,
          null,
        )
      })
    },
    unmount() {
      if (!mounted) return
      mounted = false
      reconciler.flushSyncFromReconciler(() => {
        reconciler.updateContainerSync(null, fiberRoot, null, null)
      })
      canvas.dispose()
    },
  }
}
