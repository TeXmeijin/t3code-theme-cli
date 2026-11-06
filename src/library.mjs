import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, unlinkSync, writeFileSync, rmdirSync } from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { appearances, importTheme, normalizeName, readTheme, validateId } from './theme.mjs';
import { builtInTheme } from './builtins.mjs';

export function atomicWrite(file, raw) {
  const temp = `${file}.${randomUUID()}.tmp`;
  try {
    writeFileSync(temp, raw, { flag: 'wx', mode: 0o600 });
    renameSync(temp, file);
  } finally {
    if (existsSync(temp)) unlinkSync(temp);
  }
}

export class Library {
  constructor(dir) { this.dir = dir; this.themesDir = join(dir, 'themes'); }
  locked(run) {
    mkdirSync(this.dir, { recursive: true });
    const lock = join(this.dir, '.lock');
    try { mkdirSync(lock); } catch (error) {
      if (error.code !== 'EEXIST') throw error;
      throw new Error(`Another t3-theme process holds the library lock. If none is running, remove ${lock} with rmdir.`);
    }
    try { return run(); } finally { rmdirSync(lock); }
  }
  initialize() {
    mkdirSync(this.themesDir, { recursive: true });
  }
  path(id) { return join(this.themesDir, `${validateId(id)}.json`); }
  load(id) {
    const file = this.path(id);
    if (!existsSync(file)) throw new Error('The saved theme no longer exists.');
    return { id, file, kind: 'custom', ...readTheme(file) };
  }
  list() {
    return readdirSync(this.themesDir).filter(file => file.endsWith('.json')).sort().map(file => {
      const entry = this.load(file.slice(0, -5));
      return { ...entry, appearances: appearances(entry.theme) };
    });
  }
  get(name) {
    const entries = this.list();
    const matches = entries.filter(entry => normalizeName(entry.theme.name) === normalizeName(name));
    if (matches.length > 1) throw new Error(`More than one saved theme is named "${name}". Rename one in its saved JSON file.`);
    // Preserve older scripts and picker selections without showing storage keys.
    const entry = matches[0] ?? entries.find(entry => entry.id === name);
    if (!entry) throw new Error(`Unknown custom theme: ${name}`);
    return entry;
  }
  checkName(name, except) {
    if (builtInTheme(name)) throw new Error(`"${name}" is already a built-in theme name. Choose a different name in your JSON.`);
    const matches = this.list().filter(entry => entry.id !== except && normalizeName(entry.theme.name) === normalizeName(name));
    if (matches.length > 1) throw new Error(`More than one saved theme is named "${name}". Rename one in its saved JSON file.`);
    return matches[0];
  }
  add(file, { format = 'vscode', force = false } = {}) {
    const entry = importTheme(file, format);
    const existing = this.checkName(entry.theme.name);
    if (existing && !force) throw new Error(`"${entry.theme.name}" already exists. Use replace or add --force to overwrite it.`);
    const key = existing?.id ?? `theme-${createHash('sha256').update(normalizeName(entry.theme.name)).digest('hex').slice(0, 24)}`;
    const destination = this.path(key);
    if (!existing && existsSync(destination)) throw new Error('A saved theme occupies the generated storage path; no files were changed.');
    atomicWrite(destination, entry.raw);
    return entry.theme.name;
  }
  replace(name, file, { format = 'vscode' } = {}) {
    const previous = this.get(name);
    const entry = importTheme(file, format);
    if (this.checkName(entry.theme.name, previous.id)) throw new Error(`A saved theme named "${entry.theme.name}" already exists.`);
    atomicWrite(previous.file, entry.raw);
    return entry.theme.name;
  }
  remove(name) { const entry = this.get(name); unlinkSync(entry.file); return entry.theme.name; }
  state(baseDir) {
    const file = join(this.dir, 'history.json');
    if (!existsSync(file)) return null;
    const value = JSON.parse(readFileSync(file, 'utf8'));
    return value[baseDir] ?? null;
  }
  record(baseDir, id) {
    const file = join(this.dir, 'history.json');
    const value = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : {};
    value[baseDir] = { id, appliedAt: new Date().toISOString() };
    atomicWrite(file, JSON.stringify(value, null, 2) + '\n');
  }
}

export function chooseRandom(entries, previous, appearance, randomInt) {
  let pool = entries.filter(entry => !appearance || entry.appearances.includes(appearance));
  if (!pool.length) throw new Error('No matching themes. Use add to register a JSON theme.');
  const alternatives = pool.filter(entry => entry.id !== previous);
  if (alternatives.length) pool = alternatives;
  return pool[randomInt(pool.length)];
}
