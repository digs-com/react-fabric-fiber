import { createContext } from "react"
import { fabric } from "fabric"
import type Reconciler from "react-reconciler"

import { attachEventHandlers, detachEventHandlers } from "./events"
import invariant from "./invariant"
import type { FabricNode, RootContainer } from "./node"
import { applyNodeProps, writeProp } from "./props"
import { resolveFactory } from "./registry"
import type { FabricElementType } from "./types"

type HostProps = Record<string, unknown>
type HostContext = Record<never, never>
type TimeoutHandle = number

type EventPriority = Reconciler.EventPriority

const NO_EVENT_PRIORITY: EventPriority = 0
const DEFAULT_EVENT_PRIORITY: EventPriority = 0b0000000000000000000000000100000

const EMPTY_CONTEXT: HostContext = {}
const HOST_TRANSITION_CONTEXT = createContext<null>(null)

let currentUpdatePriority: EventPriority = NO_EVENT_PRIORITY

const resolveObjectFactory = (type: FabricElementType) => {
  invariant(type !== "primitive", "<Primitive> takes its object from the `object` prop.")

  const factory = resolveFactory(type)
  invariant(factory, `<${type}> is not a fabric element.`)

  return factory
}

const resolvePrimitiveObject = (props: HostProps): fabric.Object => {
  const object = props.object
  const isFabricLike =
    typeof object === "object" &&
    object !== null &&
    "set" in object &&
    typeof object.set === "function" &&
    "type" in object &&
    typeof object.type === "string"

  invariant(
    isFabricLike,
    "<Primitive> requires an `object` prop holding a fabric object, e.g. <Primitive object={rect} />.",
  )

  return object as fabric.Object
}

const groupContainer = (node: FabricNode): fabric.Group | null => {
  if (node.type === "group") return node.object as fabric.Group
  if (node.type === "primitive" && node.object instanceof fabric.Group) return node.object
  return null
}

const requireGroupContainer = (node: FabricNode): fabric.Group => {
  const group = groupContainer(node)
  invariant(
    group,
    `<${node.type}> cannot contain children. Only <Group> or a <Primitive object={group}> accepts children.`,
  )
  return group
}

const unlink = (node: FabricNode): void => {
  if (!node.parent) return
  const siblings = node.parent.children
  const index = siblings.indexOf(node)
  if (index !== -1) siblings.splice(index, 1)
  node.parent = null
}

const linkAt = (parent: FabricNode, child: FabricNode, index: number): void => {
  unlink(child)
  child.parent = parent
  parent.children.splice(index, 0, child)
}

const GROUP_TRANSFORM_PROPS = ["position", "scale", "rotation"] as const

const reapplyGroupTransform = (node: FabricNode): void => {
  if (!groupContainer(node)) return

  for (const key of GROUP_TRANSFORM_PROPS) {
    const value = node.props[key]
    if (value !== undefined) writeProp(node, key, value)
  }

  node.object.setCoords()
}

const detachObjectFromGroup = (group: fabric.Group, object: fabric.Object): void => {
  if (group._objects.indexOf(object) !== -1) group.remove(object)
}

const toCanvasCoordinates = (group: fabric.Group, object: fabric.Object): void => {
  const local = new fabric.Point(object.left ?? 0, object.top ?? 0)
  const canvasCoordinates = fabric.util.transformPoint(local, group.calcTransformMatrix())
  object.set({ left: canvasCoordinates.x, top: canvasCoordinates.y })
}

const linkChildToGroup = (parent: FabricNode, child: FabricNode): void => {
  unlink(child)
  child.parent = parent
  parent.children.push(child)
}

const appendInitialChildToGroup = (parent: FabricNode, child: FabricNode): void => {
  linkChildToGroup(parent, child)

  const group = requireGroupContainer(parent)
  detachObjectFromGroup(group, child.object)
  group.add(child.object)
  child.object.group = group
}

const appendChildToGroup = (parent: FabricNode, child: FabricNode): void => {
  linkChildToGroup(parent, child)

  const group = requireGroupContainer(parent)
  detachObjectFromGroup(group, child.object)
  toCanvasCoordinates(group, child.object)
  group.addWithUpdate(child.object)
  reapplyGroupTransform(parent)
}

const insertChildIntoGroup = (
  parent: FabricNode,
  child: FabricNode,
  beforeChild: FabricNode,
): void => {
  unlink(child)
  const index = parent.children.indexOf(beforeChild)
  const insertIndex = index === -1 ? parent.children.length : index
  linkAt(parent, child, insertIndex)

  const group = requireGroupContainer(parent)
  detachObjectFromGroup(group, child.object)
  toCanvasCoordinates(group, child.object)
  group.addWithUpdate(child.object)

  const objects = group._objects
  const currentIndex = objects.indexOf(child.object)
  if (currentIndex !== -1) objects.splice(currentIndex, 1)
  objects.splice(insertIndex, 0, child.object)
  group.dirty = true

  reapplyGroupTransform(parent)
}

