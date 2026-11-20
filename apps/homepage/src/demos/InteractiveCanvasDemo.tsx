import { useMemo, useState, type ReactElement } from "react"
import { Canvas, Circle, Group, Primitive, Rect, Text } from "@digs/react-fabric-fiber"
import { fabric } from "fabric"

const COLORS = ["#f38ba8", "#89b4fa", "#a6e3a1", "#f9e2af"]

const controlClasses =
  "rounded-md border border-docs-border bg-docs-control px-3 py-1.5 text-xs font-semibold text-docs-text hover:border-docs-accent focus:outline-none focus:ring-2 focus:ring-docs-accent"

export function InteractiveCanvasDemo(): ReactElement {
  const [colorIndex, setColorIndex] = useState(0)
  const [showCircle, setShowCircle] = useState(true)
  const [status, setStatus] = useState("drag a shape, then let go")
  const color = COLORS[colorIndex] ?? COLORS[0]

  const externalShape = useMemo(
    () =>
      new fabric.Rect({
        width: 120,
        height: 80,
        fill: "#cba6f7",
        stroke: "#cdd6f4",
        strokeWidth: 2,
      }),
    [],
  )

  return (
    <div className="mt-4">
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className={controlClasses}
          onClick={() => setColorIndex((index) => (index + 1) % COLORS.length)}
        >
          color {color}
        </button>
        <button
          type="button"
          className={controlClasses}
          onClick={() => setShowCircle((value) => !value)}
        >
          circle {showCircle ? "on" : "off"}
        </button>
      </div>
      <div className="mt-3 h-80 w-full overflow-hidden rounded-lg border border-docs-border bg-docs-code">
        <Canvas>
          <Rect
            position={[48, 64]}
            width={160}
            height={110}
            fill={color}
            stroke="#cdd6f4"
            strokeWidth={2}
            onClick={(event) => setStatus(`clicked <${event.target.type}>`)}
            onModified={(event) =>
              setStatus(
                `rect at ${Math.round(event.target.left ?? 0)}, ${Math.round(event.target.top ?? 0)}`,
              )
            }
          />
          {showCircle ? (
            <Circle
              position={[320, 120]}
              radius={64}
              fill="#a6e3a1"
              stroke="#cdd6f4"
              strokeWidth={2}
              onClick={(event) => setStatus(`clicked <${event.target.type}>`)}
              onModified={() => setStatus("circle moved")}
            />
          ) : null}
          <Text position={[52, 220]} text="drag me" fontSize={26} fill="#cdd6f4" />
          <Group position={[500, 80]}>
            <Rect position={[0, 0]} width={64} height={64} fill="#f9e2af" />
            <Rect position={[80, 0]} width={64} height={64} fill="#89b4fa" />
          </Group>
          <Primitive
            object={externalShape}
            position={[520, 220]}
            onClick={() => setStatus("clicked primitive <rect>")}
            onModified={() => setStatus("primitive moved")}
          />
        </Canvas>
      </div>
      <p aria-live="polite" className="mt-2 font-mono text-xs text-docs-muted">
        {status}
      </p>
    </div>
  )
}
