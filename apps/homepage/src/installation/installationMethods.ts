import type { InstallationMethod } from "../app/contracts"

export const installationMethods: readonly InstallationMethod[] = [
  { label: "npm", command: "npm install @digs/react-fabric-fiber fabric react react-dom" },
  { label: "yarn", command: "yarn add @digs/react-fabric-fiber fabric react react-dom" },
  { label: "pnpm", command: "pnpm add @digs/react-fabric-fiber fabric react react-dom" },
  { label: "bun", command: "bun add @digs/react-fabric-fiber fabric react react-dom" },
]
