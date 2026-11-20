import { fileURLToPath } from "node:url"
import { defineConfig } from "vitest/config"

export default defineConfig({
  resolve: {
    alias: {
      "@digs/draft": fileURLToPath(new URL("./packages/draft/src/index.ts", import.meta.url)),
      "@digs/react-fabric-fiber": fileURLToPath(
        new URL("./packages/react-fabric-fiber/src/index.ts", import.meta.url),
      ),
    },
  },
  test: {
    environment: "jsdom",
    include: ["packages/*/test/**/*.test.{ts,tsx}"],
    setupFiles: ["./test/setup.ts"],
  },
})
