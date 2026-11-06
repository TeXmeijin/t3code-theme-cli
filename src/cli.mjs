#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { randomInt } from 'node:crypto';
import { Library, chooseRandom } from './library.mjs';
import { applyTheme, findT3 } from './t3.mjs';
import { BUILT_IN_THEMES, builtInTheme } from './builtins.mjs';
import { selectTheme } from './prompt.mjs';

const help = `t3-theme — Manage and shuffle T3 Code themes

Usage:
  t3-theme                         Apply a random built-in or custom theme
  t3-theme random [--dark|--light] [--custom]
                                   Avoid the last theme applied by this CLI
  t3-theme list [--custom]          Search, select, and apply a theme
  t3-theme list [--plain|--json]     Print themes without selecting
  t3-theme set <name>               Apply a built-in or custom theme
  t3-theme add <file.json> [--format t3] [--force]
  t3-theme replace <name> <file.json> [--format t3]
  t3-theme remove <name>            Remove a custom theme from the library
  t3-theme init                     Create an empty custom theme library

Options:
  --config-dir <dir>  Library directory (T3_THEME_CONFIG_DIR)
  --base-dir <dir>    T3 Code data directory (T3CODE_HOME)
  --t3-bin <path>     t3 executable (T3_THEME_T3_BIN)
  --format <format>  Import format: vscode (default) or t3
  --custom           Use only custom JSON themes with list/random
  --plain            Print a static list (also used when output is piped)
  --help, -h         Show help
  --version, -v      Show version

Imports VS Code theme JSON directly, including comments and relative includes.
Theme names come from JSON; an unnamed theme uses its filename.
Use --format t3 for exported T3 Code JSON or a minimal T3 Code palette.
--dark/--light filter candidates; they do not change T3 Code's appearance mode.
`;

const expand = path => resolve(path === '~' ? homedir() : path.startsWith('~/') ? join(homedir(), path.slice(2)) : path);

async function main() {
  const { values, positionals } = parseArgs({ allowPositionals: true, options: {
    help: { type: 'boolean', short: 'h' }, version: { type: 'boolean', short: 'v' },
    'config-dir': { type: 'string' }, 'base-dir': { type: 'string' }, 't3-bin': { type: 'string' },
    format: { type: 'string' }, force: { type: 'boolean' }, json: { type: 'boolean' },
    dark: { type: 'boolean' }, light: { type: 'boolean' },
    custom: { type: 'boolean' }, plain: { type: 'boolean' },
  } });
  const configDir = expand(values['config-dir'] || process.env.T3_THEME_CONFIG_DIR || join(process.env.XDG_CONFIG_HOME || join(homedir(), '.config'), 't3-theme-cli'));
  if (values.help) { console.log(`${help}\nPaths:\n  Custom themes: ${join(configDir, 'themes')}`); return; }
  if (values.version) { console.log(JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version); return; }
  const [command = 'random', ...args] = positionals;
  const arities = { init: 0, list: 0, random: 0, set: 1, add: 1, replace: 2, remove: 1 };
  if (!Object.hasOwn(arities, command)) throw new Error(`Unknown command: ${command}. See --help.`);
  if (args.length !== arities[command]) throw new Error(`${command} requires ${arities[command]} argument(s). See --help.`);
  const allowed = { format: ['add', 'replace'], force: ['add'], json: ['list'], dark: ['random'], light: ['random'], custom: ['list', 'random'], plain: ['list'] };
  for (const [option, commands] of Object.entries(allowed)) {
    if (values[option] !== undefined && !commands.includes(command)) throw new Error(`--${option} is only supported by ${commands.join('/')}.`);
  }
  if (values.format && !['vscode', 't3'].includes(values.format)) throw new Error('Format must be vscode or t3.');
  if (values.json && values.plain) throw new Error('Choose either --json or --plain, not both.');
  if (values.dark && values.light) throw new Error('Choose either --dark or --light, not both.');
  const baseDir = expand(values['base-dir'] || process.env.T3CODE_HOME || join(homedir(), '.t3'));
  const library = new Library(configDir);
  const applySelected = entry => {
    const previousId = library.state(baseDir)?.id;
    const previous = [...BUILT_IN_THEMES, ...library.list()].find(theme => theme.id === previousId)?.theme.name;
    applyTheme(entry, { baseDir, t3Bin: findT3(values['t3-bin']) });
    library.record(baseDir, entry.id);
    console.log(`${previous ? `${previous} → ` : 'Applied: '}${entry.theme.name}`);
  };
  if (command === 'list' && !values.json && !values.plain && process.stdin.isTTY && process.stdout.isTTY) {
    const snapshot = library.locked(() => {
      library.initialize();
      return {
        entries: [...(values.custom ? [] : BUILT_IN_THEMES), ...library.list()],
        currentId: library.state(baseDir)?.id,
      };
    });
    if (!snapshot.entries.length) { console.log('No themes found. Use add to register a JSON theme.'); return; }
    const selected = await selectTheme(snapshot);
    if (!selected) { console.log('Cancelled.'); return; }
    library.locked(() => applySelected(builtInTheme(selected) ?? library.get(selected)));
    return;
  }
  library.locked(() => {
    library.initialize();
    const listThemes = () => [...(values.custom ? [] : BUILT_IN_THEMES), ...library.list()];
    if (['replace', 'remove'].includes(command) && builtInTheme(args[0])) {
      throw new Error(`${args[0]} is a built-in theme. replace/remove only support custom JSON themes.`);
    }
    switch (command) {
      case 'init': console.log(`Library: ${library.themesDir}`); break;
      case 'list': {
        const previous = library.state(baseDir)?.id;
        const entries = listThemes().map(entry => ({ name: entry.theme.name, kind: entry.kind, appearances: entry.appearances, lastApplied: entry.id === previous }));
        if (values.json) console.log(JSON.stringify(entries, null, 2));
        else if (!entries.length) console.log('No themes found. Use add to register a JSON theme.');
        else for (const entry of entries) console.log(`${entry.lastApplied ? '*' : ' '} ${entry.name}\t${entry.appearances.join('/')}\t${entry.kind === 'builtin' ? 'built-in' : 'JSON'} ${entry.lastApplied ? '(last applied by CLI)' : ''}`.trimEnd());
        break;
      }
      case 'add': console.log(`Added: ${library.add(expand(args[0]), { format: values.format, force: values.force })}`); break;
      case 'replace': console.log(`Replaced: ${library.replace(args[0], expand(args[1]), { format: values.format })} (run set to apply)`); break;
      case 'remove': console.log(`Removed: ${library.remove(args[0])} (current appearance preserved)`); break;
      case 'set':
      case 'random': {
        const previous = library.state(baseDir)?.id;
        const entry = command === 'set' ? (builtInTheme(args[0]) ?? library.get(args[0])) : chooseRandom(listThemes(), previous, values.dark ? 'dark' : values.light ? 'light' : undefined, randomInt);
        applySelected(entry);
        break;
      }
    }
  });
}

try { await main(); } catch (error) {
  console.error(`t3-theme: ${error.message}`);
  process.exitCode = 1;
}
