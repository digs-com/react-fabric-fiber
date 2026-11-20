import { fileURLToPath } from "node:url"
import mdx from "@mdx-js/rollup"
import rehypeShiki from "@shikijs/rehype"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import rehypeSlug from "rehype-slug"
import type { ShikiTransformer } from "shiki"
import { defineConfig } from "vite"

const fromHere = (path: string): string => fileURLToPath(new URL(path, import.meta.url))

const languageClassTransformer: ShikiTransformer = {
  code(node) {
    if (this.options.lang) node.properties.class = `language-${this.options.lang}`
  },
}

export default defineConfig({
  plugins: [
    {
      enforce: "pre",
      ...mdx({
        rehypePlugins: [
          rehypeSlug,
          [
            rehypeShiki,
            {
              themes: { light: "catppuccin-latte", dark: "catppuccin-mocha" },
              defaultColor: false,
              transformers: [languageClassTransformer],
            },
          ],
        ],
      }),
    },
    react({ include: /\.(jsx|js|mdx|md|tsx|ts)$/ }),
    tailwindcss(),
  ],
  tsconfig: "./tsconfig.json",
  resolve: {
    dedupe: ["react", "react-dom"],
    alias: {
      "@digs/draft": fromHere("../../packages/draft/src/index.ts"),
      "@digs/react-fabric-fiber": fromHere("../../packages/react-fabric-fiber/src/index.ts"),
    },
  },
})
