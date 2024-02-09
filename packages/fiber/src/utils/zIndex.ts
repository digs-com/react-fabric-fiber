import type { RFFObject } from "../fabric_internal_types";

export function getInsertIndex(
  parent: fabric.Canvas | fabric.Group,
  zIndex: number,
  instance: RFFObject,
  before?: RFFObject
) {
  const existingObjects = parent
    .getObjects()
    .filter((obj) => obj !== instance) as RFFObject[];

  const insertIndex = existingObjects.findIndex((existingObject) => {
    const existingZIndex = existingObject.__rff?.zIndex ?? 1;
    if (existingZIndex > zIndex) {
      return true;
    }

    if (before && existingZIndex === zIndex) {
      return existingObject === before;
    }

    return false;
  });

  // If none found, should be top-most layer
  if (insertIndex === -1) {
    const maxIndex = existingObjects.length;
    return maxIndex;
  }

  return insertIndex;
}
