/** JSON with comments and trailing commas, as used by VS Code theme files. */
export function parseJsonc(source, label = 'Theme file') {
  source = source.replace(/^\uFEFF/, '');
  let clean = '';
  let quoted = false;
  let escaped = false;
  for (let i = 0; i < source.length; i++) {
    const c = source[i];
    if (quoted) {
      clean += c;
      if (escaped) escaped = false;
      else if (c === '\\') escaped = true;
      else if (c === '"') quoted = false;
    } else if (c === '"') { quoted = true; clean += c; }
    else if (c === '/' && source[i + 1] === '/') {
      while (i < source.length && source[i] !== '\n') { clean += ' '; i++; }
      if (i < source.length) clean += '\n';
    } else if (c === '/' && source[i + 1] === '*') {
      const end = source.indexOf('*/', i + 2);
      if (end < 0) throw new Error(`${label}: Unterminated JSON comment.`);
      clean += source.slice(i, end + 2).replace(/[^\r\n]/g, ' ');
      i = end + 1;
    } else clean += c;
  }
  let json = '';
  quoted = false;
  escaped = false;
  for (let i = 0; i < clean.length; i++) {
    const c = clean[i];
    if (quoted) {
      json += c;
      if (escaped) escaped = false;
      else if (c === '\\') escaped = true;
      else if (c === '"') quoted = false;
    } else if (c === '"') { quoted = true; json += c; }
    else if (c === ',') {
      let next = i + 1;
      while (/\s/.test(clean[next] ?? '') && next < clean.length) next++;
      json += clean[next] === '}' || clean[next] === ']' ? ' ' : c;
    } else json += c;
  }
  try { return JSON.parse(json); }
  catch { throw new Error(`${label}: Invalid JSON.`); }
}
