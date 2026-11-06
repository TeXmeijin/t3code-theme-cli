import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { Library, chooseRandom } from '../src/library.mjs';
import { ACTIVE_THEME_ID, checkPublishCapacity } from '../src/t3.mjs';
import { BUILT_IN_THEMES } from '../src/builtins.mjs';

const cli = fileURLToPath(new URL('../src/cli.mjs', import.meta.url));
const vscode = { name: 'Test Theme', type: 'dark', colors: { 'editor.background': '#123456', 'editor.foreground': '#ffffff', focusBorder: '#abcdef' } };
const t3 = { name: 'T3 Theme', appearance: 'dark', canvas: '#123456', accent: '#abcdef' };

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 't3-theme-test-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const config = join(root, 'config');
  const base = join(root, 'T3 data');
  const log = join(root, 'calls.jsonl');
  const bin = join(root, 'fake t3');
  writeFileSync(bin, `#!/usr/bin/env node
const { appendFileSync } = require('node:fs');
appendFileSync(process.env.TEST_LOG, JSON.stringify(process.argv.slice(2)) + '\\n');
if (process.env.TEST_FAIL) { console.error('publish failed'); process.exit(2); }
console.log('published');
`, { mode: 0o755 });
  const file = join(root, 'unrelated filename.json');
  const write = (name = vscode.name, extra = {}) => writeFileSync(file, JSON.stringify({ ...vscode, name, ...extra }));
  write();
  const run = (args = [], env = {}) => spawnSync(process.execPath, [cli, '--config-dir', config, '--base-dir', base, '--t3-bin', bin, ...args], {
    encoding: 'utf8', env: { ...process.env, TEST_LOG: log, ...env },
  });
  const ok = (args, env) => { const r = run(args, env); assert.equal(r.status, 0, r.stderr); return r.stdout; };
  return { root, config, base, log, bin, file, write, run, ok, library: new Library(config) };
}

test('help shows the effective theme directory without creating settings', t => {
  const f = fixture(t);
  assert.ok(f.ok(['--help'], { T3_THEME_CONFIG_DIR: join(f.root, 'ignored') }).includes(`Custom themes: ${join(f.config, 'themes')}`));
  assert.equal(existsSync(f.config), false);
  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url)));
  assert.equal(f.ok(['--version']).trim(), pkg.version);
});

test('help respects environment and XDG paths when no flag is supplied', t => {
  const f = fixture(t);
  for (const env of [{ T3_THEME_CONFIG_DIR: join(f.root, 'environment') }, { XDG_CONFIG_HOME: join(f.root, 'xdg') }]) {
    const r = spawnSync(process.execPath, [cli, '--help'], { encoding: 'utf8', env: { ...process.env, T3_THEME_CONFIG_DIR: '', ...env } });
    assert.equal(r.status, 0, r.stderr);
    const dir = env.T3_THEME_CONFIG_DIR ?? join(env.XDG_CONFIG_HOME, 't3-theme-cli');
    assert.ok(r.stdout.includes(join(dir, 'themes')));
    assert.equal(existsSync(dir), false);
  }
});

test('invalid commands, removed --id, and invalid formats fail before initialization', t => {
  const f = fixture(t);
  for (const args of [['unknown'], ['add', f.file, '--id', 'old'], ['add', f.file, '--format', 'invalid'], ['random', '--dark', '--light'], ['set', 'Ocean', '--format', 't3']]) assert.equal(f.run(args).status, 1);
  assert.equal(existsSync(f.config), false);
});

test('fresh initialization adds no custom themes', t => {
  const f = fixture(t);
  f.ok(['init']);
  assert.deepEqual(JSON.parse(f.ok(['list', '--custom', '--json'])), []);
  assert.deepEqual(JSON.parse(f.ok(['list', '--json'])).map(v => v.name), BUILT_IN_THEMES.map(v => v.theme.name));
  assert.equal(existsSync(f.log), false);
});

test('VS Code is the default format and the JSON name is the only public identifier', t => {
  const f = fixture(t);
  assert.match(f.ok(['add', f.file]), /Added: Test Theme/);
  const entry = f.library.get('Test Theme');
  assert.equal(entry.theme.canvas, '#123456');
  assert.equal(entry.theme.appearance, 'dark');
  assert.equal(entry.theme.name, 'Test Theme');
  const listed = JSON.parse(f.ok(['list', '--custom', '--json']));
  assert.equal(listed[0].name, 'Test Theme');
  assert.equal(Object.hasOwn(listed[0], 'id'), false);
  assert.doesNotMatch(f.ok(['list', '--plain']), /theme-[a-f0-9]{24}/);
  assert.match(f.ok(['set', 'test theme']), /^Applied: Test Theme/m);
  const args = JSON.parse(readFileSync(f.log, 'utf8').trim());
  assert.deepEqual(args, ['theme', 'set', entry.file, '--id', ACTIVE_THEME_ID, '--base-dir', f.base]);
});

