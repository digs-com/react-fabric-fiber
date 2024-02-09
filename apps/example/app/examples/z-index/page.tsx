"use client";

import { Canvas } from "react-fabric-fiber";

export default function Page() {
  return (
    <Canvas>
      <NumberedRect number={1} zIndex={1} top={0} left={0} />
      <NumberedRect number={3} zIndex={3} top={50} left={50} />
      <NumberedRect number={2} zIndex={2} top={100} left={100} />
    </Canvas>
  );
}

function NumberedRect({
  number,
  ...props
}: { number: number } & JSX.IntrinsicElements["fabricGroup"]) {
  const randomColorHex = Math.round(Math.random() * 0xffffff).toString(16);
  const randomColor = `#${randomColorHex}`;
  return (
    <fabricGroup {...props}>
      <fabricRect width={200} height={100} fill={randomColor} />
      <fabricText originX="center" originY="center" text={number.toString()} />
    </fabricGroup>
  );
}
