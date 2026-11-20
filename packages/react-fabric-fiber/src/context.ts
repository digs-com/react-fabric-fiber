import { createContext, useCallback, useContext } from "react"
import type { fabric } from "fabric"

import invariant from "./invariant"

export interface FabricContextValue {
  canvas: fabric.Canvas
}

const FabricContext = createContext<FabricContextValue | null>(null)

FabricContext.displayName = "FabricContext"

export const FabricProvider = FabricContext.Provider

const useFabricContextValue = (hook: string): FabricContextValue => {
  const value = useContext(FabricContext)
  invariant(value, `${hook} must be called inside a <Canvas> subtree.`)
  return value
}

export function useFabric(): fabric.Canvas {
  return useFabricContextValue("useFabric").canvas
}

export function useInvalidate(): () => void {
  const canvas = useFabric()
  return useCallback(() => canvas.requestRenderAll(), [canvas])
}
