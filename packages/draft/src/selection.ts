import { useEffect, useState } from "react"
import { useFabric } from "@digs/react-fabric-fiber"
import type { fabric } from "fabric"

const SELECTION_EVENTS = ["selection:created", "selection:updated", "selection:cleared"] as const

function isSameSelection(
  current: readonly fabric.Object[],
  next: readonly fabric.Object[],
): boolean {
  return current.length === next.length && current.every((object, index) => object === next[index])
}

export function useSelection(): readonly fabric.Object[] {
  const canvas = useFabric()
  const [selection, setSelection] = useState<readonly fabric.Object[]>(() =>
    canvas.getActiveObjects(),
  )

  useEffect(() => {
    const syncSelection = (): void => {
      const next = canvas.getActiveObjects()
      setSelection((current) => (isSameSelection(current, next) ? current : next))
    }

    for (const eventName of SELECTION_EVENTS) canvas.on(eventName, syncSelection)
    syncSelection()

    return () => {
      for (const eventName of SELECTION_EVENTS) canvas.off(eventName, syncSelection)
    }
  }, [canvas])

  return selection
}
