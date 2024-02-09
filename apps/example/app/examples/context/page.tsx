"use client";

import { useEffect, useRef } from "react";
import { Canvas, useCanvasContext } from "react-fabric-fiber";

export default function Page(): JSX.Element {
  return (
    <Canvas>
      <fabricText top={10} text="Canvas Context Escape Hatch" />
      <HoverRect />
    </Canvas>
  );
}

function HoverRect() {
  const canvas = useCanvasContext();
  const rectRef = useRef<fabric.Rect | null>(null);

  useEffect(() => {
    const rect = rectRef.current;
    if (!rect) return;

    const onMouseMove = (e: fabric.IEvent<MouseEvent>) => {
      const fill = e.target === rect ? "red" : "green";

      rect.set("fill", fill);
      canvas.requestRenderAll();
    };

    canvas.on("mouse:move", onMouseMove);
    return () => {
      canvas.off("mouse:move", onMouseMove as (e: fabric.IEvent) => void);
    };
  }, [rectRef.current, canvas]);

  return (
    <fabricRect
      ref={rectRef}
      width={200}
      height={100}
      top={200}
      left={0}
      fill="green"
    />
  );
}
