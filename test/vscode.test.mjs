import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { parseJsonc } from '../src/jsonc.mjs';
import { importTheme, validateTheme } from '../src/theme.mjs';
import { compositeColor } from '../src/vscode.mjs';

function files(t) {
  const root = mkdtempSync(join(tmpdir(), 't3-vscode-import-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const write = (name, value) => { const file = join(root, name); writeFileSync(file, typeof value === 'string' ? value : JSON.stringify(value)); return file; };
  return { root, write };
}
const dark = { name: 'Example Dark', type: 'dark', colors: { 'editor.background': '#20242b', 'editor.foreground': '#f0f2f5', focusBorder: '#78a9ff' } };

test('JSONC supports BOM, comments, trailing commas, and strings containing comment syntax', () => {
  assert.deepEqual(parseJsonc('\ufeff{/* comment */"url":"https://example.com/a//b", "quote":"\\\"/*literal*/", "items":[1,2,/*end*/],// line\n}'), { url: 'https://example.com/a//b', quote: '"/*literal*/', items: [1, 2] });
  for (const text of ['{"a":1,,}', '[1,,]', '{"a":1 /* unclosed', '{"a":"unterminated}']) assert.throws(() => parseJsonc(text), /Invalid JSON|Unterminated/);
});

test('relative includes inherit colors but take the importing file name and overrides', t => {
  const f = files(t);
  f.write('base.json', { ...dark, tokenColors: [{ scope: 'keyword', settings: { foreground: '#ffcc66' } }] });
  mkdirSync(join(f.root, 'themes'));
  const file = f.write('themes/Custom-color-theme.json', '{"include":"../base.json","colors":{"editor.background":"#292929",},}');
  const imported = importTheme(file);
  assert.equal(imported.theme.name, 'Custom');
  assert.equal(imported.theme.canvas, '#292929');
  assert.equal(imported.theme.colors.text, '#f0f2f5');
  assert.equal(imported.theme.accent, '#78a9ff');
  assert.doesNotThrow(() => validateTheme(imported.theme));
});

test('circular, missing, and remote includes fail clearly', t => {
  const f = files(t);
  const a = f.write('a.json', { ...dark, include: './b.json' });
  f.write('b.json', { ...dark, include: './a.json' });
  assert.throws(() => importTheme(a), /Circular/);
  const missing = f.write('missing.json', { ...dark, include: './absent.json' });
  assert.throws(() => importTheme(missing), /ENOENT/);
  const remote = f.write('remote.json', { ...dark, include: 'https://example.com/theme.json' });
  assert.throws(() => importTheme(remote), /relative file/);
});

test('color alpha is composited onto the appropriate terminal and sidebar surfaces', t => {
  assert.equal(compositeColor('#fff8', '#000'), '#888888');
  assert.equal(compositeColor('#ffffff80', '#000000'), '#808080');
  const f = files(t);
  const file = f.write('theme.json', { ...dark, colors: { ...dark.colors, 'terminal.background': '#000000', 'terminal.selectionBackground': '#ffffff80', 'sideBar.background': '#000000', 'list.hoverBackground': '#ffffff20' } });
  const { theme } = importTheme(file);
  assert.equal(theme.colors.terminalSelection, '#808080');
  assert.equal(theme.colors.sidebarRowHover, '#202020');
});

test('light and dark appearance are read from type or inferred from canvas', t => {
  const f = files(t);
  for (const [type, background, foreground, appearance] of [['light', '#fff', '#111', 'light'], ['dark', '#111', '#fff', 'dark'], [undefined, '#fafafa', '#333', 'light'], ['hc-light', '#fff', '#000', 'light']]) {
    const file = f.write('theme.json', { name: 'Example', type, colors: { 'editor.background': background, 'editor.foreground': foreground } });
    assert.equal(importTheme(file).theme.appearance, appearance);
  }
});

test('an original syntax color supplies the accent when no UI accent is specified', t => {
  const f = files(t);
  const file = f.write('theme.json', { name: 'Syntax Accent', colors: { 'editor.background': '#222222', 'editor.foreground': '#eeeeee' }, tokenColors: [{ scope: 'keyword', settings: { foreground: '#f0e68c' } }] });
  assert.equal(importTheme(file).theme.accent, '#f0e68c');
});

test('dark themes use existing dark source surfaces instead of an incompatible light header', t => {
  const f = files(t);
  const file = f.write('theme.json', { ...dark, colors: { ...dark.colors, 'titleBar.activeBackground': '#ddddcc', 'titleBar.activeForeground': '#111111', 'activityBar.background': '#393939' } });
  const { theme } = importTheme(file);
  assert.equal(theme.colors.chrome, '#393939');
  assert.equal(theme.colors.toolbar, '#393939');
  assert.equal(theme.colors.toolbarForeground, '#f0f2f5');
});

test('large VS Code syntax definitions become a small publishable T3 palette', t => {
  const f = files(t);
  const source = JSON.stringify({ ...dark, tokenColors: Array.from({ length: 2000 }, () => ({ scope: 'string', settings: { foreground: '#abcdef' } })) });
  assert.ok(Buffer.byteLength(source) > 32768);
  const result = importTheme(f.write('large.json', source));
  assert.ok(Buffer.byteLength(result.raw) < 32768);
  assert.equal(Object.hasOwn(result.theme, 'tokenColors'), false);
});

test('settings, extension manifests, missing canvas, and invalid colors are not treated as themes', t => {
  const f = files(t);
  for (const value of [{ 'workbench.colorCustomizations': dark.colors }, { name: 'Extension', contributes: { themes: [] } }, { name: 'No canvas', colors: { focusBorder: '#abcdef' } }, { ...dark, colors: { 'editor.background': 'invalid' } }]) {
    assert.throws(() => importTheme(f.write('invalid.json', value)), /editor.background/);
  }
});

test('source theme names are checked against the T3 Code publication limit', t => {
  const f = files(t);
  assert.throws(() => importTheme(f.write('long.json', { ...dark, name: 'A'.repeat(49) })), /48 characters/);
});