test('unnamed VS Code themes use the filename', t => {
  const f = fixture(t);
  writeFileSync(f.file, JSON.stringify({ type: vscode.type, colors: vscode.colors }));
  assert.match(f.ok(['add', f.file]), /Added: unrelated filename/);
  assert.equal(f.library.get('unrelated filename').theme.name, 'unrelated filename');
});

test('duplicate names are detected case-insensitively and overwrite requires force', t => {
  const f = fixture(t);
  f.ok(['add', f.file]);
  const before = f.library.get('Test Theme').raw;
  f.write('TEST THEME', { colors: { ...vscode.colors, 'editor.background': '#222222' } });
  assert.match(f.run(['add', f.file]).stderr, /already exists/);
  assert.equal(f.library.get('Test Theme').raw, before);
  f.ok(['add', f.file, '--force']);
  assert.equal(f.library.get('test theme').theme.canvas, '#222222');
  assert.equal(readdirSync(f.library.themesDir).length, 1);
});

test('names with spaces, punctuation, and Unicode do not collide through filename slugging', t => {
  const f = fixture(t);
  for (const name of ['A B', 'A-B', '夜のテーマ / 青']) { f.write(name); f.ok(['add', f.file]); }
  assert.equal(f.library.list().length, 3);
  assert.match(f.ok(['set', '夜のテーマ / 青']), /夜のテーマ \/ 青/);
  assert.equal(f.run(['remove', '../escape']).status, 1);
  assert.equal(f.library.list().length, 3);
});

test('T3 JSON needs an explicit format and preserves exported bytes and variants', t => {
  const f = fixture(t);
  const raw = JSON.stringify({ ...t3, version: 1, colors: { text: 'oklch(0.9 0 0)' }, variants: { light: { canvas: '#ffffff' } } }, null, 2) + '\n';
  writeFileSync(f.file, raw);
  assert.match(f.run(['add', f.file]).stderr, /--format t3/);
  assert.equal(f.library.list().length, 0);
  f.ok(['add', f.file, '--format', 't3']);
  assert.equal(f.library.get('T3 Theme').raw, raw);
  assert.deepEqual(f.library.get('T3 Theme').theme.variants, { light: { canvas: '#ffffff' } });
});

test('replacement follows the new JSON name, retaining history and storage', t => {
  const f = fixture(t);
  f.ok(['add', f.file]); f.ok(['set', 'Test Theme']);
  const previous = f.library.get('Test Theme');
  f.write('Updated Theme');
  assert.match(f.ok(['replace', 'Test Theme', f.file]), /Replaced: Updated Theme/);
  assert.equal(f.library.get('Updated Theme').id, previous.id);
  assert.equal(f.library.state(f.base).id, previous.id);
  assert.equal(f.run(['set', 'Test Theme']).status, 1);
  f.ok(['set', 'Updated Theme']);
  assert.match(f.ok(['remove', 'Updated Theme']), /Removed: Updated Theme/);
  assert.equal(f.library.list().length, 0);
});

test('replacement cannot overwrite a different theme with the same name', t => {
  const f = fixture(t);
  f.ok(['add', f.file]); f.write('Other'); f.ok(['add', f.file]);
  const previous = f.library.get('Test Theme').raw;
  assert.match(f.run(['replace', 'Test Theme', f.file]).stderr, /already exists/);
  assert.equal(f.library.get('Test Theme').raw, previous);
});

test('malformed and oversized inputs do not replace saved themes', t => {
  const f = fixture(t);
  f.ok(['add', f.file]);
  const previous = f.library.get('Test Theme').raw;
  for (const raw of ['{', JSON.stringify({ name: 'Bad', colors: {} }), ' '.repeat(1024 * 1024 + 1)]) {
    writeFileSync(f.file, raw);
    assert.equal(f.run(['replace', 'Test Theme', f.file]).status, 1);
    assert.equal(f.library.get('Test Theme').raw, previous);
  }
});

