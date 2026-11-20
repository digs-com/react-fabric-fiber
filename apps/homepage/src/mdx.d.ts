/// <reference types="mdx" />

import type { JSX as ReactJSX } from "react/jsx-runtime"

declare global {
  namespace JSX {
    type ElementClass = ReactJSX.ElementClass
    type Element = ReactJSX.Element
    type ElementType = ReactJSX.ElementType
    type IntrinsicElements = ReactJSX.IntrinsicElements
  }
}
