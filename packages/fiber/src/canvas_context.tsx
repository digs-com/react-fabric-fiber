import type { fabric } from "fabric";
import { createContext, useContext, type PropsWithChildren } from "react";
import type { ReconcilerRoot } from "./root";

export type CanvasContextType = fabric.Canvas;
const CanvasContext = createContext<CanvasContextType>(null!);

interface CanvasProviderProps extends PropsWithChildren {
  root: ReconcilerRoot;
}

export const useCanvasContext = () => useContext(CanvasContext);
export const CanvasProvider = ({ children, root }: CanvasProviderProps) => {
  return (
    <CanvasContext.Provider value={root.canvas}>
      {children}
    </CanvasContext.Provider>
  );
};
