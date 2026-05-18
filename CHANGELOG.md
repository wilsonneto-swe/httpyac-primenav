# Changelog

All notable changes to **httpYac PrimeNav** are documented in this file.

## [0.3.1] - 2026-05-18

### Added

- **Run file tests from the tree** — a play action on each file in **Workspace
  Requests** runs all httpYac tests in that file via VS Code's test runner (same as
  **Run Tests in Current File**). The **Current File** panel title bar also has a play
  button to run tests for the active `.http` / `.rest` file. Requires the httpYac
  extension with test controller support enabled.

## [0.3.0] - 2026-05-17

### Added

- **Dual tree views** — the Activity Bar sidebar now shows two panels:
  - **Current File** (top) — appears only when the active editor is an `.http` / `.rest`
    file; lists its sections and requests expanded by default.
  - **Workspace Requests** (bottom) — the full workspace tree, collapsed by default.
    When a request file is active the workspace tree automatically reveals and expands
    the path to that file.
- **Method badge icons** — `GET`, `POST`, `PUT`, `PATCH`, `DELETE` and other HTTP verbs
  are now rendered as coloured SVG badge labels instead of generic codicons, making the
  method immediately identifiable at a glance. The search/quick-pick uses a larger
  horizontal variant of the same badge.
- **Tree collapses on first open** — all folders, files and sections start collapsed;
  the state is then preserved per-session so manually expanded/collapsed nodes are
  remembered across refreshes.
- **Active-file reveal** — switching to an `.http` / `.rest` editor automatically
  expands the path to that file in the Workspace Requests tree. Re-parses (triggered by
  file saves) re-run the reveal so the tree stays in sync without a manual refresh.

## [0.2.1] - 2026-05-17

### Fixed

- **Tree ID collisions in large projects** — folder nodes now use their full
  relative path as the stable ID (e.g. `folder:services/auth/api` instead of
  `folder:api`), so two folders with the same name under different parents no
  longer crash the VS Code tree registry with _"element with id … is already
  registered"_. Section nodes also received a URI + line-number ID, making
  same-label sections across different files distinct.

## [0.2.0] - 2026-05-17

### Added

- **Pinned requests** — pin any request from the tree (inline $(pin) button) or from the
  fuzzy search picker (per-item pin button). Pinned requests appear in a dedicated "Pinned"
  group at the top of the activity bar tree and at the top of the search picker when the
  search box is empty.
- Pins are persisted per-workspace across restarts. Requests named with `# @name` use a
  stable key that survives line shifts; unnamed requests fall back to a line-number key.
- Stale pins (pointing to deleted or renamed requests) render with a _(missing)_ badge and
  an inline remove button.
- New setting `httpyacPrimeNav.showPinned` (default `true`) to hide the Pinned group.
- New commands: `httpyac-primenav.pin`, `httpyac-primenav.unpin`,
  `httpyac-primenav.removePin`.
- Stable `treeItem.id` on every tree node — fixes collapse state resetting on refresh.

## [0.1.0] - 2026-05-16

Initial release.

### Added

- Activity Bar tree view listing every `.http` / `.rest` file in the workspace,
  expanded into requests and `####` sections.
- Fuzzy search command with a scope toggle between the current file and the
  whole workspace. `Cmd/Ctrl+Shift+H` opens it scoped to the current file,
  `Cmd+Ctrl+H` / `Ctrl+Alt+H` opens it workspace-wide, and a title-bar button
  switches scope once open.
- httpYac metadata parsing — `# @name`, `# @title`, `# @ref`, `# @forceRef`,
  `# @disabled`, `# @import`, `# @group` and `####` section headers.
- Method-colored request icons; disabled requests are dimmed.
- Reveal command to jump to a request's line in the editor.
- Send delegation to the `anweber.vscode-httpyac` extension when installed.
