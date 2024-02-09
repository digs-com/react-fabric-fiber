"use client";

import { Canvas } from "react-fabric-fiber";

export default function Page(): JSX.Element {
  return (
    <Canvas>
      <fabricText top={10} text="Hello" />
      <fabricCircle
        selectable={false}
        radius={50}
        top={0}
        left={50}
        fill="red"
        stroke="green"
      />
      <fabricRect width={200} height={100} top={100} left={0} fill="green" />
      <fabricPolygon
        top={300}
        points={[
          { x: 0, y: 0 },
          { x: 100, y: 100 },
          { x: 100, y: 0 },
        ]}
        fill="blue"
      />
    </Canvas>
  );
}
