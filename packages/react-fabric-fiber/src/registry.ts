import { fabric } from "fabric"

export type FabricFactory = () => fabric.Object

export const toPascalCase = (type: string): string =>
  `${type.charAt(0).toUpperCase()}${type.slice(1)}`

const builtIns: Record<string, FabricFactory> = {
  Rect: () => new fabric.Rect(),
  Circle: () => new fabric.Circle(),
  Ellipse: () => new fabric.Ellipse(),
  Triangle: () => new fabric.Triangle(),
  Line: () => new fabric.Line(),
  Polyline: () => new fabric.Polyline([]),
  Polygon: () => new fabric.Polygon([]),
  Path: () => new fabric.Path(),
  Image: () => new fabric.Image(document.createElement("img")),
  Text: () => new fabric.Text(""),
  Group: () => new fabric.Group([]),
}

export const resolveFactory = (type: string): FabricFactory | undefined =>
  builtIns[toPascalCase(type)]
