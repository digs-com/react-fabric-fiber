import { fabric } from "fabric";

export interface RFFObject extends fabric.Object {
  __rff?: {
    zIndex: number;
    parent: fabric.Canvas | fabric.Group;
  };
}
