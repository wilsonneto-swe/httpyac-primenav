# Changelog

All notable changes to **httpYac PrimeNav** are documented in this file.

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
