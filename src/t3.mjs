import { accessSync, constants, existsSync, readdirSync, statSync } from 'node:fs';
import { delimiter, join } from 'node:path';
import { homedir } from 'node:os';
import { spawnSync } from 'node:child_process';

export const ACTIVE_THEME_ID = 't3-theme-cli-active';

export function findT3(explicit, env = process.env) {
  if (explicit) return explicit;
  if (env.T3_THEME_T3_BIN) return env.T3_THEME_T3_BIN;
  for (const dir of (env.PATH ?? '').split(delimiter).filter(Boolean)) {
    const candidate = join(dir, process.platform === 'win32' ? 't3.cmd' : 't3');
    try { accessSync(candidate, constants.X_OK); return candidate; } catch {}
  }
  const desktop = join(homedir(), '.t3', 'bin', 't3');
  try { accessSync(desktop, constants.X_OK); return desktop; } catch {}
  throw new Error('Cannot find the t3 CLI. Set T3_THEME_T3_BIN to its executable path.');
}

// One managed slot keeps a large local library below T3 Code's 32-file limit.
export function checkPublishCapacity(baseDir, incomingBytes) {
  const dir = join(baseDir, 'userdata', 'themes');
  const entries = existsSync(dir) ? readdirSync(dir).filter(name => name.endsWith('.json') && name !== `${ACTIVE_THEME_ID}.json`) : [];
  if (entries.length >= 32) throw new Error('T3 Code has reached its limit of 32 published themes. Remove unused published JSON files.');
  const total = entries.reduce((bytes, name) => bytes + statSync(join(dir, name)).size, incomingBytes);
  if (total > 192 * 1024) throw new Error('Published themes would exceed the T3 Code limit of 192 KiB.');
}

export function applyTheme(entry, { baseDir, t3Bin }) {
  if (entry.kind !== 'builtin') checkPublishCapacity(baseDir, Buffer.byteLength(entry.raw));
  const target = entry.kind === 'builtin' ? [entry.id] : [entry.file, '--id', ACTIVE_THEME_ID];
  const result = spawnSync(t3Bin, ['theme', 'set', ...target, '--base-dir', baseDir], {
    encoding: 'utf8', timeout: 30_000, maxBuffer: 1024 * 1024, shell: false,
  });
  if (result.error) throw new Error(`Cannot execute the t3 CLI: ${result.error.message}`);
  if (result.status !== 0) throw new Error((result.stderr || result.stdout || `t3 CLI exited: ${result.signal ?? result.status}`).trim());
  return result.stdout.trim();
}
