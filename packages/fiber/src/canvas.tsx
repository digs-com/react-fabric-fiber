import type { fabric } from "fabric";
import {
  PropsWithChildren,
  forwardRef,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
} from "react";
import type { Options as ResizeOptions } from "react-use-measure";
import useMeasure from "react-use-measure";
import { CanvasProvider } from "./canvas_context";
import { ReconcilerRoot, createRoot } from "./root";

interface Props extends Partial<fabric.ICanvasOptions>, PropsWithChildren {
  resize?: ResizeOptions;

  /**
   * Callback to be called when the canvas is created or changed.
   */
  onCreated?: (canvas: fabric.Canvas) => void;
}

export const Canvas = forwardRef<HTMLCanvasElement, Props>(function Canvas(
  { children, resize, onCreated, ...canvasProps },
  forwardedRef
) {
  const canvasRef = useRef<HTMLCanvasElement>(null!);
  useImperativeHandle(forwardedRef, () => canvasRef.current);

  const [containerRef, containerRect] = useMeasure({
    scroll: true,
    debounce: { scroll: 50, resize: 0 },
    ...resize,
  });

  const root = useRef<ReconcilerRoot | null>(null);
  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    const { width, height } = containerRect;
    if (!canvas || !width || !height) return;

    if (!root.current) {
      root.current = createRoot(canvas, { width, height, ...canvasProps });
      onCreated?.(root.current.canvas);
    }

    root.current.render(
      <CanvasProvider root={root.current}>{children}</CanvasProvider>
    );
  });

  useLayoutEffect(() => {
    if (!root.current) return;

    root.current.resize(containerRect);
  }, [containerRect.width, containerRect.height]);

  useEffect(() => {
    return () => {
      root.current?.destroy();
      root.current = null;
    };
  }, []);

  return (
    <div ref={containerRef} style={{ width: "100%", height: "100%" }}>
      <canvas ref={canvasRef} />
    </div>
  );
});
