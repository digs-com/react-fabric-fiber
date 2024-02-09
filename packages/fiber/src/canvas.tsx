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
}

export const Canvas = forwardRef<HTMLCanvasElement, Props>(function Canvas(
  { children, resize, ...canvasProps },
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
    if (!canvas || !containerRect.width || !containerRect.height) return;

    root.current ??= createRoot(canvas, canvasProps);
    root.current.resize(containerRect);
    root.current.render(
      <CanvasProvider root={root.current}>{children}</CanvasProvider>
    );
  });

  useEffect(() => {
    return () => {
      root.current?.destroy();
      root.current = null;
    };
  }, []);

  return (
    <div ref={containerRef} style={{ width: "100%", height: "100%" }}>
      <canvas ref={canvasRef} style={{ display: "block" }} />
    </div>
  );
});
