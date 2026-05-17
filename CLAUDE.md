# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A VS Code / Cursor extension that provides **navigation** for `.http` / `.rest` files following httpYac conventions: a workspace-wide tree view and a fuzzy request search. It is navigation-only — it ships no HTTP engine and renders no responses; request execution is delegated to the `anweber.vscode-httpyac` extension. `tdd.md` is the original design spec and remains the source of truth for intended behavior.

## Commands

```bash
npm install
npm test                       # jest unit tests (parser + workspace index only)
npx jest src/parser            # run a single test file
npx jest -t "ignores @name"    # run tests matching a name
npm run test:coverage          # unit tests + coverage (parser must stay >=90% statements)
npm run lint                   # eslint
npm run compile                # webpack dev build -> dist/extension.js
npm run package                # webpack production build
npm run test:integration       # compiles to out/ then runs the @vscode/test-electron smoke test
```

Press `F5` in VS Code / Cursor to launch the Extension Development Host.

## Architecture

Data flows in one direction through four stages:

1. **`src/parser/httpFileParser.ts`** — `parseHttpFile(text, uri)` turns one file's text into `Region[]` (`RequestRegion | SectionRegion`). Pure, line-based, regex-driven, no I/O, no AST. Intentionally lenient. Parsing rules are specified in `tdd.md` §7 — change the parser and the spec together.
2. **`src/workspace/workspaceIndex.ts`** — `WorkspaceIndex` discovers files via `vscode.workspace.findFiles`, parses them, caches `ParsedFile`s, and reparses (debounced 150ms per file) on `FileSystemWatcher` and `onDidChangeTextDocument` events. It is the single source of parsed data and emits `onDidChange`.
3. **`src/tree/treeProvider.ts`** — `RequestsTreeProvider` rebuilds a `NavNode` tree (folder → file → section → request) from the index on every `onDidChange`. Nested `####` sections are assembled with a level stack. Node shapes live in `src/tree/treeItems.ts`.
4. **`src/search/quickPick.ts`** — builds a QuickPick from `index.getAllRequests()`.

`src/extension.ts` wires these together in `activate()` and registers commands (`src/commands/`). `src/icons/methodIcon.ts` maps HTTP verbs to colored codicons.

### Key conventions

- **The parser must not import `vscode` at runtime.** It uses `import type * as vscode` only (elided at compile time) so it stays a pure, easily testable function.
- **Unit tests run under jest with a fake `vscode`.** `jest.config.js` maps the `vscode` module to `src/test/vscode-mock.ts`, an in-memory fake driven by its exported `__test` hooks. Only `parser/` and `workspace/` have unit tests — UI code (`tree/`, `search/`, `extension.ts`) is exercised only by the integration smoke test.
- **Two build paths:** webpack bundles `src/extension.ts` to `dist/` for shipping (and excludes all test files); `tsc` compiles everything to `out/` only for the `@vscode/test-electron` integration test.
- **Request labels:** `RequestRegion.label` is the stored label; `displayLabel()` in `src/types.ts` applies the `title`-overrides-label display rule. Use `displayLabel()` for anything user-facing.
- **No runtime dependencies** beyond `vscode` — keep it that way unless justified.

### Two intentional deviations from `tdd.md`

- The tree's "Collapse All" uses VS Code's native `showCollapseAll: true` instead of a custom command.
- `# @import` is scanned file-wide, not only inside regions, so top-of-file imports are still captured.