const detachObjectFromCanvas = (container: RootContainer, object: fabric.Object): void => {
  if (container.canvas.getObjects().indexOf(object) !== -1) container.canvas.remove(object)
}

const zIndexOf = (props: HostProps): number => {
  const value = props.zIndex
  return typeof value === "number" ? value : 0
}

const managedPlacement = (container: RootContainer, node: FabricNode): number => {
  const ownIndex = container.children.indexOf(node)
  const ownZIndex = zIndexOf(node.props)
  let placement = 0

  container.children.forEach((sibling, index) => {
    if (sibling === node) return
    const zIndex = zIndexOf(sibling.props)
    if (zIndex < ownZIndex || (zIndex === ownZIndex && index < ownIndex)) placement += 1
  })

  return placement
}

const repositionManagedChild = (
  node: FabricNode,
  prevProps: HostProps,
  nextProps: HostProps,
): void => {
  if (node.parent) return
  if (zIndexOf(prevProps) === zIndexOf(nextProps)) return

  const container = node.root
  const canvasIndex = managedPlacement(container, node)
  container.canvas.moveTo(node.object, canvasIndex)
}

const normalizeExternalObjectPlacement = (container: RootContainer): void => {
  if (container.externalObjectPlacement === "above") return

  const canvasObjects = container.canvas.getObjects()
  const managed = [...container.children]
    .sort((left, right) => managedPlacement(container, left) - managedPlacement(container, right))
    .filter((child) => canvasObjects.indexOf(child.object) !== -1)
  const trailingManaged = canvasObjects.slice(canvasObjects.length - managed.length)
  if (
    managed.length === trailingManaged.length &&
    managed.every((child, index) => child.object === trailingManaged[index])
  ) {
    return
  }

  for (const child of managed) {
    container.canvas.moveTo(child.object, canvasObjects.length - 1)
  }
}

const insertIntoContainer = (
  container: RootContainer,
  child: FabricNode,
  beforeChild: FabricNode | null,
): void => {
  const existing = container.children.indexOf(child)
  if (existing !== -1) container.children.splice(existing, 1)

  const beforeIndex = beforeChild ? container.children.indexOf(beforeChild) : -1
  const insertIndex = beforeIndex === -1 ? container.children.length : beforeIndex
  container.children.splice(insertIndex, 0, child)

  detachObjectFromCanvas(container, child.object)
  const canvasIndex = managedPlacement(container, child)
  container.canvas.insertAt(child.object, canvasIndex, false)
}

const detachNodeTree = (node: FabricNode): void => {
  detachEventHandlers(node)

  for (const child of [...node.children]) detachNodeTree(child)
  node.children.length = 0
  node.parent = null
}

const createNode = (type: FabricElementType, props: HostProps, root: RootContainer): FabricNode => {
  const factory = type === "primitive" ? null : resolveObjectFactory(type)
  const node: FabricNode = {
    type,
    object: factory ? factory() : resolvePrimitiveObject(props),
    props: {},
    defaults: new Map(),
    parent: null,
    children: [],
    root,
    listeners: new Map(),
    pointerDown: null,
    hiddenVisible: undefined,
  }

  applyNodeProps(node, {}, props)
  attachEventHandlers(node)
  return node
}

type RuntimeHostConfig = {
  rendererVersion: string
  rendererPackageName: string
  extraDevToolsConfig: null
  suspendOnActiveViewTransition: () => void
  bindToConsole: (methodName: string, args: unknown[], badgeName: string) => () => void
}

export type FabricHostConfig = Reconciler.HostConfig<
  FabricElementType,
  HostProps,
  RootContainer,
  FabricNode,
  never,
  never,
  never,
  never,
  fabric.Object,
  HostContext,
  never,
  TimeoutHandle,
  -1,
  null
> &
  RuntimeHostConfig

