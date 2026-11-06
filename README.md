# t3code-theme-cli

A companion to [T3 Code](https://github.com/pingdotgg/t3code), built on its official CLI. Switch themes to match your mood or time of day, and add custom themes.

```sh
t3-theme                # Apply a random theme
t3-theme list           # Search, select, and apply
t3-theme set ocean      # Pick a theme by name
```

## Install

Requires macOS or Linux, Node.js 22.16+, and the T3 Code CLI (tested with v0.1.7).

```sh
git clone https://github.com/TeXmeijin/t3code-theme-cli.git
cd t3code-theme-cli
npm install -g .
```

## Add your own themes

Download a **VS Code theme JSON** from its author's repository, then add it directly:

```sh
t3-theme add ./theme.json
t3-theme set "My Theme"
t3-theme replace "My Theme" ./updated-theme.json
t3-theme remove "My Theme"
```

The theme's name comes from the JSON and is printed after import. If the JSON has no name, the filename is used. Use that name in commands—no separate ID to choose.

For T3 Code JSON, add `--format t3` to `add` or `replace`.

Run `t3-theme --help` for options and your theme folder.

[More options and theme formats](https://github.com/TeXmeijin/t3code-theme-cli/blob/main/docs/USAGE.md) · [Contributing](CONTRIBUTING.md) · [MIT License](LICENSE)
