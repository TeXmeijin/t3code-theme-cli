import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PassThrough } from 'node:stream';
import { selectTheme } from '../src/prompt.mjs';

const entries = [
  { id: 'ocean', theme: { name: 'Ocean' } },
  { id: 'earthsong', theme: { name: 'Earthsong' } },
  { id: 'gruvbox-material', theme: { name: 'Gruvbox Material' } },
];

function terminal() {
  const input = new PassThrough();
  input.isTTY = true;
  input.isRaw = false;
  input.setRawMode = value => { input.isRaw = value; };
  input.pause();
  const output = new PassThrough();
  output.isTTY = true;
  output.rows = 12;
  output.columns = 80;
  let screen = '';
  output.on('data', data => { screen += data; });
  return { input, output, screen: () => screen };
}

test('typing filters by display name and Enter selects the matching ID', async () => {
  const tty = terminal();
  const selection = selectTheme({ entries, currentId: 'ocean', ...tty });
  tty.input.write('earth');
  tty.input.write('\r');
  assert.equal(await selection, 'earthsong');
  assert.match(tty.screen(), /Search: earth/);
  assert.match(tty.screen(), /Ocean \*/);
  assert.equal(tty.input.isRaw, false);
  assert.equal(tty.input.isPaused(), true);
  assert.equal(tty.input.listenerCount('keypress'), 0);
  assert.equal(tty.output.listenerCount('resize'), 0);
  assert.match(tty.screen(), /\x1b\[\?25h/);
});

test('search matches theme names and backspace updates results', async () => {
  const tty = terminal();
  const selection = selectTheme({ entries, ...tty });
  tty.input.write('gruvbox materiaz');
  tty.input.write('\x7f');
  tty.input.write('l\r');
  assert.equal(await selection, 'gruvbox-material');
});

test('arrow, j/k and Ctrl+j/k navigation use the same behavior as ghostty-theme', async () => {
  for (const keys of ['\x1b[B\x1b[B\x1b[A', 'jjk', '\x0a\x0a\x0b']) {
    const tty = terminal();
    const selection = selectTheme({ entries, ...tty });
    tty.input.write(keys + '\r');
    assert.equal(await selection, 'earthsong');
  }
});

test('q, Escape and Ctrl+C cancel and restore the terminal', async () => {
  for (const key of ['q', '\x1b', '\x03']) {
    const tty = terminal();
    const selection = selectTheme({ entries, ...tty });
    tty.input.write(key);
    assert.equal(await selection, null);
    assert.equal(tty.input.isRaw, false);
    assert.equal(tty.input.isPaused(), true);
  }
});

test('no matches cannot select a stale item', async () => {
  const tty = terminal();
  const selection = selectTheme({ entries, ...tty });
  tty.input.write('not-found\r');
  assert.equal(await selection, null);
  assert.match(tty.screen(), /No matches found/);
});

test('a narrow terminal pages through results and sanitizes labels', async () => {
  const tty = terminal();
  tty.output.rows = 8;
  tty.output.columns = 24;
  const long = Array.from({ length: 8 }, (_, index) => ({ id: String(index), theme: { name: `Theme ${index}\n\x1b[31m with a long name` } }));
  const selection = selectTheme({ entries: long, ...tty });
  tty.input.write('jjjjjjj');
  tty.output.emit('resize');
  tty.input.write('\r');
  assert.equal(await selection, '7');
  assert.doesNotMatch(tty.screen(), /\x1b\[31m/);
  assert.match(tty.screen(), /8 themes/);
});

test('empty candidates do not enter raw mode and non-TTY input is rejected', async () => {
  const tty = terminal();
  assert.equal(await selectTheme({ entries: [], ...tty }), null);
  assert.equal(tty.input.isRaw, false);
  tty.input.isTTY = false;
  assert.throws(() => selectTheme({ entries, ...tty }), /requires a terminal/);
});

test('an initially idle input is paused after selection so the CLI can exit', async () => {
  const tty = terminal();
  tty.input.readableFlowing = null;
  const selection = selectTheme({ entries, ...tty });
  tty.input.write('\r');
  assert.equal(await selection, 'ocean');
  assert.equal(tty.input.isPaused(), true);
});
