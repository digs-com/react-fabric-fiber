import type { ReactElement } from "react"
import type { MDXComponents } from "mdx/types.js"

export const mdxComponents: MDXComponents = {
  h1: (props: JSX.IntrinsicElements["h1"]): ReactElement => (
    <h1
      {...props}
      className="scroll-mt-32 text-3xl font-bold tracking-tight md:scroll-mt-24 md:text-4xl"
    />
  ),
  h2: (props: JSX.IntrinsicElements["h2"]): ReactElement => (
    <h2 {...props} className="mt-12 scroll-mt-32 text-xl font-semibold md:scroll-mt-24" />
  ),
  p: (props: JSX.IntrinsicElements["p"]): ReactElement => (
    <p {...props} className="mt-4 text-sm leading-7 text-docs-text md:text-base" />
  ),
  pre: ({ className, ...props }: JSX.IntrinsicElements["pre"]): ReactElement => (
    <pre
      {...props}
      className={`${className ?? ""} mt-4 overflow-x-auto rounded-lg border border-docs-border bg-docs-code p-4 font-mono text-sm leading-6 text-docs-text`}
    />
  ),
  a: (props: JSX.IntrinsicElements["a"]): ReactElement => (
    <a {...props} className="text-docs-accent underline underline-offset-4" />
  ),
}
