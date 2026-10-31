// `npm run dev` only: the Remastered editor's Save writes the course sources (courses/*.txt) and builds them into
// public/data (vite.config.ts → tools/save_course.py), so the edits are in the repo, ready to commit and ship. The
// player's storage keeps nothing of it.

import type { ProjectStore } from './editorProject';
import { encode } from './storage';

export const sourceStore: ProjectStore = {
  async save(s) {
    const res = await fetch('/__wunioid/save-course', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        course: s.course,
        entries: s.entries,
        levels: Object.fromEntries([...s.levels].map(([name, level]) => [name, encode(level)])),
        renamed: Object.fromEntries(s.renamed),
      }),
    });
    const r = await res.json().catch(() => null) as { ok: boolean; error?: string; problems?: string[] } | null;
    if (!r?.ok) throw new Error(r?.error ?? `the dev server answered ${res.status}`);
    return r.problems ?? [];
  },
};
