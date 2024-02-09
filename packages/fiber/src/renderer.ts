import { fabric } from "fabric";
import Reconciler from "react-reconciler";
import { DefaultEventPriority } from "react-reconciler/constants";
import { CanvasContextType } from "./canvas_context";
import { FABRIC_OBJECT_EVENT_MAP } from "./events";
import { INSTANCE_MAP } from "./fabric_instances";
import type { RFFObject } from "./fabric_internal_types";
import { FabricElements } from "./fabric_types";
import { COORDINATE_PROPS, diffProps, type DiffSet } from "./utils/props";
import { getInsertIndex } from "./utils/zIndex";

export type Root = { fiber: Reconciler.FiberRoot; canvas: fabric.Canvas };

interface HostConfig {
  type: InstanceTypes;
  props: InstanceProps;
  instance: Instance;
  textInstance: TextInstance;
  suspenseInstance: Instance;
  hydratableInstance: Instance;
  publicInstance: fabric.Object;
  updatePayload: DiffSet;

  container: CanvasContextType;

  hostContext: never;
  childSet: never;
  timeoutHandle: number | undefined;
  noTimeout: -1;
}

export type InstanceTypes = keyof FabricElements;
export type Instance = RFFObject;
export type TextInstance = RFFObject;
export type InstanceProps = FabricElements[InstanceTypes];

