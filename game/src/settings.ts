// The player's settings, kept in localStorage.

const KEY = 'wunioid.settings';

export interface Settings {
  /** Remastered graphics (the default) or Classic. */
  remastered: boolean;
  /** The course the menu plays. */
  course: string;
  /** The name last entered for a high score, offered for the next one. */
  name: string;
}

export function loadSettings(): Settings {
  const defaults: Settings = { remastered: true, course: 'default.cse', name: '' };
  try {
    return { ...defaults, ...JSON.parse(localStorage.getItem(KEY) ?? '{}') };
  } catch {
    return defaults;
  }
}

export function saveSettings(s: Settings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    // no storage (private window): not kept
  }
}
