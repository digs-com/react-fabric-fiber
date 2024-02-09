import { fabric } from "fabric";
import { suspend } from "suspend-react";
import type { ReactFabricFiberObject } from "../fabric_types";

export type ImageProps = ReactFabricFiberObject<
  fabric.Image,
  fabric.IImageOptions,
  {
    src: ConstructorParameters<typeof fabric.Image>[0];
  }
>;

export function Image({ src, ...options }: ImageProps) {
  const fabricImage = suspend(async () => {
    if (typeof src === "string" && URL.canParse(src)) {
      return new Promise<fabric.Image>((res) => fabric.Image.fromURL(src, res));
    } else {
      return new fabric.Image(src);
    }
  }, [src]);

  return <fabricPrimitive object={fabricImage} {...options} />;
}
