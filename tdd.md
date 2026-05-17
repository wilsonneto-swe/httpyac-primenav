# TDD — `httpyac-primenav`

VS Code / Cursor extension focused on **navigation for `.http` and `.rest` files using httpYac conventions**. It is the spiritual successor of [`vscode-navigation-powerups`](https://github.com/wilsonneto-swe/vscode-navigation-powerups), narrowed to the httpYac dialect and extended with workspace-wide tree, fuzzy search, and metadata-aware grouping.

---

## 1. Goals

1. Deliver an **Activity Bar tree view** that lists every `.http`/`.rest` file in the workspace, expanded into its requests.
2. Provide a **fuzzy quick-pick search** (`Cmd/Ctrl+Shift+H`) over all requests in the workspace.
3. Use **httpYac metadata** (`# @name`, `# @title`, `# @ref`, `# @import`, `# @disabled`, sections via `####`) to label and group nodes.
4. Click on a node → jump to the file + line. Optional secondary action → trigger `httpyac.send` on that request.
5. Stay a **navigation-only** extension. No HTTP engine, no parser rewrite, no response rendering. Engine work belongs to `httpyac` or REST Client.

## 2. Non-goals

- Executing HTTP requests directly (delegated to `httpyac` extension if installed).
- Editing/refactoring requests.
- Rendering responses.
- Supporting Postman collection JSON.
- Supporting OpenAPI imports.
- Authoring assertions or scripts.

## 3. Base reference

The repo `wilsonneto-swe/vscode-navigation-powerups` already implements:
- A TreeDataProvider for the currently open `.http` file.
- Section detection by counting `#` (e.g. `####` = section, `###` = request).
- Real-time refresh on file edit.
- Webpack build, eslint, jest, vscode-test setup.

`httpyac-primenav` keeps that scaffolding/style and changes the scope:
- From **single open file** → **whole workspace**.
- From **markdown-style sections** → **httpYac semantics** (`### name`, `# @name`, `# @title`, etc.).
- Adds **fuzzy search command**.
- Adds **method-aware icons**.

## 4. Tech stack

- TypeScript, target ES2020, strict mode.
- VS Code Extension API (`engines.vscode >= ^1.85.0`).
- Build: webpack (same setup as the reference repo).
- Test: jest for unit tests on the parser; `@vscode/test-electron` for one smoke integration test.
- Lint: eslint with the reference repo's `.eslintrc.json`.
- No runtime dependencies beyond `vscode`. Fuzzy matching uses a tiny inline implementation or `fuse.js` (~10KB). Prefer inline to keep bundle small.

## 5. Repository layout

```
httpyac-primenav/
├── .github/workflows/ci.yml          # lint + test + build on PR
├── .vscode/                          # launch.json, tasks.json (same as reference)
├── images/                           # icon.png, screenshots for README
├── src/
│   ├── extension.ts                  # activate(), registers everything
│   ├── parser/
│   │   ├── httpFileParser.ts         # parses one .http file into Region[]
│   │   └── httpFileParser.test.ts
│   ├── workspace/
│   │   ├── workspaceIndex.ts         # discovers files, caches Region[]
│   │   └── workspaceIndex.test.ts
│   ├── tree/
│   │   ├── treeProvider.ts           # TreeDataProvider<Node>
│   │   └── treeItems.ts              # FolderNode, FileNode, RequestNode, SectionNode
│   ├── search/
│   │   └── quickPick.ts              # registers the fuzzy search command
│   ├── commands/
│   │   ├── revealRequest.ts          # open file at line
│   │   ├── sendRequest.ts            # delegate to httpyac.send
│   │   └── refresh.ts
│   ├── icons/
│   │   └── methodIcon.ts             # maps GET/POST/... → ThemeIcon + color
│   └── types.ts                      # Region, RequestRegion, SectionRegion
├── .eslintrc.json
├── .vscode-test.mjs
├── .vscodeignore
├── CHANGELOG.md
├── README.md
├── jest.config.js
├── package.json
├── tsconfig.json
└── webpack.config.js
```

## 6. Domain model

```ts
// src/types.ts

export type Method =
  | 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  | 'HEAD' | 'OPTIONS' | 'TRACE'
  // httpYac extra protocols
  | 'GRPC' | 'GRAPHQL' | 'WS' | 'MQTT' | 'SSE' | 'AMQP';

export interface RequestRegion {
  kind: 'request';
  /** From `# @name foo` if present, else from `### label`, else from URL. */
  label: string;
  /** Optional. `# @title` overrides label for display only. */
  title?: string;
  method?: Method;
  url?: string;
  /** Line where the `###` separator (or file start) sits. 0-indexed. */
  startLine: number;
  /** Line where the HTTP verb appears, used for "reveal" placement. */
  requestLine: number;
  disabled: boolean;
  /** `# @ref name` or `# @forceRef name` */
  refs: string[];
  /** Tag from a custom comment, e.g. `# @group auth`. Optional, used for grouping later. */
  group?: string;
}

