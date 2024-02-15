"use client";

import { useState } from "react";
import { Canvas } from "react-fabric-fiber";

export default function Page(): JSX.Element {
  const [height, setHeight] = useState(0);
  const togglePosition = () => setHeight(height === 0 ? 200 : 0);

  return (
    <>
      <button onClick={togglePosition}>Toggle Position</button>

      <Canvas>
        <fabricRect top={height} left={0} width={200} height={200} />
      </Canvas>
    </>
  );
}
