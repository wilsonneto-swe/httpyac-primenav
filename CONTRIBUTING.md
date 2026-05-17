# Contributing

## Setup

```bash
npm install
```

## Build & test

```bash
npm run compile            # webpack build → dist/extension.js
npm run watch              # webpack in watch mode
npm test                   # jest unit tests (parser + workspace index)
npm run test:coverage      # unit tests with coverage
npm run lint               # eslint
npm run test:integration   # @vscode/test-electron smoke test
```

Build the milestones sequentially (M1 → M6). After each milestone, commit and
run the full test suite. Do not start a milestone before the previous one is
green. Do not add runtime dependencies beyond `vscode` without justifying it in
the PR description.

## Manual QA checklist

Run these against a workspace containing at least two `.http` files before
publishing:

- [ ] The httpYac PrimeNav icon appears in the Activity Bar.
- [ ] The tree lists every `.http` / `.rest` file, expandable into requests.
- [ ] Edits to an open `.http` file update the tree within ~200ms.
- [ ] `Cmd/Ctrl+Shift+H` opens search with all requests.
- [ ] Clicking a request reveals the correct line.
- [ ] Disabled requests are dimmed and marked `(disabled)`.
- [ ] `####` sections group their requests correctly.
- [ ] With httpYac installed, the ▶ Send action runs the request.
