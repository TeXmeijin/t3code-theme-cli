import { readFileSync, statSync } from 'node:fs';
import { importVsCodeTheme } from './vscode.mjs';

export const MAX_THEME_BYTES = 32 * 1024;
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const text = (value, max) => typeof value === 'string' && value.trim().length > 0 && value.length <= max && value === value.trim();

export function validateId(id) {
  if (typeof id !== 'string' || !/^[a-z0-9][a-z0-9-]{0,47}$/.test(id)) {
    throw new Error('IDs must start with a lowercase letter or digit and contain only lowercase letters, digits, and hyphens (48 characters maximum).');
  }
  return id;
}

export const normalizeName = name => name.normalize('NFKC').trim().toLowerCase();

export function validateTheme(value) {
  if (!object(value)) throw new Error('Theme JSON must be an object.');
  if (value.version !== undefined && value.version !== 1) throw new Error('Only theme format version 1 is supported.');
  if (!text(value.name, 48)) throw new Error('name must be a non-empty theme name of at most 48 characters.');
  if (!['light', 'dark'].includes(value.appearance)) throw new Error('appearance must be light or dark.');
  for (const key of ['canvas', 'accent']) {
    if (value[key] !== undefined && !/^#(?:[\da-f]{3}|[\da-f]{6})$/i.test(value[key])) {
      throw new Error(`${key} must be #RGB or #RRGGBB.`);
    }
  }
  const checkColors = (colors, label) => {
    if (!object(colors)) throw new Error(`${label} must be an object mapping color roles to colors.`);
    for (const [key, color] of Object.entries(colors)) {
      if (!/^[a-zA-Z][a-zA-Z0-9]{0,63}$/.test(key) || !text(color, 64)) {
        throw new Error(`${label}.${key} is not a T3 Code color role. For VS Code JSON, omit --format t3.`);
      }
    }
  };
  if (value.colors !== undefined) checkColors(value.colors, 'colors');
  if (value.variants !== undefined) {
    if (!object(value.variants) || Object.keys(value.variants).some(key => !['light', 'dark'].includes(key))) {
      throw new Error('variants may contain only light and dark.');
    }
    for (const [key, colors] of Object.entries(value.variants)) checkColors(colors, `variants.${key}`);
  }
  if (!(value.canvas && value.accent) && !(value.colors && Object.keys(value.colors).length)) {
    throw new Error('Provide both canvas and accent, or a non-empty colors object.');
  }
  return value;
}

export function readTheme(file) {
  const stat = statSync(file);
  if (!stat.isFile() || stat.size > MAX_THEME_BYTES) throw new Error('Themes must be regular JSON files of at most 32 KiB.');
  const raw = readFileSync(file, 'utf8');
  if (Buffer.byteLength(raw) > MAX_THEME_BYTES) throw new Error('Themes must be at most 32 KiB.');
  let theme;
  try { theme = JSON.parse(raw); } catch { throw new Error(`${file}: Invalid JSON.`); }
  return { raw, theme: validateTheme(theme) };
}

export function importTheme(file, format = 'vscode') {
  if (format === 't3') return readTheme(file);
  if (format !== 'vscode') throw new Error('Format must be vscode or t3.');
  const theme = validateTheme(importVsCodeTheme(file));
  const raw = JSON.stringify(theme, null, 2) + '\n';
  if (Buffer.byteLength(raw) > MAX_THEME_BYTES) throw new Error('The converted theme exceeds T3 Code\'s 32 KiB limit.');
  return { theme, raw };
}

export function appearances(theme) {
  return [...new Set([theme.appearance, ...Object.keys(theme.variants ?? {})])];
}
