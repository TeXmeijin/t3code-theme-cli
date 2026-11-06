# Usage details

## Selection and filtering

```sh
t3-theme random --dark     # Themes supporting dark appearance
t3-theme random --light    # Themes supporting light appearance
t3-theme random --custom   # Custom themes only
t3-theme list --custom     # Select a custom theme
t3-theme list --plain      # Static list
t3-theme list --json       # JSON for scripts
```

In the picker, type to search, use arrow keys or `j`/`k` to move, Enter to apply, and `q`/Esc to cancel. `j`, `k`, and `q` act as shortcuts when the search is empty; Ctrl+j/Ctrl+k also move through filtered results.

Random selection avoids the last CLI selection when alternatives exist. The `*` marker means “last applied by CLI”; GUI changes are not tracked. Appearance filters select candidates without changing T3 Code's System/Light/Dark setting.

## Import formats and names

`add` and `replace` read **VS Code theme JSON** by default, including comments and trailing commas. The theme file needs `colors.editor.background`; a VS Code `settings.json`, extension `package.json`, or VSIX installer is not a theme file. If the theme uses `include`, keep the referenced files at their original relative paths.

The JSON's `name` is used, or `displayName` if present, otherwise the filename. Use that name in `set`, `replace`, and `remove`; quote names containing spaces. Matching is case-insensitive. A duplicate name is rejected unless you pass `add --force`. Built-in names cannot be overwritten. Replacing a theme adopts the name in the replacement JSON.

The importer maps UI and terminal colors to T3 Code and lets T3 Code generate missing roles. VS Code syntax rules, ANSI palettes, fonts, and editor-specific behavior are not imported.

To import **T3 Code JSON**, select its format explicitly:

```sh
t3-theme add ./exported-theme.json --format t3
```

Exported T3 Code themes and minimal palettes are supported:

```json
{
  "name": "My Theme",
  "appearance": "dark",
  "canvas": "#20242b",
  "accent": "#78a9ff"
}
```

An optional `colors` object overrides individual roles. Adding, replacing, and removing themes changes the saved library; use `set` or `random` to apply a theme. Existing saved T3 Code themes keep their colors and remain selectable by name.

## Paths

| Setting | Default | Flag / environment variable |
| --- | --- | --- |
| Library | `${XDG_CONFIG_HOME:-~/.config}/t3-theme-cli` | `--config-dir` / `T3_THEME_CONFIG_DIR` |
| T3 Code data | `~/.t3` | `--base-dir` / `T3CODE_HOME` |
| T3 executable | `PATH`, then `~/.t3/bin/t3` | `--t3-bin` / `T3_THEME_T3_BIN` |

Flags take precedence over environment variables. Custom JSON lives in `<library>/themes/`; `--help` prints the resolved location.

## Compatibility

- Environment themes apply to the desktop app's main local environment or a self-hosted server, including connected clients. They do not apply to app.t3.codes, additional connections, or mobile.
- Custom themes use one managed published slot, so adding themes to your library does not consume more T3 Code publication slots.
- VS Code inputs may be up to 1 MiB per file. Converted palettes and explicit T3 Code inputs must fit T3 Code’s 32 KiB limit; published themes have a total limit of 32 files and 192 KiB.
- The stock “T3 Code” palette has no selectable ID in that CLI version. The other five built-ins are supported.

Built on T3 Code's [theme CLI](https://github.com/pingdotgg/t3code/blob/v0.1.7/apps/server/src/cli/theme.ts) and [theme JSON format](https://github.com/pingdotgg/t3code/blob/v0.1.7/packages/contracts/src/server.ts). See its [appearance documentation](https://github.com/pingdotgg/t3code/blob/v0.1.7/docs/user/appearance.md#environment-themes) for the underlying features.