test('legacy libraries and history work by display name without rewriting personal files', t => {
  const f = fixture(t);
  mkdirSync(f.library.themesDir, { recursive: true });
  const legacy = join(f.library.themesDir, 'personal-old-key.json');
  const raw = JSON.stringify({ ...t3, name: 'Personal Theme', colors: { toolbar: '#393939' } });
  writeFileSync(legacy, raw);
  writeFileSync(join(f.config, 'initialized.json'), '{"version":1}\n');
  writeFileSync(join(f.config, 'history.json'), JSON.stringify({ [f.base]: { id: 'personal-old-key' } }));
  const listed = JSON.parse(f.ok(['list', '--custom', '--json']));
  assert.equal(listed[0].name, 'Personal Theme'); assert.equal(listed[0].lastApplied, true);
  assert.match(f.ok(['set', 'Personal Theme']), /Personal Theme → Personal Theme/);
  assert.equal(readFileSync(legacy, 'utf8'), raw);
  assert.equal(f.library.state(join(f.root, 'other')), null);
  f.write('Personal Theme'); f.ok(['add', f.file, '--force']);
  assert.equal(f.library.get('Personal Theme').file, legacy);
  assert.equal(f.library.list().length, 1);
});

test('built-ins are selected by name and custom imports cannot shadow them', t => {
  const f = fixture(t);
  assert.match(f.ok(['set', 'Ocean']), /Ocean/);
  assert.deepEqual(JSON.parse(readFileSync(f.log, 'utf8').trim()), ['theme', 'set', 'ocean', '--base-dir', f.base]);
  for (const name of ['Ocean', 'ocean', 'T3 Chat']) { f.write(name); assert.match(f.run(['add', f.file]).stderr, /built-in theme name/); }
  assert.match(f.run(['remove', 'Ocean']).stderr, /built-in theme/);
  assert.match(f.run(['replace', 'Ocean', f.file]).stderr, /built-in theme/);
});

test('random avoids the previous theme and prints names, not storage keys', t => {
  const f = fixture(t);
  f.ok(['add', f.file]); f.write('Other'); f.ok(['add', f.file]); f.ok(['set', 'Other']);
  assert.match(f.ok(['random', '--custom']), /Other → Test Theme/);
  assert.match(f.ok(['--custom']), /Test Theme → Other/);
});

test('failed apply preserves previous history and releases the lock', t => {
  const f = fixture(t);
  f.ok(['add', f.file]); f.ok(['set', 'Test Theme']);
  const before = f.library.state(f.base);
  const failure = f.run(['set', 'Ocean'], { TEST_FAIL: '1' });
  assert.equal(failure.status, 1); assert.match(failure.stderr, /publish failed/);
  assert.deepEqual(f.library.state(f.base), before);
  assert.equal(existsSync(join(f.config, '.lock')), false);
});

test('another library writer is rejected without changing the saved file', t => {
  const f = fixture(t);
  f.ok(['add', f.file]); const before = f.library.get('Test Theme').raw;
  mkdirSync(join(f.config, '.lock'));
  assert.match(f.run(['remove', 'Test Theme']).stderr, /library lock/);
  assert.equal(f.library.get('Test Theme').raw, before);
});

test('publication limits protect custom themes without blocking built-in selection', t => {
  const f = fixture(t);
  f.ok(['add', f.file]);
  const dir = join(f.base, 'userdata', 'themes'); mkdirSync(dir, { recursive: true });
  for (let index = 0; index < 31; index++) writeFileSync(join(dir, `theme-${index}.json`), '{}');
  writeFileSync(join(dir, `${ACTIVE_THEME_ID}.json`), '{}');
  assert.doesNotThrow(() => checkPublishCapacity(f.base, 100));
  writeFileSync(join(dir, 'extra.json'), '{}');
  assert.equal(f.run(['set', 'Test Theme']).status, 1);
  assert.equal(existsSync(f.log), false);
  f.ok(['set', 'Iris']);
});

test('appearance filtering handles dual-mode and empty candidates', () => {
  const entries = [{ id: 'dark', appearances: ['dark'] }, { id: 'both', appearances: ['dark', 'light'] }];
  assert.equal(chooseRandom(entries, 'both', 'dark', () => 0).id, 'dark');
  assert.equal(chooseRandom(entries, null, 'light', () => 0).id, 'both');
  assert.throws(() => chooseRandom([], null, undefined, () => 0), /No matching themes/);
});
