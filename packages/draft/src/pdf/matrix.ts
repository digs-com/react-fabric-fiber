export type Matrix = readonly [number, number, number, number, number, number]

export const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0]

export function multiply(first: Matrix, second: Matrix): Matrix {
  return [
    first[0] * second[0] + first[2] * second[1],
    first[1] * second[0] + first[3] * second[1],
    first[0] * second[2] + first[2] * second[3],
    first[1] * second[2] + first[3] * second[3],
    first[0] * second[4] + first[2] * second[5] + first[4],
    first[1] * second[4] + first[3] * second[5] + first[5],
  ]
}

export function applyMatrix(matrix: Matrix, x: number, y: number): [number, number] {
  return [matrix[0] * x + matrix[2] * y + matrix[4], matrix[1] * x + matrix[3] * y + matrix[5]]
}

export function matrixScale(matrix: Matrix): number {
  return Math.sqrt(Math.abs(matrix[0] * matrix[3] - matrix[1] * matrix[2]))
}

export function asMatrix(value: unknown): Matrix | null {
  if (!Array.isArray(value) && !(ArrayBuffer.isView(value) && !(value instanceof DataView))) {
    return null
  }

  const entries = value as ArrayLike<unknown>
  if (entries.length < 6) return null

  const matrix = [0, 1, 2, 3, 4, 5].map((index) => {
    const entry = entries[index]
    return typeof entry === "number" ? entry : 0
  })

  return matrix as unknown as Matrix
}
