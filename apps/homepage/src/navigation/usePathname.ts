import { useEffect, useState } from "react"

function currentPathname(): string {
  const pathname = window.location.pathname
  return pathname.length > 1 && pathname.endsWith("/") ? pathname.slice(0, -1) : pathname
}

export function usePathname(): string {
  const [pathname, setPathname] = useState(currentPathname)

  useEffect(() => {
    const handlePopState = (): void => setPathname(currentPathname())
    window.addEventListener("popstate", handlePopState)
    return () => window.removeEventListener("popstate", handlePopState)
  }, [])

  return pathname
}
