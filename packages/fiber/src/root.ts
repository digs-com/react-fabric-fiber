import { fabric } from "fabric";
import { ReactNode, version as ReactVersion } from "react";
import { ConcurrentRoot } from "react-reconciler/constants";
import { Root, createRenderer } from "./renderer";

const roots = new Map<HTMLCanvasElement, Root>();
const reconciler = createRenderer();

export type ReconcilerRoot = {
  canvas: fabric.Canvas;
  render: (elements: ReactNode) => void;
  resize: (rect: fabric.ICanvasDimensions) => void;
  destroy: () => void;
};

export function createRoot(
  canvas: HTMLCanvasElement,
  canvasProps?: Partial<fabric.ICanvasOptions>
): ReconcilerRoot {
  // Check against mistaken use of createRoot
  const prevRoot = roots.get(canvas);
  const prevFiber = prevRoot?.fiber;
  const prevCanvas = prevRoot?.canvas;

  if (prevRoot) console.warn("RFF.createRoot should only be called once!");

  // Report when an error was detected in a previous render
  // https://github.com/pmndrs/react-three-fiber/pull/2261
  const logRecoverableError =
    typeof reportError === "function"
      ? // In modern browsers, reportError will dispatch an error event,
        // emulating an uncaught JavaScript error.
        reportError
      : // In older browsers and test environments, fallback to console.error.
        console.error;

  // Create fabric canvas
  const fabricCanvas = prevCanvas ?? new fabric.Canvas(canvas, canvasProps);

  // Create renderer
  const fiber =
    prevFiber ||
    reconciler.createContainer(
      fabricCanvas,
      ConcurrentRoot,
      null,
      false,
      null,
      "",
      logRecoverableError,
      null
    );

  // Map it
  if (!prevRoot) roots.set(canvas, { fiber, canvas: fabricCanvas });

  return {
    canvas: fabricCanvas,
    render: (elements: ReactNode) => {
      reconciler.updateContainer(elements, fiber, null, () => undefined);
    },
    resize: ({ width, height }: fabric.ICanvasDimensions) => {
      fabricCanvas.setDimensions({ width, height });
    },
    destroy: () => {
      fabricCanvas.dispose();
    },
  };
}

reconciler.injectIntoDevTools({
  bundleType: process.env.NODE_ENV === "production" ? 0 : 1,
  rendererPackageName: "react-fabric-fiber",
  version: ReactVersion,
});