export interface SectionRegion {
  kind: 'section';
  /** Header level — number of `#` minus 1. `####` = level 3. */
  level: number;
  label: string;
  startLine: number;
}

export type Region = RequestRegion | SectionRegion;

export interface ParsedFile {
  uri: vscode.Uri;
  regions: Region[];
  /** `# @import ./other.http` paths, resolved relative to this file. */
  imports: string[];
}
```

## 7. Parser specification (`src/parser/httpFileParser.ts`)

The parser is **line-based and regex-driven**. No tokenizer, no AST. It is intentionally lenient.

### 7.1 Rules

1. A **request region** starts on a line matching `^###(\s+.*)?$`. The text after `###` becomes the tentative `label`. If the line is just `###`, label is the empty string initially.
2. While inside a region, the parser scans metadata comments **before the HTTP verb line**:
   - `^#\s*@name\s+(\S+)` → overrides `label`.
   - `^#\s*@title\s+(.+)$` → sets `title`.
   - `^#\s*@ref\s+(\S+)` and `^#\s*@forceRef\s+(\S+)` → appends to `refs`.
   - `^#\s*@disabled\b` → sets `disabled = true`.
   - `^#\s*@import\s+(\S+)` → adds to `ParsedFile.imports` (not to the region).
   - `^#\s*@group\s+(\S+)` → sets `group` (custom, optional).
3. The **HTTP verb line** matches `^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS|TRACE|GRPC|GRAPHQL|WS|MQTT|SSE|AMQP)\s+(\S+)`. The first match within the region sets `method`, `url`, and `requestLine`. Lines that look like a verb but appear inside a body (after a blank line following headers) are ignored — keep it simple: only consider verb lines that appear **before the first blank line** inside the region.
4. If a region has no verb line, it still becomes a `RequestRegion` (label only) **only if** it has a `# @name`. Otherwise it is dropped.
5. **Sections** are lines matching `^(#{4,})\s+(.+)$`. The number of `#` minus 1 is the level (so `####` = 3, `#####` = 4). Sections do not start a request.
6. Label fallback order for display: `title` → `@name` → text after `###` → `${method} ${url}` → `(unnamed)`.
7. If the very first request in a file is **not** preceded by `###` (httpYac allows that — the file begins straight with `GET ...`), treat the first verb line as starting an implicit region at line 0.

### 7.2 Public API

```ts
export function parseHttpFile(text: string, uri: vscode.Uri): ParsedFile;
```

Pure function. No I/O. Easy to unit test.

### 7.3 Unit tests to ship (jest, `httpFileParser.test.ts`)

Each test is a string fixture + expected `Region[]`.

1. Single anonymous GET, no `###`.
2. Two requests separated by `###`, second with `# @name login`.
3. Request with `# @title` → label uses title.
4. Request with `# @disabled` → `disabled === true`.
5. Request with `# @ref a` and `# @forceRef b` → `refs === ['a','b']`.
6. File with `# @import ./other.http` → appears in `ParsedFile.imports`.
7. Sections: `#### Section` and `##### Sub` produce SectionRegions with levels 3 and 4.
8. Region without verb but with `@name` is kept; without either is dropped.
9. Comments inside body that look like `# @name` after the first blank line are **ignored**.
10. GraphQL/GRPC/WS verbs recognized.

## 8. Workspace index (`src/workspace/workspaceIndex.ts`)

### 8.1 Responsibilities

