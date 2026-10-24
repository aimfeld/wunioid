// The original's Windows UI as HTML: Form1's menu bar, the course editor (TCourseEditor), the high-score prompt
// (an InputBox), the open dialog for courses and the Info form. Captions as in the forms (TFORM1, TCOURSEEDITOR,
// TINFOFORM). The course editor's editing buttons come with the editors (Phase 4).

import type { HighScore } from '../sim/files';

export interface MenuItem {
  label: string;
  action?: () => void;
  checked?: () => boolean;
}

export interface Menu {
  label: string;
  items: MenuItem[];
  action?: () => void;
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', text = ''): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text) e.textContent = text;
  return e;
}

/** A Windows menu bar: click a title to open it, an item to run it. */
export function menuBar(menus: Menu[]): HTMLElement {
  const bar = el('nav', 'menubar');
  let open: HTMLElement | null = null;
  const close = () => {
    open?.classList.remove('open');
    open = null;
  };
  for (const m of menus) {
    const title = el('div', 'menu');
    const label = el('span', 'menu-title', m.label);
    title.append(label);
    const list = el('div', 'menu-items');
    for (const item of m.items) {
      const row = el('div', item.action ? 'menu-item' : 'menu-item disabled');
      const check = el('span', 'check');
      row.append(check, el('span', '', item.label));
      row.addEventListener('pointerenter', () => (check.textContent = item.checked?.() ? '✓' : ''));
      row.addEventListener('click', (e) => {
        e.stopPropagation();
        if (!item.action) return;
        close();
        item.action();
      });
      list.append(row);
    }
    title.append(list);
    label.addEventListener('click', (e) => {
      e.stopPropagation();
      if (m.action) {
        close();
        m.action();
        return;
      }
      const was = open === title;
      close();
      if (!was) {
        for (const [i, row] of [...list.children].entries()) row.querySelector('.check')!.textContent = m.items[i].checked?.() ? '✓' : '';
        title.classList.add('open');
        open = title;
      }
    });
    if (m.items.length === 0) list.remove();
    bar.append(title);
  }
  window.addEventListener('pointerdown', (e) => {
    if (open && !open.contains(e.target as Node)) close();
  });
  return bar;
}

/** A modal window with a title bar; `close` removes it. */
function windowFrame(title: string): { root: HTMLElement; body: HTMLElement; close: () => void } {
  const backdrop = el('div', 'backdrop');
  const win = el('div', 'window');
  const bar = el('div', 'titlebar');
  bar.append(el('span', '', title));
  win.append(bar);
  const body = el('div', 'window-body');
  win.append(body);
  backdrop.append(win);
  document.body.append(backdrop);
  return { root: win, body, close: () => backdrop.remove() };
}

function button(label: string, action?: () => void): HTMLButtonElement {
  const b = el('button', '', label);
  if (action) b.addEventListener('click', action);
  else b.disabled = true;
  return b;
}

/** InputBox(caption, prompt, default): the name for a high score; null for Cancel. */
export function inputBox(caption: string, prompt: string): Promise<string | null> {
  return new Promise((resolve) => {
    const w = windowFrame(caption);
    w.body.append(el('div', 'prompt', prompt));
    const input = el('input');
    input.maxLength = 40;
    w.body.append(input);
    const done = (v: string | null) => {
      w.close();
      resolve(v);
    };
    const row = el('div', 'buttons');
    row.append(button('OK', () => done(input.value)), button('Cancel', () => done(null)));
    w.body.append(row);
    input.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') done(input.value);
      if (e.key === 'Escape') done(null);
    });
    setTimeout(() => input.focus(), 0);
  });
}

/** A list to pick a course from (the Windows open dialog of Course ▸ Load). */
export function chooseCourse(courses: string[], current: string): Promise<string | null> {
  return new Promise((resolve) => {
    const w = windowFrame('Open');
    const list = el('select', 'list');
    list.size = Math.max(4, courses.length);
    for (const c of courses) list.append(new Option(c, c, false, c === current));
    w.body.append(list);
    const done = (v: string | null) => {
      w.close();
      resolve(v);
    };
    list.addEventListener('dblclick', () => done(list.value || null));
    list.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') done(list.value || null);
      if (e.key === 'Escape') done(null);
    });
    const row = el('div', 'buttons');
    row.append(button('Open', () => done(list.value || null)), button('Cancel', () => done(null)));
    w.body.append(row);
    setTimeout(() => list.focus(), 0);
  });
}

export function infoForm(): void {
  const w = windowFrame('Information');
  w.root.classList.add('info');
  w.body.append(el('div', 'info-title', 'Wunioid'), el('div', 'info-line', 'This game was produced by Wunibald'),
    el('div', 'info-line', 'E-Mail: wunibald@gmx.ch'), el('div', 'info-small', 'Freeware by Horse Productions 1999'));
  const row = el('div', 'buttons');
  row.append(button('OK', () => w.close()));
  w.body.append(row);
}

export interface CourseEditorModel {
  course: string;
  levels: string[];
  scores: HighScore[];
  /** The entry to select (a new high score). */
  selected: number;
  courses: string[];
  open(name: string): { levels: string[]; scores: HighScore[] };
}

/** TCourseEditor: the course's levels and high scores; Editor ▸ Close ends it. */
export function courseEditor(m: CourseEditorModel): Promise<void> {
  return new Promise((resolve) => {
    const w = windowFrame('Course Editor');
    w.root.classList.add('course-editor');
    const name = el('div', 'course-name');
    const levels = el('select', 'list');
    const scores = el('select', 'list');
    levels.size = scores.size = 10;
    const fill = (course: string, lv: string[], sc: HighScore[], selected: number) => {
      name.textContent = `Course: ${course}`;
      levels.replaceChildren(...lv.map((l) => new Option(l)));
      // list texts keep their spaces (score, three spaces, name)
      scores.replaceChildren(...sc.map((s, i) => new Option(s.text.replace(/ /g, '\u00a0'), String(i), false, i === selected)));
    };
    fill(m.course, m.levels, m.scores, m.selected);
    const close = () => {
      w.close();
      window.removeEventListener('keydown', onKey, true);
      resolve();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    window.addEventListener('keydown', onKey, true);
    w.body.append(menuBar([
      { label: 'Editor', items: [{ label: 'Close', action: close }] },
      {
        label: 'Course', items: [
          { label: 'New' },
          {
            label: 'Open...', action: () => void chooseCourse(m.courses, m.course).then((c) => {
              if (!c) return;
              m.course = c;
              const r = m.open(c);
              fill(c, r.levels, r.scores, -1);
            }),
          },
          { label: 'Save as...' },
        ],
      },
      { label: 'Info', items: [], action: infoForm },
    ]));
    const grid = el('div', 'editor-grid');
    const group = (title: string, list: HTMLElement) => {
      const g = el('fieldset');
      g.append(el('legend', '', title), list);
      return g;
    };
    const mid = el('div', 'editor-buttons');
    mid.append(button('MoveUp'), button('MoveDown'), button('Delete'), button('Add...'));
    const right = el('div', 'editor-buttons');
    right.append(button('Reset'));
    grid.append(group('Levels', levels), mid, group('HighScores', scores), right);
    w.body.append(name, grid);
  });
}
