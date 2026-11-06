import { normalizeName } from './theme.mjs';

// Native identifiers are internal; users select the display name.
export const BUILT_IN_THEMES = [
  { id: 't3-chat', name: 'T3 Chat' },
  { id: 'grove', name: 'Grove' },
  { id: 'ocean', name: 'Ocean' },
  { id: 'ember', name: 'Ember' },
  { id: 'iris', name: 'Iris' },
].map(({ id, name }) => ({ id, kind: 'builtin', theme: { name }, appearances: ['light', 'dark'] }));

export function builtInTheme(name) { return BUILT_IN_THEMES.find(theme => theme.id === name || normalizeName(theme.theme.name) === normalizeName(name)); }
