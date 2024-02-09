import { fabric } from "fabric";
import type { RFFObject } from "./fabric_internal_types";

export const INSTANCE_MAP = {
  fabricCircle: () => new fabric.Circle() as RFFObject,
  fabricEllipse: () => new fabric.Ellipse() as RFFObject,
  fabricGroup: () => new fabric.Group() as RFFObject,
  fabricLine: () => new fabric.Line() as RFFObject,
  fabricPath: () => new fabric.Path() as RFFObject,
  fabricPolygon: () => new fabric.Polygon([]) as RFFObject,
  fabricPolyline: () => new fabric.Polygon([]) as RFFObject,
  fabricRect: () => new fabric.Rect() as RFFObject,
  fabricText: () => new fabric.Text("") as RFFObject,
  fabricTextbox: () => new fabric.Textbox("") as RFFObject,
} as const;
