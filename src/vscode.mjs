import { readFileSync, realpathSync, statSync } from 'node:fs';
import { basename, dirname, isAbsolute, resolve } from 'node:path';
import { parseJsonc } from './jsonc.mjs';

export const MAX_VSCODE_BYTES = 1024 * 1024;
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);

function readSource(file, seen = new Set(), budget = { bytes: 0 }) {
  const path = realpathSync(file);
  if (seen.has(path)) throw new Error(`${file}: Circular theme include.`);
  if (seen.size >= 16) throw new Error('Theme includes exceed the limit of 16 files.');
  const stat = statSync(path);
  if (!stat.isFile() || stat.size > MAX_VSCODE_BYTES) throw new Error('VS Code themes must be regular JSON files of at most 1 MiB.');
  const raw = readFileSync(path, 'utf8');
  budget.bytes += Buffer.byteLength(raw);
  if (Buffer.byteLength(raw) > MAX_VSCODE_BYTES || budget.bytes > 4 * MAX_VSCODE_BYTES) throw new Error('VS Code theme includes exceed the size limit.');
  const source = parseJsonc(raw, file);
  if (!object(source)) throw new Error('Theme JSON must be an object.');
  seen.add(path);
  let base = {};
  if (source.include !== undefined) {
    if (typeof source.include !== 'string' || !source.include.trim() || isAbsolute(source.include) || /^[a-z]+:/i.test(source.include)) throw new Error('A theme include must be a relative file path.');
    base = readSource(resolve(dirname(path), source.include), seen, budget).merged;
  }
  if (source.colors !== undefined && !object(source.colors)) throw new Error('VS Code colors must be an object.');
  return { source, merged: { ...base, ...source, colors: { ...(base.colors ?? {}), ...(source.colors ?? {}) }, tokenColors: [...(Array.isArray(base.tokenColors) ? base.tokenColors : []), ...(Array.isArray(source.tokenColors) ? source.tokenColors : [])] } };
}

