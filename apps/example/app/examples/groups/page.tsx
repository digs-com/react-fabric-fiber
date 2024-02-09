"use client";

import { Canvas } from "react-fabric-fiber";

export default function Page() {
  return (
    <Canvas>
      <fabricGroup>
        <fabricRect width={200} height={100} fill="red" />
        <fabricText originX="center" originY="center" text="Hello" />
      </fabricGroup>

      <fabricGroup originY="center" top={200}>
        <fabricPolygon
          width={100}
          height={100}
          points={[
            { x: -50, y: 0 },
            { x: 0, y: 100 },
            { x: 50, y: 0 },
          ]}
          fill="brown"
          originX="left"
          originY="top"
        />
        <fabricCircle
          radius={50}
          fill="pink"
          originX="center"
          originY="bottom"
        />
      </fabricGroup>
    </Canvas>
  );
}
