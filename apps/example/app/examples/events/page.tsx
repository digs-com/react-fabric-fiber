"use client";

import { useState } from "react";
import { Canvas } from "react-fabric-fiber";

export default function Page() {
  const [hovered, setHovered] = useState(false);

  return (
    <Canvas>
      <fabricCircle radius={100} top={50} left={50} fill="blue" />
      <fabricRect
        onMouseOver={() => setHovered(true)}
        onMouseOut={() => setHovered(false)}
        width={200}
        height={100}
        fill={hovered ? "green" : "red"}
      />
    </Canvas>
  );
}