function rgba(value) {
  if (typeof value !== 'string' || !/^#(?:[\da-f]{3,4}|[\da-f]{6}|[\da-f]{8})$/i.test(value)) return null;
  let hex = value.slice(1);
  if (hex.length < 5) hex = Array.from(hex, c => c + c).join('');
  return [...[0, 2, 4].map(i => Number.parseInt(hex.slice(i, i + 2), 16)), hex.length === 8 ? Number.parseInt(hex.slice(6), 16) / 255 : 1];
}

export function compositeColor(value, background) {
  const color = rgba(value);
  const base = rgba(background);
  if (!color || !base) return null;
  return '#' + color.slice(0, 3).map((channel, i) => Math.round(channel * color[3] + base[i] * (1 - color[3])).toString(16).padStart(2, '0')).join('');
}

function luminance(value) {
  const channels = rgba(value).slice(0, 3).map(c => c / 255).map(c => c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return channels.reduce((sum, c, i) => sum + c * [0.2126, 0.7152, 0.0722][i], 0);
}
function contrast(a, b) { const [low, high] = [luminance(a), luminance(b)].sort((x, y) => x - y); return (high + 0.05) / (low + 0.05); }

export function importVsCodeTheme(file) {
  const { source, merged } = readSource(file);
  const colors = merged.colors;
  if (source.appearance || source.version === 1 || source.canvas) throw new Error('This looks like T3 Code JSON. Use --format t3 to import it.');
  const canvas = compositeColor(colors['editor.background'], '#000000');
  if (!canvas) throw new Error('A VS Code theme needs an editor.background hex color. Use the theme JSON, not settings.json, package.json, or a VSIX installer.');
  const appearance = ['light', 'hc-light'].includes(merged.type) ? 'light' : ['dark', 'hc-black'].includes(merged.type) ? 'dark' : luminance(canvas) < 0.179 ? 'dark' : 'light';
  const name = (typeof source.name === 'string' && source.name.trim()) || (typeof source.displayName === 'string' && source.displayName.trim()) || basename(file).replace(/\.jsonc?$/i, '').replace(/[- ]color[- ]theme$/i, '');
  const pick = (keys, base = canvas, accept = () => true) => {
    for (const key of keys) { const value = compositeColor(colors[key], base); if (value && accept(value)) return value; }
    return null;
  };
  const tokenColors = merged.tokenColors.filter(object);
  const tokens = [...tokenColors.filter(token => /keyword|storage/.test(String(token.scope))), ...tokenColors.filter(token => !/comment/.test(String(token.scope)))];
  let accent = pick(['focusBorder', 'button.background', 'textLink.foreground', 'activityBarBadge.background', 'progressBar.background'], canvas, value => contrast(value, canvas) >= 3);
  for (const token of tokens) {
    if (accent) break;
    const value = compositeColor(token.settings?.foreground, canvas);
    if (value && contrast(value, canvas) >= 3) accent = value;
  }
  // Use the source foreground when no separate accent is defined.
  accent ??= pick(['editor.foreground', 'foreground'], canvas, value => contrast(value, canvas) >= 3);
  if (!accent) throw new Error('The theme has no readable accent or foreground color.');

  const sameAppearance = value => (luminance(value) < 0.179) === (appearance === 'dark');
  const overrides = {};
  const assign = (role, keys, base = canvas, accept) => {
    const value = pick(keys, base, accept);
    if (value) overrides[role] = value;
  };
  const readable = (role, keys, base = canvas) => {
    overrides[role] = pick(keys, base, value => contrast(value, base) >= 4.5) ?? (luminance(base) < 0.179 ? '#ffffff' : '#000000');
  };
  readable('text', ['editor.foreground', 'foreground']);
  assign('textMuted', ['descriptionForeground'], canvas, value => contrast(value, canvas) >= 4.5);
  assign('surface', ['editorWidget.background'], canvas, sameAppearance);
  assign('surfaceRaised', ['editorWidget.background', 'dropdown.background'], canvas, sameAppearance);
  assign('surfaceOverlay', ['menu.background', 'quickInput.background', 'dropdown.background'], canvas, sameAppearance);
  assign('chrome', ['titleBar.activeBackground', 'activityBar.background', 'sideBar.background', 'editor.background'], canvas, sameAppearance);
  assign('toolbar', ['editorGroupHeader.tabsBackground', 'titleBar.activeBackground', 'activityBar.background', 'editor.background'], canvas, sameAppearance);
  readable('toolbarForeground', ['titleBar.activeForeground', 'editor.foreground', 'foreground'], overrides.toolbar ?? canvas);
  assign('border', ['panel.border', 'editorGroup.border', 'input.border'], canvas, value => contrast(value, canvas) <= 3);
  assign('toolbarBorder', ['panel.border', 'editorGroup.border', 'input.border'], overrides.toolbar ?? canvas, value => contrast(value, overrides.toolbar ?? canvas) <= 3);
  assign('codeBackground', ['textCodeBlock.background', 'editor.background'], canvas, sameAppearance);
  readable('codeForeground', ['editor.foreground', 'foreground'], overrides.codeBackground ?? canvas);
  assign('sidebar', ['sideBar.background', 'activityBar.background', 'editor.background'], canvas, sameAppearance);
  const sidebar = overrides.sidebar ?? canvas;
  readable('sidebarForeground', ['sideBar.foreground', 'editor.foreground', 'foreground'], sidebar);
  assign('sidebarBorder', ['sideBar.border', 'input.border'], sidebar, value => contrast(value, sidebar) <= 3);
  assign('sidebarRowHover', ['list.hoverBackground', 'list.inactiveSelectionBackground'], sidebar, sameAppearance);
  assign('sidebarRowActive', ['list.inactiveSelectionBackground', 'list.hoverBackground'], sidebar, sameAppearance);
  assign('sidebarRowSelected', ['list.activeSelectionBackground', 'list.inactiveSelectionBackground'], sidebar, sameAppearance);
  assign('terminalBackground', ['terminal.background', 'panel.background', 'editor.background'], canvas, sameAppearance);
  const terminal = overrides.terminalBackground ?? canvas;
  readable('terminalForeground', ['terminal.foreground', 'editor.foreground', 'foreground'], terminal);
  assign('terminalCursor', ['terminalCursor.foreground', 'editorCursor.foreground'], terminal);
  assign('terminalSelection', ['terminal.selectionBackground', 'editor.selectionBackground'], terminal);
  assign('terminalScrollbar', ['scrollbarSlider.background'], terminal);
  assign('error', ['editorError.foreground', 'errorForeground']);
  assign('warning', ['editorWarning.foreground']);
  return { name, appearance, canvas, accent, colors: overrides };
}
