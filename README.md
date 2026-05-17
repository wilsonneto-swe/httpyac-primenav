# httpYac PrimeNav

Workspace-wide navigation for `.http` and `.rest` files using [httpYac](https://httpyac.github.io/) conventions.

It adds a workspace-wide tree, fuzzy search and metadata-aware grouping for httpYac request files.

## Features

- **Activity Bar tree** listing every `.http` / `.rest` file in the workspace, expanded into its requests and `####` sections.
- **Fuzzy search** over every request, filterable by method, name, file path or URL — `Cmd/Ctrl+Shift+H` opens it scoped to the current file, `Cmd+Ctrl+H` / `Ctrl+Alt+H` opens it workspace-wide, and a title-bar button toggles the scope once open.
- **httpYac metadata aware** — `# @name`, `# @title`, `# @ref`, `# @forceRef`, `# @disabled`, `# @import` and `####` sections shape the labels and grouping.
- **Method-colored icons** for `GET` / `POST` / `PUT` / `PATCH` / `DELETE`, the metadata verbs and the streaming protocols (`GRPC`, `WS`, `GRAPHQL`, …).
- **Click to reveal** — jump straight to the request line in the editor.
- **Send delegation** — when the [httpYac extension](https://marketplace.visualstudio.com/items?itemName=anweber.vscode-httpyac) is installed, an inline ▶ button runs the request through it.

This is a **navigation-only** extension: it ships no HTTP engine and renders no responses. Execution is delegated to httpYac.

## Usage

1. Open a workspace containing `.http` / `.rest` files.
2. Click the **httpYac PrimeNav** icon in the Activity Bar.
3. Browse the tree, or fuzzy-search requests: `Cmd/Ctrl+Shift+H` (current file) or `Cmd+Ctrl+H` / `Ctrl+Alt+H` (whole workspace).
4. Click a request to reveal it; use the ▶ action to send it via httpYac.

## Settings

| Setting | Default | Description |
|---|---|---|
| `httpyacPrimeNav.fileGlob` | `**/*.{http,rest}` | Glob used to discover request files. |
| `httpyacPrimeNav.excludeGlob` | `**/node_modules/**` | Glob excluded from discovery. |
| `httpyacPrimeNav.groupBySections` | `true` | Group requests under `#### Section` headers. |

## Development

```bash
npm install
npm run watch        # webpack in watch mode
npm test             # jest unit tests (parser + workspace index)
npm run lint
npm run test:integration   # @vscode/test-electron smoke test
```

Press `F5` in VS Code / Cursor to launch the Extension Development Host.

## License

MIT