- Discover all `.http`/`.rest` files in every workspace folder using `vscode.workspace.findFiles('**/*.{http,rest}', '**/node_modules/**')`.
- Parse them on activation and cache the `ParsedFile`s in a `Map<string, ParsedFile>` keyed by `uri.toString()`.
- Listen to file events with a `FileSystemWatcher` for `**/*.{http,rest}`:
  - `onDidCreate` / `onDidChange` → reparse, update map, fire change event.
  - `onDidDelete` → remove from map, fire change event.
- Re-parse on `vscode.workspace.onDidChangeTextDocument` for unsaved dirty buffers — use document text instead of file contents so the tree reflects edits in real time.
- Debounce reparsing per file (e.g. 150ms) using a small util.

### 8.2 Public API

```ts
export class WorkspaceIndex implements vscode.Disposable {
  onDidChange: vscode.Event<void>;
  init(): Promise<void>;
  getAll(): ParsedFile[];
  getByUri(uri: vscode.Uri): ParsedFile | undefined;
  /** Flat list of every request across every file, for search. */
  getAllRequests(): Array<{ file: ParsedFile; region: RequestRegion }>;
  dispose(): void;
}
```

### 8.3 Unit tests (`workspaceIndex.test.ts`)

Stub `vscode.workspace.findFiles` and `FileSystemWatcher` via a small in-memory FS fake. Test:
1. Init populates the map with all parsed files.
2. `onDidChange` fires once per debounce window even on multiple edits.
3. Delete event removes the file from the map.
4. `getAllRequests` returns regions from every file.

## 9. Tree view (`src/tree/treeProvider.ts`)

### 9.1 Hierarchy

```
└─ Workspace folder name           (FolderNode, only if >1 folder, else hidden root)
   ├─ folderA/                     (FolderNode, mirrors filesystem)
   │  └─ requests.http             (FileNode)
   │     ├─ ### Auth section       (SectionNode, only if sections present in file)
   │     │  ├─ GET  /me            (RequestNode)
   │     │  └─ POST /login         (RequestNode)
   │     └─ GET /health            (RequestNode, sibling to sections)
   └─ another.http                 (FileNode, no section grouping)
```

Rules:
- Folder nodes mirror the filesystem path from each workspace folder down to the deepest folder that contains `.http` files. Empty intermediate folders are skipped.
- FileNode is collapsible. Default state: collapsed if there are >5 files, otherwise expanded.
- SectionNodes only appear when a file has at least one `####+` section. Requests before any section are listed as direct children of the FileNode, after sections appear they live under the matching section.
- A section "contains" every request whose `startLine` is greater than the section's `startLine` and less than the next section of the same-or-higher level.

### 9.2 Visual

- **Method icon** on each RequestNode using `ThemeIcon` with custom color:
  - `GET` → `arrow-down` blue
  - `POST` → `add` green
  - `PUT` → `edit` orange
  - `PATCH` → `diff` orange
  - `DELETE` → `trash` red
  - `HEAD` / `OPTIONS` → `info` gray
  - `GRPC` / `WS` / `MQTT` / `GRAPHQL` / `SSE` / `AMQP` → `radio-tower` purple
  - Use codicon names. Color via `new vscode.ThemeColor('charts.<color>')`.
- Disabled requests render in `description` field as `(disabled)` and use a dimmed icon (`circle-slash`).
- FileNode description shows count: `12 requests`.
- Tooltip on RequestNode shows `${METHOD} ${url}` and refs if any.

### 9.3 Interaction

- Single click → executes command `httpyac-primenav.reveal` with `{ uri, line: requestLine }`. Opens the editor at that line and selects the verb line.
- Inline action button (TreeItem context menu, `view/item/context`) → `httpyac-primenav.send` if the `anweber.vscode-httpyac` extension is installed and active. The command is hidden via `when` clause otherwise.
- Tree view title bar has two actions: **Refresh** and **Collapse All**.

### 9.4 Activation events

```json
"activationEvents": [
  "onLanguage:http",
  "onView:httpyacPrimeNav"
]
```

(`onLanguage:http` covers the case where the user opens a `.http` before clicking the activity bar icon.)

## 10. Fuzzy search (`src/search/quickPick.ts`)

### 10.1 Command

- Command id: `httpyac-primenav.search`
- Default keybinding: `Cmd+Shift+H` / `Ctrl+Shift+H` (configurable, no conflict with built-ins on either OS — verify before release).
- Opens a `vscode.window.createQuickPick`.

### 10.2 Items

