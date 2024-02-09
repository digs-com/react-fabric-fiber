/* eslint-disable @next/next/no-img-element */
"use client";

import { Suspense, useState } from "react";
import { Canvas, Image } from "react-fabric-fiber";

export default function Page() {
  const [imgRef, setImgRef] = useState<HTMLImageElement | null>(null);

  return (
    <>
      <img
        src="https://placekitten.com/200/300"
        style={{ display: "none" }}
        ref={setImgRef}
      />

      <Canvas>
        {/* With HTMLImageElements */}
        {imgRef && <Image src={imgRef} />}

        {/* With Suspense */}
        <Suspense
          fallback={
            <fabricRect
              selectable={false}
              width={150}
              height={150}
              fill="red"
            />
          }
        >
          <Image src="https://via.placeholder.com/150" />
        </Suspense>

        {/* On its own */}
        <Image src="https://placekitten.com/50/50" />
      </Canvas>
    </>
  );
}
