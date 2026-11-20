import { fabric } from "fabric"

import type { Matrix } from "./matrix"

export interface RenderClip {
  path: Path2D
  fillRule: "nonzero" | "evenodd"
  matrix: Matrix
  offsetX: number
  offsetY: number
}

export interface Clipped {
  clips?: readonly RenderClip[]
}

const applyCanvasMatrix = (ctx: CanvasRenderingContext2D, matrix: Matrix): void => {
  ctx.transform(matrix[0], matrix[1], matrix[2], matrix[3], matrix[4], matrix[5])
}

export function drawWithClips(
  object: fabric.Object & Clipped,
  ctx: CanvasRenderingContext2D,
  draw: () => void,
): void {
  const clips = object.clips
  if (!clips) {
    draw()
    return
  }

  const transform = ctx.getTransform()
  const inverse = fabric.util.invertTransform(object.calcTransformMatrix())
  ctx.save()
  for (const clip of clips) {
    ctx.setTransform(transform)
    applyCanvasMatrix(ctx, inverse as unknown as Matrix)
    applyCanvasMatrix(ctx, clip.matrix)
    ctx.translate(-clip.offsetX, -clip.offsetY)
    ctx.clip(clip.path, clip.fillRule)
  }
  ctx.setTransform(transform)
  draw()
  ctx.restore()
}

export class ClippedImage extends fabric.Image {
  clips?: readonly RenderClip[]

  drawObject(ctx: CanvasRenderingContext2D): void {
    drawWithClips(this, ctx, () => super.drawObject(ctx))
  }
}
