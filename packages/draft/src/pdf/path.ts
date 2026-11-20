import { applyMatrix, type Matrix } from "./matrix"

export interface Bounds {
  minX: number
  minY: number
  maxX: number
  maxY: number
}

export interface PathBuilder {
  moveTo(x: number, y: number, matrix: Matrix): void
  lineTo(x: number, y: number, matrix: Matrix): void
  curveTo(
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    x: number,
    y: number,
    matrix: Matrix,
  ): void
  curveTo2(x2: number, y2: number, x: number, y: number, matrix: Matrix): void
  curveTo3(x1: number, y1: number, x: number, y: number, matrix: Matrix): void
  closePath(): void
  rectangle(x: number, y: number, width: number, height: number, matrix: Matrix): void
  isEmpty(): boolean
  bounds(): Bounds | null
  toString(): string
}

interface MutableBounds {
  minX: number
  minY: number
  maxX: number
  maxY: number
}

const createMutableBounds = (): MutableBounds => ({
  minX: Infinity,
  minY: Infinity,
  maxX: -Infinity,
  maxY: -Infinity,
})

const includePoint = (bounds: MutableBounds, x: number, y: number): void => {
  if (x < bounds.minX) bounds.minX = x
  if (y < bounds.minY) bounds.minY = y
  if (x > bounds.maxX) bounds.maxX = x
  if (y > bounds.maxY) bounds.maxY = y
}

const containsPoint = (bounds: MutableBounds): boolean => bounds.minX <= bounds.maxX

const toBounds = (bounds: MutableBounds): Bounds | null =>
  containsPoint(bounds)
    ? { minX: bounds.minX, minY: bounds.minY, maxX: bounds.maxX, maxY: bounds.maxY }
    : null

export function createPathBuilder(): PathBuilder {
  const commands: string[] = []
  const bounds = createMutableBounds()
  let currentX = 0
  let currentY = 0

  const point = (x: number, y: number, matrix: Matrix): [number, number] => {
    const transformed = applyMatrix(matrix, x, y)
    includePoint(bounds, transformed[0], transformed[1])
    currentX = transformed[0]
    currentY = transformed[1]
    return transformed
  }

  const control = (x: number, y: number, matrix: Matrix): [number, number] => {
    const transformed = applyMatrix(matrix, x, y)
    includePoint(bounds, transformed[0], transformed[1])
    return transformed
  }

  return {
    moveTo(x, y, matrix) {
      const [nextX, nextY] = point(x, y, matrix)
      commands.push(`M${nextX} ${nextY}`)
    },
    lineTo(x, y, matrix) {
      const [nextX, nextY] = point(x, y, matrix)
      commands.push(`L${nextX} ${nextY}`)
    },
    curveTo(x1, y1, x2, y2, x, y, matrix) {
      const [firstX, firstY] = control(x1, y1, matrix)
      const [secondX, secondY] = control(x2, y2, matrix)
      const [nextX, nextY] = point(x, y, matrix)
      commands.push(`C${firstX} ${firstY} ${secondX} ${secondY} ${nextX} ${nextY}`)
    },
    curveTo2(x2, y2, x, y, matrix) {
      const [secondX, secondY] = control(x2, y2, matrix)
      const startX = currentX
      const startY = currentY
      const [nextX, nextY] = point(x, y, matrix)
      commands.push(`C${startX} ${startY} ${secondX} ${secondY} ${nextX} ${nextY}`)
    },
    curveTo3(x1, y1, x, y, matrix) {
      const [firstX, firstY] = control(x1, y1, matrix)
      const [nextX, nextY] = point(x, y, matrix)
      commands.push(`C${firstX} ${firstY} ${nextX} ${nextY} ${nextX} ${nextY}`)
    },
    closePath() {
      commands.push("Z")
    },
    rectangle(x, y, width, height, matrix) {
      const [left, top] = point(x, y, matrix)
      const [right, bottom] = control(x + width, y + height, matrix)
      commands.push(`M${left} ${top}L${right} ${top}L${right} ${bottom}L${left} ${bottom}Z`)
    },
    isEmpty() {
      return commands.length === 0
    },
    bounds() {
      return toBounds(bounds)
    },
    toString() {
      return commands.join("")
    },
  }
}

export interface DrawPath {
  path: string
  bounds: Bounds | null
  rectangle: Bounds | null
}

const RECTANGLE_TOLERANCE = 1e-6

const rectangleFromPoints = (points: readonly (readonly [number, number])[]): Bounds | null => {
  const [first, second, third, fourth] = points
  if (!first || !second || !third || !fourth) return null
  const horizontal = (start: readonly [number, number], end: readonly [number, number]): boolean =>
    Math.abs(start[1] - end[1]) <= RECTANGLE_TOLERANCE
  const vertical = (start: readonly [number, number], end: readonly [number, number]): boolean =>
    Math.abs(start[0] - end[0]) <= RECTANGLE_TOLERANCE
  if (
    !horizontal(first, second) ||
    !vertical(second, third) ||
    !horizontal(third, fourth) ||
    !vertical(fourth, first)
  ) {
    return null
  }
  const xs = points.map(([x]) => x)
  const ys = points.map(([, y]) => y)
  return {
    minX: Math.min(...xs),
    minY: Math.min(...ys),
    maxX: Math.max(...xs),
    maxY: Math.max(...ys),
  }
}

export function pathFromDrawCommands(data: ArrayLike<number>, matrix: Matrix): DrawPath {
  const builder = createPathBuilder()
  const points: [number, number][] = []
  let index = 0
  let moves = 0
  let lines = 0
  let curves = 0
  let closes = 0

  const next = (): number => data[index++] as number

  while (index < data.length) {
    const command = next()
    switch (command) {
      case 0: {
        const x = next()
        const y = next()
        moves += 1
        points.push(applyMatrix(matrix, x, y))
        builder.moveTo(x, y, matrix)
        break
      }
      case 1: {
        const x = next()
        const y = next()
        lines += 1
        points.push(applyMatrix(matrix, x, y))
        builder.lineTo(x, y, matrix)
        break
      }
      case 2:
        curves += 1
        builder.curveTo(next(), next(), next(), next(), next(), next(), matrix)
        break
      case 3:
        curves += 1
        builder.curveTo2(next(), next(), next(), next(), matrix)
        break
      case 4:
        closes += 1
        builder.closePath()
        break
      default:
        break
    }
  }

  const rectangle =
    moves === 1 && lines === 3 && curves === 0 && closes === 1 ? rectangleFromPoints(points) : null

  return { path: builder.toString(), bounds: builder.bounds(), rectangle }
}
