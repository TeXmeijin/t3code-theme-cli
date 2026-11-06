# Contributing

Use Node.js 22.16 or newer. There are no dependencies to install or build steps to run.

```sh
npm test
npm run check
npm run check:package
```

## Structure

- `src/cli.mjs`: argument parsing and English terminal output.
- `src/prompt.mjs`: interactive selection, terminal cleanup, and search/navigation.
- `src/library.mjs`: user-owned JSON storage, locking, atomic writes, and selection history.
- `src/theme.mjs`: explicit import formats, saved-theme validation, and appearance filtering.
- `src/vscode.mjs`: VS Code color conversion and relative include resolution.
- `src/jsonc.mjs`: comment and trailing-comma parsing without evaluating input.
- `src/t3.mjs`: executable discovery and the official CLI adapter.
- `src/builtins.mjs`: native identifiers used internally for the verified T3 Code version.

Keep personal themes, absolute user paths, and local configuration out of the package. New installations must start with an empty custom library. Tests should register their own fixtures explicitly and preserve existing user files during upgrades.

Prefer the official `t3 theme` commands over directly editing T3 Code settings or browser storage. Keep T3-specific compatibility changes in the adapter, built-in list, and validator. When upgrading supported T3 Code versions, check the documented IDs, theme JSON contract, publication limits, and command flags, then update integration notes in the README.

CI runs isolated tests, syntax checks, and package-content checks on macOS and Linux with Node.js 22 and 24. Do not invoke the real CLI against a contributor's normal data directory in automated tests. Windows is not currently supported.

For release preparation, see [docs/RELEASING.md](https://github.com/TeXmeijin/t3code-theme-cli/blob/main/docs/RELEASING.md).
