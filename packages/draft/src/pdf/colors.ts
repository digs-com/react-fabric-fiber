export type PaintColor = string | null

function byte(value: number): number {
  return Math.max(0, Math.min(255, Math.round(value)))
}

function normalized(value: number): number {
  return byte(value <= 1 ? value * 255 : value)
}

function hex(red: number, green: number, blue: number): string {
  return `#${[red, green, blue].map((value) => byte(value).toString(16).padStart(2, "0")).join("")}`
}

function toNumbers(value: unknown): number[] | null {
  if (typeof value === "number") return [value]
  if (Array.isArray(value) && value.every((entry) => typeof entry === "number")) {
    return value
  }
  return null
}

export function parseColor(args: readonly unknown[]): PaintColor {
  const value = args[0]
  if (typeof value === "string") {
    return value === "transparent" ? null : value
  }

  const channels = Array.isArray(value) ? toNumbers(value) : toNumbers(args)
  if (!channels) return null

  switch (channels.length) {
    case 1: {
      const gray = normalized(channels[0] as number)
      return hex(gray, gray, gray)
    }
    case 3:
      return hex(
        normalized(channels[0] as number),
        normalized(channels[1] as number),
        normalized(channels[2] as number),
      )
    case 4: {
      const [cyan = 0, magenta = 0, yellow = 0, black = 0] = channels
      return hex(
        255 * (1 - cyan) * (1 - black),
        255 * (1 - magenta) * (1 - black),
        255 * (1 - yellow) * (1 - black),
      )
    }
    default:
      return null
  }
}
