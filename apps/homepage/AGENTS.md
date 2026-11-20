# Homepage documentation scaffold

Private Vite/React documentation site for `@digs/react-fabric-fiber`. It renders one MDX article inside a site shell, with live fabric canvas examples, Tailwind CSS styling, and Catppuccin Mocha/Latte palettes.

## Structure

```text
examples/homepage/
├── index.html                 Vite entry document
├── public/                    Static assets served from /
├── src/
│   ├── main.tsx               Mounts App; imports global CSS
│   ├── app/                   Route table, page composition, shared contracts
│   ├── shell/                 Page geometry and responsive layout
│   ├── header/                Site chrome
│   ├── search/                Search control
│   ├── navigation/            Navigation data, active path, sidebar
│   ├── installation/          Package-manager commands and tabs
│   ├── demos/                 Live canvas scenes, one per demo page
│   ├── article/               One .mdx per page, plus MDX and article plumbing
│   └── theme/                 Tailwind vocabulary, palettes, global CSS, mode controls
├── tsconfig.json
├── vite.config.ts
└── AGENTS.md
```

Put new files in the directory whose ownership matches their axis of change.

## Volatility ownership

Each path owns exactly one axis of change:

| Path               | Owns                                                        |
| ------------------ | ----------------------------------------------------------- |
| `app/App.tsx`      | Route table, concrete page composition, document title      |
| `app/contracts.ts` | Typed interfaces shared across features                     |
| `shell/`           | Page geometry and responsive layout                         |
| `header/`          | Site header and repository link                             |
| `search/`          | Search-control markup                                       |
| `navigation/`      | Navigation information architecture, active path, rendering |
| `installation/`    | Package-manager command variants and tab selection          |
| `demos/`           | Live canvas scenes, one component per demo page             |
| `article/`         | Article copy, MDX intrinsic rendering, article framing      |
| `theme/`           | Palette values, semantic utilities, global CSS, mode state  |
| `main.tsx`         | Vite mount and global CSS imports                           |
| `vite.config.ts`   | Aliases, MDX compilation, dev/build configuration           |

Use Tailwind utilities in JSX and MDX for all component and example layout, spacing, typography, borders, responsive behavior, and states. Do not introduce inline style objects or additional component stylesheets. Only `theme/global.css` carries document-level CSS.

Fenced code blocks are highlighted by `@shikijs/rehype` in the MDX compile step, using the Catppuccin Latte and Mocha Shiki themes together. Shiki emits per-token `--shiki-light`/`--shiki-dark` custom properties on `span` elements, so token colors are the one place CSS custom properties replace utilities: `theme/global.css` maps those properties to the `data-theme` attribute. `article/mdx-components.tsx` merges the Shiki `shiki` class into the Tailwind `pre` classes so that mapping keeps applying; do not replace that composition with a fixed `className`.

## Pages

Every page is one `.mdx` file in `article/`, one `navigationSections` item whose `href` is the page path, and one entry in the `pages` table of `app/App.tsx` mapping that path to the compiled MDX component. `getting-started.mdx` is the only multi-section page (installation and first scene live inside it); every other navigation item is a page of its own. Adding documentation means adding those three things; never stack articles onto one page. `usePathname` supplies the current path, the sidebar marks the matching item with `aria-current="location"`, and App sets `document.title` from the page title. Unknown paths render the in-app not-found page.

Navigation is plain anchor navigation, so each click is a document load: the dev server, `vite preview`, and any static host must serve `index.html` for unknown paths (SPA fallback).

The live scenes live in `demos/` and are embedded by their matching article (`interactive-canvas.mdx`, `groups.mdx`, `pdf-pages.mdx`, `viewport-controls.mdx`). Each live component owns its own interaction state and is referenced from one page. Demo pages render wide (`Article wide`), so their canvases fill the content area instead of the document column; document pages keep the `max-w-[760px]` column. The PDF page renders `PDFPage` at its natural scale and fits the sheet with a fabric viewport transform, so zooming stays vector-crisp; it reads `public/sample-blueprint.pdf`, accepts a local PDF through the file picker, and needs `pdfjs-dist` plus the `@digs/draft` source alias, declared in both `tsconfig.json` and `vite.config.ts`; keep `react` and `react-dom` in `resolve.dedupe` or `@digs/draft` hooks resolve against a second React copy.

## Composition rules

Only `app/App.tsx` may compose multiple concrete UI feature implementations. Feature components do not import other feature components; they consume ReactNode slots and typed data props. The theme toggle may consume the theme hook through `ColorSchemeController`, its typed behavior contract. Replacing an implementation behind any of these boundaries must not require consumer edits.

Interaction order, transport, and orchestration must not become component contracts. New behavior with a different change axis gets a new module behind a typed contract rather than conditional responsibilities in an existing module. All inputs and outputs remain explicitly typed, and no comments or styling/runtime conventions may conflict with repository root guidance.

## MDX authoring

- Create and edit articles as `src/article/*.mdx`.
- Import executable components at the top of the MDX file.
- Use inline JSX for live examples and fenced `tsx` blocks for annotated TypeScript source.
- Author package-manager installation variants through `<InstallationTabs methods={installationMethods} initialMethod="pnpm" />`; the tab set lives in `installation/installationMethods.ts`, the default comes from the article.
- Keep fenced snippets minimal library usage: no Tailwind utilities, page chrome, or docs-only wrappers. Those belong to the JSX that hosts the example, not to the code readers copy.
- Tag every fence with its language; the tag selects the Shiki grammar, so an untagged fence renders uncolored.
- Use a typed `.tsx` component imported by MDX when an executable example needs TypeScript-only annotations or generics.
- Keep MDX repository-authored and trusted; never load untrusted remote MDX.
- When changing a heading that navigation targets, update `navigation/navigation.ts` to the `rehype-slug` GitHub-style id in the same change.

## Commands

Run from the workspace root:

```sh
pnpm --filter homepage dev
pnpm --filter homepage build
pnpm --filter homepage typecheck
```