export const fabricHostConfig: FabricHostConfig = {
  supportsMutation: true,
  supportsPersistence: false,
  supportsHydration: false,
  isPrimaryRenderer: true,
  warnsIfNotActing: true,
  rendererVersion: "0.1.0",
  rendererPackageName: "@digs/react-fabric-fiber",
  extraDevToolsConfig: null,
  NotPendingTransition: null,
  HostTransitionContext: HOST_TRANSITION_CONTEXT as unknown as Reconciler.ReactContext<null>,

  createInstance: createNode,

  createTextInstance: (text: string): never => {
    throw new Error(
      `Text "${text}" cannot be rendered directly. Pass text through the <Text text="..." /> prop instead.`,
    )
  },

  appendInitialChild: appendInitialChildToGroup,

  finalizeInitialChildren: (node: FabricNode): boolean => {
    const group = groupContainer(node)
    if (group && node.children.length > 0) {
      group.addWithUpdate()
      reapplyGroupTransform(node)
    }
    return false
  },

  shouldSetTextContent: (): boolean => false,

  commitUpdate: (
    node: FabricNode,
    _type: FabricElementType,
    prevProps: HostProps,
    nextProps: HostProps,
  ): void => {
    invariant(
      node.type !== "primitive" || prevProps.object === nextProps.object,
      "Changing the <Primitive> object prop is not supported. Pass a new key to mount the new object.",
    )
    applyNodeProps(node, prevProps, nextProps)
    attachEventHandlers(node)
    repositionManagedChild(node, prevProps, nextProps)
  },

  getRootHostContext: (): HostContext => EMPTY_CONTEXT,
  getChildHostContext: (context: HostContext): HostContext => context,

  getPublicInstance: (node: FabricNode): fabric.Object => node.object,

  prepareForCommit: (): null => null,
  resetAfterCommit: (container: RootContainer): void => {
    normalizeExternalObjectPlacement(container)
    container.canvas.requestRenderAll()
  },
  preparePortalMount: (): void => {},

  appendChild: appendChildToGroup,
  appendChildToContainer: (container: RootContainer, child: FabricNode): void => {
    insertIntoContainer(container, child, null)
  },

  insertBefore: insertChildIntoGroup,
  insertInContainerBefore: (
    container: RootContainer,
    child: FabricNode,
    beforeChild: FabricNode,
  ): void => {
    insertIntoContainer(container, child, beforeChild)
  },

  removeChild: (parent: FabricNode, child: FabricNode): void => {
    requireGroupContainer(parent).removeWithUpdate(child.object)
    child.object.fire("removed")
    detachNodeTree(child)
    reapplyGroupTransform(parent)
  },
  removeChildFromContainer: (container: RootContainer, child: FabricNode): void => {
    const index = container.children.indexOf(child)
    if (index !== -1) container.children.splice(index, 1)
    container.canvas.remove(child.object)
    detachNodeTree(child)
  },

  hideInstance: (node: FabricNode): void => {
    node.hiddenVisible = node.object.visible
    node.object.visible = false
    node.root.canvas.requestRenderAll()
  },
  unhideInstance: (node: FabricNode): void => {
    node.object.visible = node.hiddenVisible ?? true
    node.hiddenVisible = undefined
    node.root.canvas.requestRenderAll()
  },

  detachDeletedInstance: (node: FabricNode): void => {
    detachEventHandlers(node)
  },

  clearContainer: (container: RootContainer): void => {
    for (const child of [...container.children]) {
      detachNodeTree(child)
      container.canvas.remove(child.object)
    }
    container.children.length = 0
  },

  scheduleTimeout: (handler: (...args: unknown[]) => unknown, delay?: number): TimeoutHandle =>
    setTimeout(handler, delay) as unknown as TimeoutHandle,
  cancelTimeout: (handle: TimeoutHandle): void => clearTimeout(handle),
  noTimeout: -1,

  getInstanceFromNode: (): null => null,
  beforeActiveInstanceBlur: (): void => {},
  afterActiveInstanceBlur: (): void => {},
  prepareScopeUpdate: (): void => {},
  getInstanceFromScope: (): null => null,

  setCurrentUpdatePriority: (priority: EventPriority): void => {
    currentUpdatePriority = priority
  },
  getCurrentUpdatePriority: (): EventPriority => currentUpdatePriority,
  resolveUpdatePriority: (): EventPriority =>
    currentUpdatePriority !== NO_EVENT_PRIORITY ? currentUpdatePriority : DEFAULT_EVENT_PRIORITY,

  resetFormInstance: (): void => {},

  requestPostPaintCallback: (): void => {},
  shouldAttemptEagerTransition: (): boolean => false,
  trackSchedulerEvent: (): void => {},
  resolveEventType: (): null => null,
  resolveEventTimeStamp: (): number => -1.1,

  maySuspendCommit: (): boolean => false,
  preloadInstance: (): boolean => true,
  startSuspendingCommit: (): null => null,
  suspendInstance: (): void => {},
  suspendOnActiveViewTransition: (): void => {},
  waitForCommitToBeReady: (): null => null,

  bindToConsole: (methodName: string, args: unknown[], badgeName: string): (() => void) => {
    const candidate = Reflect.get(console, methodName)
    const logger: (...params: unknown[]) => void =
      typeof candidate === "function" ? (candidate as (...params: unknown[]) => void) : console.log
    return () => logger(`%c${badgeName}`, "color: #7c3aed; font-weight: bold", ...args)
  },
}