Each item:
- `label`: `$(<methodIcon>) <method> <prettyLabel>`
- `description`: relative file path
- `detail`: URL (truncated to 120 chars)
- Hidden payload: `{ uri, line }`

### 10.3 Matching

- Items are pulled from `WorkspaceIndex.getAllRequests()` at quick-pick open time (no live indexing during typing).
- Filtering is the default VS Code QuickPick fuzzy match — set `matchOnDescription = true` and `matchOnDetail = true` and let VS Code handle it. No third-party fuzzy lib needed for v1.

### 10.4 Selection

- `onDidAccept` → run `httpyac-primenav.reveal`.
- Hold `Alt` while accepting (`item.alwaysShow` + custom button) → run `httpyac-primenav.send` instead. Implement via a QuickInputButton on each item rather than modifier keys for portability.

## 11. Commands and contributions (`package.json`)

```json
{
  "name": "httpyac-primenav",
  "displayName": "httpYac PrimeNav",
  "description": "Workspace-wide tree and fuzzy search for .http / .rest files using httpYac conventions.",
  "version": "0.1.0",
  "publisher": "<your-publisher>",
  "engines": { "vscode": "^1.85.0" },
  "categories": ["Other"],
  "keywords": ["http", "rest", "httpyac", "navigation", "api"],
  "main": "./dist/extension.js",
  "contributes": {
    "viewsContainers": {
      "activitybar": [
        {
          "id": "httpyacPrimeNav",
          "title": "httpYac PrimeNav",
          "icon": "images/icon.svg"
        }
      ]
    },
    "views": {
      "httpyacPrimeNav": [
        { "id": "httpyacPrimeNav.tree", "name": "Requests" }
      ]
    },
    "commands": [
      { "command": "httpyac-primenav.refresh", "title": "Refresh", "icon": "$(refresh)", "category": "httpYac PrimeNav" },
      { "command": "httpyac-primenav.search", "title": "Search Requests…", "category": "httpYac PrimeNav" },
      { "command": "httpyac-primenav.reveal", "title": "Reveal Request", "category": "httpYac PrimeNav" },
      { "command": "httpyac-primenav.send", "title": "Send Request", "icon": "$(play)", "category": "httpYac PrimeNav" }
    ],
    "menus": {
      "view/title": [
        { "command": "httpyac-primenav.refresh", "when": "view == httpyacPrimeNav.tree", "group": "navigation" }
      ],
      "view/item/context": [
        {
          "command": "httpyac-primenav.send",
          "when": "view == httpyacPrimeNav.tree && viewItem == request && httpyac-primenav.httpyacAvailable",
          "group": "inline"
        }
      ]
    },
    "keybindings": [
      { "command": "httpyac-primenav.search", "key": "ctrl+shift+h", "mac": "cmd+shift+h" }
    ],
    "configuration": {
      "title": "httpYac PrimeNav",
      "properties": {
        "httpyacPrimeNav.fileGlob": {
          "type": "string",
          "default": "**/*.{http,rest}",
          "description": "Glob used to discover request files."
        },
        "httpyacPrimeNav.excludeGlob": {
          "type": "string",
          "default": "**/node_modules/**",
          "description": "Glob excluded from discovery."
        },
        "httpyacPrimeNav.groupBySections": {
          "type": "boolean",
          "default": true,
          "description": "Group requests under `#### Section` headers."
        }
      }
    }
  }
}
```

Set `httpyac-primenav.httpyacAvailable` context key in `extension.ts` using `vscode.extensions.getExtension('anweber.vscode-httpyac')`.

## 12. Extension entry (`src/extension.ts`)

```ts
import * as vscode from 'vscode';
import { WorkspaceIndex } from './workspace/workspaceIndex';
import { RequestsTreeProvider } from './tree/treeProvider';
import { registerSearchCommand } from './search/quickPick';
import { registerRevealCommand } from './commands/revealRequest';
import { registerSendCommand } from './commands/sendRequest';

