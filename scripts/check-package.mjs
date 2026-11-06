import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const workspace = mkdtempSync(join(tmpdir(), 't3-theme-package-'));
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const expectedFiles = [
  'CONTRIBUTING.md', 'LICENSE', 'README.md', 'package.json',
  'src/builtins.mjs', 'src/cli.mjs', 'src/library.mjs',
  'src/prompt.mjs', 'src/t3.mjs', 'src/theme.mjs', 'src/jsonc.mjs', 'src/vscode.mjs',
].sort();

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { cwd: root, encoding: 'utf8', timeout: 30_000, ...options });
  if (result.error) throw result.error;
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return result.stdout;
}

try {
  const npmCommand = process.env.npm_execpath ? process.execPath : 'npm';
  const npmPrefix = process.env.npm_execpath ? [process.env.npm_execpath] : [];
  const [packed] = JSON.parse(run(npmCommand, [...npmPrefix, 'pack', '--ignore-scripts', '--offline', '--cache', join(workspace, 'npm-cache'), '--json', '--pack-destination', workspace]));
  assert.deepEqual(packed.files.map(file => file.path).sort(), expectedFiles, 'Package contents changed; review the allowlist before publishing.');
  assert.ok(packed.files.find(file => file.path === 'src/cli.mjs').mode & 0o111, 'CLI must be executable.');
  run('tar', ['-xzf', join(workspace, packed.filename), '-C', workspace]);
  const cli = join(workspace, 'package', 'src', 'cli.mjs');
  const config = join(workspace, 'custom-library');
  const base = join(workspace, 't3-data');
  const invoke = args => run(process.execPath, [cli, '--config-dir', config, '--base-dir', base, ...args]);
  assert.equal(invoke(['--version']).trim(), pkg.version);
  assert.ok(invoke(['--help']).includes(`Custom themes: ${join(config, 'themes')}`));
  assert.equal(existsSync(config), false, 'Help must not initialize user settings.');
  const builtins = JSON.parse(invoke(['list', '--json']));
  assert.equal(builtins.length, 5);
  assert.ok(builtins.every(theme => theme.kind === 'builtin'), 'A fresh package must not register personal themes.');
  assert.deepEqual(JSON.parse(invoke(['list', '--custom', '--json'])), []);
  assert.equal(existsSync(base), false, 'Listing must not write T3 Code settings.');
  console.log(`Package verified: ${packed.filename}, ${packed.files.length} files, clean first run.`);
} finally {
  rmSync(workspace, { recursive: true, force: true });
}