export function createRenderer() {
  type FabricReconcilerHostConfig = Reconciler.HostConfig<
    HostConfig["type"],
    HostConfig["props"],
    HostConfig["container"],
    HostConfig["instance"],
    HostConfig["textInstance"],
    HostConfig["suspenseInstance"],
    HostConfig["hydratableInstance"],
    HostConfig["publicInstance"],
    HostConfig["hostContext"],
    HostConfig["updatePayload"],
    HostConfig["childSet"],
    HostConfig["timeoutHandle"],
    HostConfig["noTimeout"]
  >;

  const commitUpdate: FabricReconcilerHostConfig["commitUpdate"] = (
    instance,
    updatePayload
  ) => {
    updatePayload.forEach((diff) => {
      if (diff.isEvent) {
        const eventName = FABRIC_OBJECT_EVENT_MAP[diff.key];
        if (diff.prevValue) {
          instance.off(
            eventName,
            diff.prevValue as (e: fabric.IEvent<Event>) => void
          );
        }

        return instance.on(
          eventName,
          diff.value as (e: fabric.IEvent<Event>) => void
        );
      }

      if (diff.key === "zIndex") {
        const localState = instance.__rff;
        if (!localState) throw new Error("Invalid local state");

        localState.zIndex = diff.value as number;

        const parent = localState.parent;
        const newIndex = getInsertIndex(parent, diff.value as number, instance);

        instance.moveTo(newIndex);
        if (parent instanceof fabric.Group) {
          parent.dirty = true;
        }

        return;
      }

      if ("points" in instance && diff.key === "points") {
        instance.set(diff.key, diff.value);
        // @ts-expect-error - private method
        instance._setPositionDimensions?.(instance);

        return;
      }

      instance.set(diff.key as keyof Instance, diff.value);
    });

    if (updatePayload.some(({ key }) => COORDINATE_PROPS.has(key))) {
      instance.setCoords();
    }

    instance.canvas?.requestRenderAll();
  };

  const createInstance: FabricReconcilerHostConfig["createInstance"] = <
    T extends keyof FabricElements,
  >(
    type: T,
    props: FabricElements[T],
    rootContainer: fabric.Canvas
  ) => {
    const instance: RFFObject =
      type === "fabricPrimitive"
        ? (props as FabricElements["fabricPrimitive"]).object
        : INSTANCE_MAP[
            type as keyof Omit<FabricElements, "fabricPrimitive">
          ]?.();

    if (!instance) throw new Error(`Invalid instance type: ${type}`);

    instance.__rff = { parent: rootContainer, zIndex: props.zIndex ?? 1 };

    commitUpdate(instance, diffProps(props), type, {}, props, null);
    return instance;
  };

  const appendChildToContainer: FabricReconcilerHostConfig["appendChildToContainer"] =
    (container, child) => {
      const localState = child.__rff;
      if (!localState) throw new Error("Invalid local state");

      const zIndex = localState.zIndex;
      const insertIndex = getInsertIndex(container, zIndex, child);
      container.insertAt(child, insertIndex, false);
    };

  const removeChildFromContainer: FabricReconcilerHostConfig["removeChildFromContainer"] =
    (container, child) => container.remove(child);

  const appendChild: FabricReconcilerHostConfig["appendChild"] = (
    parentInstance,
    child
  ) => {
    if (!(parentInstance instanceof fabric.Group)) {
      throw new Error(
        "Adding children to non-group objects is not yet allowed."
      );
    }

    const localState = child.__rff;
    if (!localState) throw new Error("Invalid local state");

    localState.parent = parentInstance;
    const zIndex = localState.zIndex;
    const insertIndex = getInsertIndex(parentInstance, zIndex, child);
    parentInstance.insertAt(child, insertIndex, false);
    parentInstance.addWithUpdate();
  };

  const removeChild: FabricReconcilerHostConfig["removeChild"] = (
    parentInstance,
    child
  ) => {
    if (parentInstance instanceof fabric.Group) {
      parentInstance.removeWithUpdate(child);
    } else {
      throw new Error(
        "Removing children from non-group objects is not yet allowed."
      );
    }
  };

  const insertBefore: FabricReconcilerHostConfig["insertBefore"] = (
    parentInstance,
    instance,
    beforeInstance
  ) => {
    if (!(parentInstance instanceof fabric.Group)) {
      throw new Error(
        "Adding children to non-group objects is not yet allowed."
      );
    }

    const localState = instance.__rff;
    if (!localState) throw new Error("Invalid local state");

    localState.parent = parentInstance;
    const zIndex = localState.zIndex;
    const insertIndex = getInsertIndex(
      parentInstance,
      zIndex,
      instance,
      beforeInstance
    );
    parentInstance.insertAt(instance, insertIndex, false);
  };

  const insertInContainerBefore: FabricReconcilerHostConfig["insertInContainerBefore"] =
    (container, instance, beforeInstance) => {
      const localState = instance.__rff;
      if (!localState) throw new Error("Invalid local state");

      const zIndex = localState.zIndex;
      const insertIndex = getInsertIndex(
        container,
        zIndex,
        instance,
        beforeInstance
      );
      container.insertAt(instance, insertIndex, false);
    };

  const createTextInstance: FabricReconcilerHostConfig["createTextInstance"] = (
    text,
    rootContainer,
    hostContext,
    internalHandle
  ) =>
    createInstance(
      "fabricText",
      { text } as FabricElements["fabricText"],
      rootContainer,
      hostContext,
      internalHandle
    ) as RFFObject;

  const commitTextUpdate: FabricReconcilerHostConfig["commitTextUpdate"] = (
    textInstance,
    oldText,
    newText
  ) =>
    commitUpdate(
      textInstance as RFFObject,
      diffProps({ text: newText }, { text: oldText }),
      "fabricText",
      { text: oldText },
      { text: newText },
      null
    );

  const commitMount: FabricReconcilerHostConfig["commitMount"] = (instance) => {
    instance.canvas?.requestRenderAll();
  };

  const hostConfig: FabricReconcilerHostConfig = {
    supportsMutation: true,
    supportsPersistence: false,
    supportsHydration: false,

    noTimeout: -1,
    isPrimaryRenderer: false,

    createInstance,
    appendChild,
    appendInitialChild: appendChild,
    appendChildToContainer,
    removeChild,
    removeChildFromContainer,
    createTextInstance,
    commitTextUpdate,
    insertBefore,
    insertInContainerBefore,

    finalizeInitialChildren: () => true,
    commitMount,

    hideInstance: (instance) => (instance.visible = false),
    unhideInstance: (instance) => (instance.visible = true),

    getRootHostContext: () => null,
    getChildHostContext: (parentHostContext) => parentHostContext,
    getPublicInstance: (instance) => instance!,
    prepareForCommit: () => null,
    resetAfterCommit: () => {},
    preparePortalMount: () => {},
    getInstanceFromNode: () => null,

    prepareScopeUpdate: () => {},
    getInstanceFromScope: () => null,

    beforeActiveInstanceBlur: () => {},
    afterActiveInstanceBlur: () => {},
    detachDeletedInstance: () => {},

    // TODO: see if this is ok performance-wise
    prepareUpdate: (instance, type, oldProps, newProps) =>
      diffProps(newProps, oldProps),
    commitUpdate,

    clearContainer: () => false,

    shouldSetTextContent: () => false,

    getCurrentEventPriority: () => DefaultEventPriority,
    scheduleTimeout: setTimeout,
    cancelTimeout: clearTimeout,
  };

  return Reconciler(hostConfig);
}
