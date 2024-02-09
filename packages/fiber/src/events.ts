import type { fabric } from "fabric";

type GenericFabricEvent = fabric.IEvent;
type MouseFabricEvent = fabric.IEvent<MouseEvent>;
export type FabricEventHandlers = {
  onModified: (e: GenericFabricEvent) => void;
  onMoving: (e: GenericFabricEvent) => void;
  onScaling: (e: GenericFabricEvent) => void;
  onRotating: (e: GenericFabricEvent) => void;
  onSkewing: (e: GenericFabricEvent) => void;

  onAdded: (e: GenericFabricEvent) => void;
  onRemoved: (e: GenericFabricEvent) => void;

  onMouseUp: (e: MouseFabricEvent) => void;
  onMouseDown: (e: MouseFabricEvent) => void;
  onMouseOver: (e: MouseFabricEvent) => void;
  onMouseOut: (e: MouseFabricEvent) => void;

  onSelected: (e: GenericFabricEvent) => void;
  onDeselected: (e: GenericFabricEvent) => void;
};
export type FabricEvents = keyof FabricEventHandlers;

/**
 * https://github.com/fabricjs/fabric.js/wiki/Working-with-events#events-handled-by-objects
 */
export const FABRIC_OBJECT_EVENT_MAP: {
  [key in FabricEvents]: string;
} = {
  onModified: "modified",
  onMoving: "moving",
  onScaling: "scaling",
  onRotating: "rotating",
  onSkewing: "skewing",
  onAdded: "added",
  onRemoved: "removed",

  onMouseUp: "mouseup",
  onMouseDown: "mousedown",
  onMouseOver: "mouseover",
  onMouseOut: "mouseout",

  onSelected: "selected",
  onDeselected: "deselected",
};
export const FABRIC_EVENTS = new Set(
  Object.keys(FABRIC_OBJECT_EVENT_MAP) as FabricEvents[]
);
export const isFabricEventKey = (key: string): key is FabricEvents =>
  FABRIC_EVENTS.has(key as FabricEvents);
