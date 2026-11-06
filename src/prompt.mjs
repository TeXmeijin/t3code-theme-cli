import { emitKeypressEvents } from 'node:readline';

const safeLabel = value => value.replace(/[\x00-\x1f\x7f-\x9f]/g, '');
const clip = (value, columns) => {
  let width = 0;
  let result = '';
  for (const character of safeLabel(value)) {
    const point = character.codePointAt(0);
    const size = point >= 0x1100 && (point <= 0x115f || point >= 0x2e80) ? 2 : 1;
    if (width + size > columns - 1) return result + '…';
    result += character;
    width += size;
  }
  return result;
};

/** Searchable selector. The caller reacquires its library lock after selection. */
export function selectTheme({ entries, currentId, input = process.stdin, output = process.stdout }) {
  if (!input.isTTY || !output.isTTY) throw new Error('Interactive selection requires a terminal. Use list --plain or list --json.');
  if (!entries.length) return Promise.resolve(null);
  return new Promise((resolve, reject) => {
    const wasRaw = input.isRaw ?? false;
    const wasFlowing = input.readableFlowing;
    let query = '';
    let cursor = 0;
    let renderedLines = 0;
    let finished = false;
    const matches = () => entries.filter(entry => entry.theme.name.toLowerCase().includes(query.toLowerCase()));
    const render = () => {
      const filtered = matches();
      cursor = Math.max(0, Math.min(cursor, filtered.length - 1));
      if (renderedLines) output.write(`\x1b[${renderedLines}A\r\x1b[0J`);
      const columns = Math.max(12, output.columns ?? 80);
      const pageSize = Math.max(1, (output.rows ?? 24) - 6);
      const start = Math.max(0, Math.min(cursor - Math.floor(pageSize / 2), filtered.length - pageSize));
      const visible = filtered.slice(start, start + pageSize);
      const lines = [
        'Themes:',
        query ? `  Search: ${query}` : '  Type to search, ↑↓/jk/Ctrl+jk to move, Enter to select, q/Esc to cancel',
      ];
      if (!visible.length) lines.push('  No matches found.');
      visible.forEach((entry, index) => {
        const selected = index + start === cursor;
        const marker = entry.id === currentId ? ' *' : '';
        const label = clip(`${selected ? '❯' : ' '} ${entry.theme.name}${marker}`, columns - 1);
        lines.push(selected && !process.env.NO_COLOR ? `\x1b[44;37m${label}\x1b[0m` : label);
      });
      lines.push(`  ${filtered.length} themes${filtered.length > pageSize ? ` · ${start + 1}-${start + visible.length}` : ''}`);
      output.write(lines.map(line => line.includes('\x1b') ? line : clip(line, columns - 1)).join('\n') + '\n');
      renderedLines = lines.length;
    };
    const finish = (value, error) => {
      if (finished) return;
      finished = true;
      input.removeListener('keypress', onKeypress);
      input.removeListener('error', onError);
      input.removeListener('end', onEnd);
      output.removeListener('resize', onResize);
      input.setRawMode(wasRaw);
      if (wasFlowing !== true) input.pause();
      output.write('\x1b[?25h\n');
      if (error) reject(error); else resolve(value);
    };
    const onError = error => finish(null, error);
    const onEnd = () => finish(null);
    const onResize = () => { try { render(); } catch (error) { finish(null, error); } };
    const onKeypress = (text, key = {}) => {
      try {
        if ((key.ctrl && key.name === 'c') || key.name === 'escape' || (text === 'q' && !query)) return finish(null);
        if (key.name === 'return') return finish(matches()[cursor]?.id ?? null);
        if (key.name === 'up' || (key.ctrl && key.name === 'k') || (text === 'k' && !query)) cursor--;
        else if (key.name === 'down' || key.sequence === '\n' || (key.ctrl && key.name === 'j') || (text === 'j' && !query)) cursor++;
        else if (key.name === 'backspace') { query = Array.from(query).slice(0, -1).join(''); cursor = 0; }
        else if (text && !key.ctrl && !key.meta && !/[\x00-\x1f\x7f]/.test(text)) { query += text; cursor = 0; }
        else return;
        render();
      } catch (error) { finish(null, error); }
    };
    emitKeypressEvents(input);
    input.on('keypress', onKeypress);
    input.once('error', onError);
    input.once('end', onEnd);
    output.on('resize', onResize);
    try {
      input.setRawMode(true);
      input.resume();
      output.write('\x1b[?25l');
      render();
    } catch (error) { finish(null, error); }
  });
}
