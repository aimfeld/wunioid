// The original's Windows UI as HTML: Form1's menu bar, the course editor (TCourseEditor), the high-score prompt
// (an InputBox), the open and save dialogs (with the remake's Import and Download), message boxes and the Info
// form. Captions as in the forms (TFORM1, TCOURSEEDITOR, TINFOFORM).

import { ADD_ONE_LEVEL, type World } from '../sim/world';

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
export function inputBox(caption: string, prompt: string, value = ''): Promise<string | null> {
  return new Promise((resolve) => {
    const w = windowFrame(caption);
    w.body.append(el('div', 'prompt', prompt));
    const input = el('input');
    input.maxLength = 40;
    input.value = value;
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
    setTimeout(() => input.select(), 0);
  });
}

/** MessageDlg / MessageBox: `buttons` labels, resolves with the one clicked (Escape: the last). */
export function messageBox(caption: string, text: string, buttons = ['OK']): Promise<string> {
  return new Promise((resolve) => {
    const w = windowFrame(caption);
    w.body.append(el('div', 'prompt message', text));
    const done = (v: string) => {
      w.close();
      window.removeEventListener('keydown', onKey, true);
      resolve(v);
    };
    const onKey = (e: KeyboardEvent) => {
      e.stopPropagation();
      if (e.key === 'Escape') done(buttons[buttons.length - 1]);
    };
    window.addEventListener('keydown', onKey, true);
    const row = el('div', 'buttons center');
    for (const b of buttons) row.append(button(b, () => done(b)));
    w.body.append(row);
    setTimeout(() => (row.firstChild as HTMLButtonElement).focus(), 0);
  });
}

export interface FileDialogOptions {
  /** The dialog's Title, else Windows' 'Open' / 'Save As'. */
  title?: string;
  save?: boolean;
  /** The files there, by name (asked again after an import). */
  names: () => string[];
  /** The Filter's description, e.g. 'Level Files (*.lev)'. */
  filter: string;
  /** DefaultExt, added to a name typed without it. */
  ext: string;
  value?: string;
  /** The remake's Import… button: files from the player's disk; resolves with the names added and any problems. */
  import?: (files: File[]) => Promise<{ names: string[]; errors: string[] }>;
  /** The remake's Download button: the selected file to the player's disk. */
  download?: (name: string) => void;
}

/**
 * TOpenDialog / TSaveDialog over the player's files: resolves with the file name (with DefaultExt), or null.
 * Open takes only a file that is there; Save As asks 'OK to overwrite' for one that is (Save1Click 0x41b824,
 * SaveCourseAs 0x41c318).
 */
