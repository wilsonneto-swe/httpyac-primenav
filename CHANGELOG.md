# Changelog

All notable changes to **httpYac PrimeNav** are documented in this file.

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
