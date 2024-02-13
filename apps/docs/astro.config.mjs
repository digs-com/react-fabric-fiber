import starlight from "@astrojs/starlight";
import { defineConfig } from "astro/config";
import starlightTypeDoc, { typeDocSidebarGroup } from "starlight-typedoc";

// https://astro.build/config
export default defineConfig({
  server: {
    port: 3001,
  },
  integrations: [
    starlight({
      title: "react-fabric-fiber",
      social: {
        github: "https://github.com/digs-com/react-fabric-fiber",
      },
      plugins: [
        starlightTypeDoc({
          entryPoints: ["../../packages/fiber/src/index.ts"],
          tsconfig: "../../packages/fiber/tsconfig.json",
        }),
      ],
      sidebar: [
        {
          label: "Guides",
          autogenerate: { directory: "guides" },
        },
        typeDocSidebarGroup,
      ],
    }),
  ],
});
