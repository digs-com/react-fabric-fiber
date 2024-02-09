import type { fabric } from "fabric";
import { type PropsWithChildren } from "react";
import type { FabricEventHandlers } from "./events";

type ReactFabricFiberObject<
  FabricObject extends fabric.Object,
  FabricObjectProps,
  FabricObjectConfig = object,
> = Partial<FabricEventHandlers> &
  Partial<FabricObjectProps> &
  FabricObjectConfig & {
    zIndex?: number;
    ref?: React.Ref<FabricObject>;
  };

export type CircleProps = ReactFabricFiberObject<
  fabric.Circle,
  fabric.ICircleOptions
>;
export type EllipseProps = ReactFabricFiberObject<
  fabric.Ellipse,
  fabric.IEllipseOptions
>;
export type GroupProps = ReactFabricFiberObject<
  fabric.Group,
  fabric.IGroupOptions,
  PropsWithChildren
>;
export type LineProps = ReactFabricFiberObject<
  fabric.Line,
  fabric.ILineOptions,
  {
    points: ConstructorParameters<typeof fabric.Line>[0];
  }
>;
export type PathProps = ReactFabricFiberObject<
  fabric.Path,
  fabric.IPathOptions,
  {
    path: ConstructorParameters<typeof fabric.Path>[0];
  }
>;

type XY = { x: number; y: number };
export type PolygonProps = ReactFabricFiberObject<
  fabric.Polygon,
  Omit<fabric.IPolylineOptions, "points">,
  {
    points: ConstructorParameters<typeof fabric.Polygon>[0];
  }
>;
export type PolylineProps = ReactFabricFiberObject<
  fabric.Polyline,
  Omit<fabric.IPolylineOptions, "points">,
  {
    points: ConstructorParameters<typeof fabric.Polyline>[0];
  }
>;
export type RectProps = ReactFabricFiberObject<
  fabric.Rect,
  fabric.IRectOptions
>;
export type TextProps = ReactFabricFiberObject<
  fabric.Text,
  fabric.ITextOptions,
  {
    text: ConstructorParameters<typeof fabric.Text>[0];
  }
>;
export type TextboxProps = ReactFabricFiberObject<
  fabric.Textbox,
  fabric.ITextboxOptions,
  {
    text: ConstructorParameters<typeof fabric.Textbox>[0];
  }
>;
export type PrimitiveProps = ReactFabricFiberObject<
  fabric.Object,
  fabric.IObjectOptions,
  {
    object: fabric.Object;
  }
>;

export interface FabricElements {
  fabricCircle: CircleProps;
  fabricEllipse: EllipseProps;
  fabricGroup: GroupProps;
  fabricLine: LineProps;
  fabricPath: PathProps;
  fabricPolygon: PolygonProps;
  fabricPolyline: PolylineProps;
  fabricRect: RectProps;
  fabricText: TextProps;
  fabricTextbox: TextboxProps;
  fabricPrimitive: PrimitiveProps;
}

declare global {
  namespace JSX {
    interface IntrinsicElements extends FabricElements {}
  }
}