export async function activate(ctx: vscode.ExtensionContext) {
  const index = new WorkspaceIndex();
  await index.init();
  ctx.subscriptions.push(index);

  const tree = new RequestsTreeProvider(index);
  ctx.subscriptions.push(
    vscode.window.registerTreeDataProvider('httpyacPrimeNav.tree', tree),
    vscode.commands.registerCommand('httpyac-primenav.refresh', () => tree.refresh()),
    registerSearchCommand(index),
    registerRevealCommand(),
    registerSendCommand(),
  );

  // Context key for httpyac availability
  const httpyac = vscode.extensions.getExtension('anweber.vscode-httpyac');
  vscode.commands.executeCommand(
    'setContext',
    'httpyac-primenav.httpyacAvailable',
    !!httpyac,
  );
}

export function deactivate() {}
```

## 13. Send delegation (`src/commands/sendRequest.ts`)

The `httpyac` extension exposes `httpyac.send`. Calling pattern:

```ts
vscode.commands.executeCommand('httpyac.send', uri, /* options */ { line });
```

Verify the exact signature against the current httpyac version during implementation; the agent must `console.error` and show a `vscode.window.showWarningMessage` if the call throws, then no-op.

## 14. Performance

- Workspace with up to 200 files × 100 requests each should index in <500ms.
- Use streaming reads only if a file exceeds 1MB; otherwise read with `vscode.workspace.fs.readFile`.
- Parse runs in the extension host main thread — that is fine at this scale, no worker needed.
- Debounce reparses to 150ms.

## 15. Testing strategy

- **Unit (jest):** parser, workspace index. Run on every commit. Target ≥90% statement coverage on `parser/`.
- **Integration (`@vscode/test-electron`):** one smoke test that opens a fixture workspace with two `.http` files, activates the extension, asserts the tree has the expected top-level children and that `httpyac-primenav.search` populates the quick pick.
- **Manual checklist** in `CONTRIBUTING.md`:
  - Tree appears in activity bar.
  - Edits to an open `.http` file update the tree within ~200ms.
  - `Cmd+Shift+H` opens search with all requests.
  - Clicking a request reveals the right line.
  - Disabled requests are dimmed.
  - Sections group correctly.

## 16. Packaging and publishing

- Build: `npm run package` → produces `dist/extension.js` via webpack.
- Package: `vsce package` → `.vsix`.
- Publish: `vsce publish` (manual for v0.1.0).
- CI workflow runs `npm ci`, `npm run lint`, `npm test`, `npm run package` on PRs.

## 17. Milestones

| Milestone | Scope | Estimated effort |
|---|---|---|
| M1 — Parser + tests | Section 7 fully implemented and tested | 0.5 day |
| M2 — Workspace index | Section 8 implemented, watcher wired, tests passing | 0.5 day |
| M3 — Tree view | Section 9 with method icons and reveal command | 1 day |
| M4 — Fuzzy search | Section 10 quick pick + keybinding | 0.5 day |
| M5 — Send delegation + polish | Section 13, context key, disabled states, README screenshots | 0.5 day |
| M6 — CI + publish | Workflow, vsce package, README, CHANGELOG, icon | 0.5 day |

Total: ~3.5 dev-days for a publishable v0.1.0.

## 18. Out-of-scope follow-ups (do not implement now)

- Favorites / pinned requests (workspace state).
- Run history panel.
- Group by `# @group` tag (parser already captures it — UI later).
- Filter chips by method.
- "Run all in file" / "Run all in folder" commands.
- AI integration (generate assertions, explain failure) — separate extension or later milestone.

## 19. Acceptance criteria for v0.1.0

The extension is considered done when, on a fresh Cursor install with the extension loaded and a workspace containing at least two `.http` files:

1. The httpYac PrimeNav icon appears in the Activity Bar.
2. Clicking it shows a tree with all `.http`/`.rest` files in the workspace, expandable into their requests.
3. Each request shows a method-colored icon and its label, with disabled requests visually dimmed.
4. Editing a request name or adding a new `###` updates the tree within 200ms without manual refresh.
5. `Cmd/Ctrl+Shift+H` opens a quick pick with every request across the workspace, fuzzy-filterable by method, name, file path, or URL.
6. Selecting an item in tree or quick pick reveals the request at the correct line in the editor.
7. If `anweber.vscode-httpyac` is installed, a Send button appears on each request item and triggers execution via httpYac.
8. Unit test suite passes; the smoke integration test passes.

---

**Instructions for the implementing agent:**
Build sequentially M1 → M6. After each milestone, commit and run the full test suite. Do not start a milestone before all tests in the previous one are green. Do not add runtime dependencies beyond `vscode` without justification in the PR description.