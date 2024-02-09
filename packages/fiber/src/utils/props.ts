import {
  isFabricEventKey,
  type FabricEventHandlers,
  type FabricEvents,
} from "../events";
import type { InstanceProps } from "../renderer";

type PropDiff = {
  key: string;
  value: unknown | null;
  isEvent: false;
};
type EventDiff = {
  key: FabricEvents;
  value: FabricEventHandlers[FabricEvents] | null;
  prevValue: FabricEventHandlers[FabricEvents] | null;
  isEvent: true;
};
export type Diff = PropDiff | EventDiff;
export type DiffSet = Diff[];

export function diffProps(
  props: InstanceProps,
  previous: InstanceProps = {}
): DiffSet {
  const entries = Object.entries(props);
  const changes: DiffSet = [];

  entries.forEach(([key, value]) => {
    // React handles children diffs
    if (key === "children") return;

    // React handles ref diffs
    if (key === "ref") return;

    // Ignore unchanged values
    const prevValue = previous[key as keyof InstanceProps];
    if (value === prevValue) return;

    if (isFabricEventKey(key)) {
      changes.push({ key, value, prevValue, isEvent: true });
    } else {
      changes.push({ key, value, isEvent: false });
    }
  });

  // Find removed props
  const currentKeys = new Set(Object.keys(props));
  for (const key of Object.keys(previous)) {
    if (currentKeys.has(key)) continue;

    if (isFabricEventKey(key)) {
      changes.push({
        key,
        value: null,
        prevValue: previous[key as keyof InstanceProps],
        isEvent: true,
      });
    } else {
      changes.push({ key, value: null, isEvent: false });
    }
  }

  return changes;
}

export const COORDINATE_PROPS = new Set([
  "left",
  "top",
  "width",
  "height",
  "scale",
]);
