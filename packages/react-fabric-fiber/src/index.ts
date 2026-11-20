export { createRoot, reconciler } from "./reconciler"
export type {
  CreateRootOptions,
  ExternalObjectPlacement,
  FabricCanvasFactory,
  FabricRoot,
} from "./reconciler"
export { applyProps } from "./props"
export {
  Canvas,
  createFabricComponent,
  Rect,
  Circle,
  Ellipse,
  Triangle,
  Line,
  Polyline,
  Polygon,
  Path,
  Image,
  Text,
  Group,
  Primitive,
} from "./components"
export type { CanvasProps } from "./components"
export { useFabric, useInvalidate } from "./context"
export type { FabricContextValue } from "./context"
export type {
  BuiltinFabricElement,
  CircleProps,
  EllipseProps,
  FabricEvent,
  FabricEventHandler,
  FabricEventProps,
  FabricObjectProps,
  GroupProps,
  ImageProps,
  LineProps,
  PathProps,
  PointLike,
  PolygonProps,
  PolylineProps,
  PrimitiveProps,
  RectProps,
  TextProps,
  TriangleProps,
} from "./types"
