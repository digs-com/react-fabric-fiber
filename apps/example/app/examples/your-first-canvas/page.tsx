"use client";

import { useState } from "react";
import { Canvas } from "react-fabric-fiber";

export default function Page(): JSX.Element {
  const [height, setHeight] = useState(0);
  const toggleHeight = () => setHeight(height === 0 ? 200 : 0);

  return (
    <>
      <button onClick={toggleHeight}>Change Color</button>

      <Canvas>
        <fabricRect top={height} width={200} height={200} />
      </Canvas>
    </>
  );
}
