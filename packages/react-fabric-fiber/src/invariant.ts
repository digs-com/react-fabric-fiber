export type ErrorConstructor = new (message: string) => Error

export default function invariant(
  condition: unknown,
  message: string = "Invariant failed",
  ErrorType: ErrorConstructor = Error,
): asserts condition {
  if (!condition) {
    throw new ErrorType(message)
  }
}
