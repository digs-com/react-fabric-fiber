import type { ReactElement } from "react"

import type { ArticleProps } from "../app/contracts"

export function Article({ children, wide = false }: ArticleProps): ReactElement {
  return <article className={wide ? "min-w-0" : "min-w-0 max-w-[760px]"}>{children}</article>
}