export function fileDialog(o: FileDialogOptions): Promise<string | null> {
  return new Promise((resolve) => {
    const w = windowFrame(o.title ?? (o.save ? 'Save As' : 'Open'));
    w.root.classList.add('file-dialog');
    const list = el('select', 'list');
    list.size = 10;
    const nameRow = el('label', 'field');
    const input = el('input');
    input.maxLength = 50; // a course keeps a string[50] per level
    input.value = o.value ?? '';
    nameRow.append(el('span', '', 'File name:'), input);
    const typeRow = el('div', 'field');
    typeRow.append(el('span', '', 'Files of type:'), el('span', 'filter', o.filter));
    const withExt = (n: string) => (/\.[^.]*$/.test(n) ? n : `${n}.${o.ext}`);
    const fill = (select?: string) => {
      list.replaceChildren(...o.names().map((n) => new Option(n, n, false, n === select)));
    };
    fill(input.value);
    let busy = false;
    const done = async (v: string | null) => {
      if (busy) return;
      if (v !== null) {
        v = withExt(v.trim().replace(/[\\/:*?"<>|]/g, ''));
        const exists = o.names().includes(v);
        if (v === '.' + o.ext || (!o.save && !exists)) return;
        if (o.save && exists) {
          busy = true;
          const answer = await messageBox('Confirm', `OK to overwrite ${v}`, ['Yes', 'No']);
          busy = false;
          if (answer !== 'Yes') return;
        }
      }
      w.close();
      window.removeEventListener('keydown', onKey, true);
      resolve(v);
    };
    const onKey = (e: KeyboardEvent) => {
      if (busy) return;
      e.stopPropagation();
      if (e.key === 'Escape') void done(null);
      if (e.key === 'Enter') void done(input.value);
    };
    window.addEventListener('keydown', onKey, true);
    list.addEventListener('change', () => (input.value = list.value));
    list.addEventListener('dblclick', () => void done(list.value || null));
    const row = el('div', 'buttons');
    if (o.import) {
      const picker = el('input');
      picker.type = 'file';
      picker.multiple = true;
      picker.accept = `.${o.ext}`;
      picker.hidden = true;
      picker.addEventListener('change', async () => {
        const r = await o.import!([...(picker.files ?? [])]);
        picker.value = '';
        fill(r.names[0]);
        if (r.names[0]) input.value = r.names[0];
        if (r.errors.length) await messageBox('Error', r.errors.join('\n'));
      });
      row.append(picker, button('Import...', () => picker.click()));
    }
    if (o.download) row.append(button('Download', () => list.value && o.download!(list.value)));
    row.append(el('span', 'spacer'), button(o.save ? 'Save' : 'Open', () => void done(input.value)),
      button('Cancel', () => void done(null)));
    w.body.append(list, nameRow, typeRow, row);
    setTimeout(() => input.focus(), 0);
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

export interface CourseEditorHost {
  /** The course: its level list is the one being played (CourseListBox). */
  world: World;
  /** The high score to select (a new one), or −1. */
  selected: number;
  /** LevelAddDialog: a level file. */
  chooseLevel(): Promise<string | null>;
  /** CourseOpenDialog / CourseSaveDialog: a course file. */
  chooseCourse(save: boolean): Promise<string | null>;
  /** LoadCourse. */
  open(name: string): void;
  /** SaveCourseAs: the course written under `name`. */
  save(name: string): void;
}

/** TCourseEditor: the course's levels and high scores, edited in place; Editor ▸ Close (or Escape) ends it. */
export function courseEditor(h: CourseEditorHost): Promise<void> {
  return new Promise((resolve) => {
    const w = windowFrame('Course Editor');
    w.root.classList.add('course-editor');
    const world = h.world;
    const name = el('div', 'course-name');
    const levels = el('select', 'list');
    const scores = el('select', 'list');
    levels.size = scores.size = 10;
    const fill = (level = levels.selectedIndex, score = -1) => {
      name.textContent = `Course: ${world.course.name}`;
      levels.replaceChildren(...world.course.levels.map((l, i) => new Option(l, String(i), false, i === level)));
      // list texts keep their spaces (score, three spaces, name)
      scores.replaceChildren(...world.highScores.map((s, i) => new Option(s.text.replace(/ /g, '\u00a0'), String(i), false, i === score)));
    };
    fill(-1, h.selected);
    let inner = false; // a dialog of the course editor is open
    const run = async (f: () => Promise<void> | void) => {
      if (inner) return;
      inner = true;
      try {
        await f();
      } finally {
        inner = false;
      }
    };
    const close = () => {
      if (inner) return;
      w.close();
      window.removeEventListener('keydown', onKey, true);
      resolve();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !inner) close();
    };
    window.addEventListener('keydown', onKey, true);
    // HighScoreListBoxClick (0x41d1fc): the level the score reached
    scores.addEventListener('change', () => {
      const s = world.highScores[scores.selectedIndex];
      if (s) levels.selectedIndex = s.level < world.course.levels.length ? s.level : -1;
    });
    const move = (d: -1 | 1) => fill(world.courseMove(levels.selectedIndex, d));
    w.body.append(menuBar([
      { label: 'Editor', items: [{ label: 'Close', action: close }] },
      {
        label: 'Course', items: [
          { label: 'New', action: () => void run(() => {
            world.courseNew();
            fill(-1);
          }) },
          { label: 'Open...', action: () => void run(async () => {
            const c = await h.chooseCourse(false);
            if (!c) return;
            h.open(c);
            fill(-1);
          }) },
          { label: 'Save as...', action: () => void run(async () => {
            if (world.course.levels.length === 0) {
              await messageBox('Error', ADD_ONE_LEVEL);
              return;
            }
            const c = await h.chooseCourse(true);
            if (!c) return;
            h.save(c);
            fill();
          }) },
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
    mid.append(button('MoveUp', () => move(-1)), button('MoveDown', () => move(1)),
      button('Delete', () => void run(async () => {
        const err = world.courseDelete(levels.selectedIndex);
        if (err) await messageBox('Error', err);
        else fill(-1);
      })),
      button('Add...', () => void run(async () => {
        const l = await h.chooseLevel();
        if (!l) return;
        world.courseAdd(l);
        fill();
      })));
    const right = el('div', 'editor-buttons');
    right.append(button('Reset', () => {
      world.clearHighScores();
      fill();
    }));
    grid.append(group('Levels', levels), mid, group('HighScores', scores), right);
    w.body.append(name, grid);
  });
}
