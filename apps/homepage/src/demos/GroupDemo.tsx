import { useState, type ReactElement } from "react"
import { Canvas, Circle, Group, Rect, Text } from "@digs/react-fabric-fiber"

const controlClasses =
  "rounded-md border border-docs-border bg-docs-control px-3 py-1.5 text-xs font-semibold text-docs-text hover:border-docs-accent focus:outline-none focus:ring-2 focus:ring-docs-accent"

export function GroupDemo(): ReactElement {
  const [rotation, setRotation] = useState(0)
  const [scaled, setScaled] = useState(false)

  return (
    <div className="mt-4">
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className={controlClasses}
          onClick={() => setRotation((value) => (value + 15) % 360)}
        >
          rotate {rotation}°
        </button>
        <button
          type="button"
          className={controlClasses}
          onClick={() => setScaled((value) => !value)}
        >
          scale {scaled ? "1.4" : "1"}
        </button>
      </div>
      <div className="mt-3 h-80 w-full overflow-hidden rounded-lg border border-docs-border bg-docs-code">
        <Canvas>
          <Group
            position={[260, 190]}
            rotation={rotation}
            scale={scaled ? 1.4 : 1}
            onModified={() => undefined}
          >
            <Rect position={[-110, -60]} width={140} height={110} rx={12} fill="#f38ba8" />
            <Circle position={[70, 10]} radius={44} fill="#89b4fa" />
            <Text position={[-96, -20]} text="group" fontSize={18} fill="#11111b" />
            <Group position={[70, -70]}>
              <Rect position={[-26, -26]} width={52} height={52} fill="#a6e3a1" />
            </Group>
          </Group>
        </Canvas>
      </div>
      <p className="mt-2 font-mono text-xs text-docs-muted">
        children use group-local coordinates; the group adds its own position, rotation and scale
      </p>
    </div>
  )
}
