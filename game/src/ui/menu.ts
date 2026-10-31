// The Remastered menus (the remake; Classic keeps the original's menu bar and dialogs): a title screen to start a
// course, choose one and see its high scores, switch the graphics, set the music and go fullscreen; the pause menu
// (Esc, ☰ on touch); the high-score name entry with the table after it; and the editor's menu and a file list to
// open, save, add, import and download levels and courses (the editor itself: ui/editorPanel.ts). HTML over the game,
// in the HUD's look (Comic Neue, the banners' gold, the stones' glossy colours). Mouse, touch, keys (↑ ↓ move,
// ← → change, Enter / Space choose, Esc back) and gamepad (main.ts calls nav).

import { VOLUME_NAMES, VOLUMES } from '../audio/music';
import type { HighScore } from '../sim/files';

export interface CourseInfo {
  file: string; // e.g. default.cse
  levels: number;
  scores: HighScore[];
}

export interface MenuHost {
  courses(): CourseInfo[];
  course(): string;
  setCourse(file: string): void;
  play(): void;
  remastered(): boolean;
  setRemastered(on: boolean): void;
  /** The music volume (an index into audio/music.ts VOLUMES, 0 = off); absent without music. */
  music?: () => number;
  setMusic(v: number): void;
  fullscreen?: () => void;
  isFullscreen(): boolean;
  /** Close the pause menu and go on. */
  resume(): void;
  editor: EditorHost;
}

/** The editor (main.ts): a course and its levels, edited together (editorProject.ts). */
export interface EditorHost {
  /** The editor, on the course being edited (the first time: the course chosen for Play). */
  open(): void;
  /** A test game, or a course game started from the editor: it can go back to the editor. */
  canReturn(): boolean;
  /** The course being edited (null: a new one, never saved), and whether it has unsaved changes. */
  courseName(): string | null;
  dirty(): boolean;
  newCourse(): void;
  openCourse(name: string): void;
  /** The problems found; throws if not saved. */
  saveCourseAs(name: string): Promise<string[]>;
  levels(): string[];
  courses(): string[];
  importFiles(files: File[]): Promise<{ names: string[]; errors: string[] }>;
  download(name: string): void;
  /** The level being edited, or the course's level list, as a file (as it is now, saved or not). */
  downloadLevel(): void;
  downloadCourse(): void;
  resetHighScores(): void;
  /** A level file's picture, for the file list. */
  thumbnail?(name: string): HTMLCanvasElement | null;
}

/** The file screen: a level or course list to open or save to. */
interface FilesScreen {
  title: string;
  save: boolean;
  ext: 'lev' | 'cse';
  value: string;
  done(name: string): void;
  /** Back without a choice. */
  cancel?: () => void;
}

export const courseTitle = (file: string) => {
  const n = file.replace(/\.cse$/i, '');
  return n.charAt(0).toUpperCase() + n.slice(1);
};

/** After a save: what was done, and the problems found (a level that can't be won). */
export const savedText = (done: string, problems: string[]) => problems.length ? `${done}, but: ${problems.join(' ')}` : done;
/** A save that failed. */
export const notSaved = (e: unknown) => `Not saved: ${e instanceof Error ? e.message : e}`;

/** remaster/title-wave.webp: its frames (stacked), one frame's size in px, and the loop's length in seconds, the
 *  banners' wave: 8 frames at 0.4 frames per 22 ms tick (remasteredView.ts, ANIM_PER_TICK). */
const TITLE_WAVE = { frames: 24, w: 1008, h: 186, loop: 0.44 };

const CSS = `
.wm-list { display: flex; flex-direction: column; gap: 4px; max-height: min(42vh, 360px); overflow-y: auto; padding: 4px;
  background: rgba(0,0,0,.25); border-radius: 12px; }
.wm-item { font: inherit; font-size: 17px; color: #e8eaff; text-align: left; padding: 6px 12px; border: 0; border-radius: 8px;
  background: transparent; cursor: pointer; display: flex; gap: 10px; align-items: center; outline: none; flex: none; }
.wm-item .n { color: #9aa2e6; min-width: 1.6em; text-align: right; }
.wm-item .x { margin-left: auto; color: #9aa2e6; font-size: 14px; padding: 0 4px; }
.wm-item .x:hover { color: #ffd24a; }
.wm-item canvas { flex: none; border-radius: 3px; background: #000; }
.wm-item:hover, .wm-item:focus-visible { background: rgba(255,255,255,.08); }
.wm-item.sel { background: linear-gradient(#5a62d0, #363c9c); color: #fff; }
.wm-row.small .wm-btn { font-size: 16px; padding: 8px 6px; }
.wm-msg { text-align: center; font-size: 15px; color: #ff9a80; min-height: 1.2em; }
.wm-msg.ok { color: #9ae68a; }
@font-face { font-family: 'Comic Neue'; font-weight: bold; src: url(fonts/ComicNeue-Bold.ttf); }
.wmenu { position: fixed; inset: 0; z-index: 30; display: flex; align-items: center; justify-content: center;
  font-family: 'Comic Neue', 'Comic Sans MS', cursive; font-weight: bold; color: #e8eaff;
  background: radial-gradient(ellipse at 50% 30%, rgba(38,44,110,.82), rgba(6,7,24,.94));
  -webkit-backdrop-filter: blur(5px); backdrop-filter: blur(5px); touch-action: manipulation; overflow-y: auto; }
.wmenu[hidden] { display: none; }
.wm-box { width: min(440px, calc(100vw - 32px)); padding: 16px 0 24px; display: flex; flex-direction: column;
  align-items: stretch; gap: 10px; margin: auto; }
.wm-logo { display: block; width: min(330px, 78vw); aspect-ratio: ${TITLE_WAVE.w} / ${TITLE_WAVE.h}; margin: 6px auto 8px;
  overflow: hidden; user-select: none; pointer-events: none; filter: drop-shadow(0 6px 8px rgba(0,0,0,.65)); }
.wm-logo img { display: block; width: 100%;
  animation: wm-wave ${TITLE_WAVE.loop}s steps(${TITLE_WAVE.frames}) infinite; }
@keyframes wm-wave { to { transform: translateY(-100%); } }
@media (prefers-reduced-motion: reduce) { .wm-logo img { animation: none; } }
.wm-sub { text-align: center; letter-spacing: .45em; font-size: 13px; color: #c8ccff; margin: -4px 0 6px; }
.wm-gems { display: flex; justify-content: center; gap: 6px; margin: 4px 0 14px; }
.wm-gem { width: 34px; height: 17px; clip-path: polygon(13% 0, 87% 0, 100% 30%, 100% 70%, 87% 100%, 13% 100%, 0 70%, 0 30%);
  background: linear-gradient(170deg, rgba(255,255,255,.75), rgba(255,255,255,0) 40%), var(--c);
  box-shadow: inset 0 -4px 6px rgba(0,0,0,.35); }
.wm-title { text-align: center; font-size: 34px; color: #ffd24a; text-shadow: 0 3px 0 #4a1c00, 0 5px 12px rgba(0,0,0,.6);
  margin: 4px 0 8px; }
.wm-btn { position: relative; font: inherit; font-size: 21px; color: #fff; padding: 11px 18px; border: 0; border-radius: 14px;
  cursor: pointer; text-align: center; background: linear-gradient(#4b52b8, #2c3184); outline: none;
  box-shadow: inset 0 2px 0 rgba(255,255,255,.28), inset 0 -3px 0 rgba(0,0,0,.3), 0 4px 10px rgba(0,0,0,.4);
  text-shadow: 0 2px 2px rgba(0,0,0,.5); transition: transform .08s, box-shadow .12s; display: flex; align-items: center;
  justify-content: center; gap: 10px; -webkit-tap-highlight-color: transparent; }
.wm-btn.primary { background: linear-gradient(#ff6a50, #c8261a); font-size: 25px; padding: 14px 18px; }
.wm-btn:focus-visible, .wm-btn.focus, .wm-btn:hover { box-shadow: inset 0 2px 0 rgba(255,255,255,.28),
  inset 0 -3px 0 rgba(0,0,0,.3), 0 0 0 3px #ffd24a, 0 0 22px rgba(255,200,60,.55);
  animation: wm-glow 1.1s ease-in-out infinite alternate; }
@keyframes wm-glow {
  from { box-shadow: inset 0 2px 0 rgba(255,255,255,.28), inset 0 -3px 0 rgba(0,0,0,.3), 0 0 0 3px #ffd24a,
    0 0 8px rgba(255,200,60,.25); }
  to { box-shadow: inset 0 2px 0 rgba(255,255,255,.28), inset 0 -3px 0 rgba(0,0,0,.3), 0 0 0 3px #ffd24a,
    0 0 34px 7px rgba(255,200,60,.85); } }
@media (prefers-reduced-motion: reduce) { .wm-btn { animation: none !important; } }
.wm-btn:active { transform: translateY(2px); }
.wm-btn .val { color: #ffd24a; }
.wm-btn .arrow { opacity: .6; font-size: 16px; }
.wm-row { display: flex; gap: 10px; }
.wm-row .wm-btn { flex: 1; }
.wm-card { text-align: left; display: grid; grid-template-columns: 1fr auto; gap: 2px 12px; padding: 14px 18px; }
.wm-card .name { font-size: 26px; }
.wm-card .info { font-size: 14px; color: #c8ccff; grid-column: 1; }
.wm-card .best { grid-row: 1 / span 2; grid-column: 2; align-self: center; text-align: right; font-size: 14px; color: #c8ccff; }
.wm-card .best b { display: block; font-size: 20px; color: #ffd24a; }
.wm-card.sel { background: linear-gradient(#5a62d0, #363c9c); }
.wm-table { width: 100%; border-collapse: collapse; font-size: 17px; background: rgba(0,0,0,.25); border-radius: 12px;
  overflow: hidden; }
.wm-table td { padding: 5px 12px; }
.wm-table td:first-child { color: #9aa2e6; width: 2em; text-align: right; }
.wm-table td.score { text-align: right; color: #ffd24a; }
.wm-table td.lvl { text-align: right; color: #9aa2e6; font-size: 14px; }
.wm-table tr:nth-child(odd) { background: rgba(255,255,255,.04); }
.wm-table tr.new { background: rgba(255,200,60,.25); }
.wm-empty { text-align: center; color: #9aa2e6; padding: 20px; }
.wm-text { text-align: center; font-size: 18px; color: #d8dcff; line-height: 1.4; }
.wm-input { font: inherit; font-size: 24px; text-align: center; padding: 10px; border-radius: 12px; border: 3px solid #ffd24a;
  background: rgba(0,0,0,.4); color: #fff; outline: none; }
.wm-foot { text-align: center; font-size: 12px; color: #7c84c8; margin-top: 10px; line-height: 1.5; font-weight: normal; }
.wm-foot kbd { font: inherit; font-weight: bold; color: #aab0ee; }
`;

type Screen = 'title' | 'courses' | 'scores' | 'pause' | 'name' | 'done' | 'editor' | 'files';

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', text = ''): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text) e.textContent = text;
  return e;
}

const ordinal = (n: number) => `${n}${n % 10 === 1 && n !== 11 ? 'st' : n % 10 === 2 && n !== 12 ? 'nd' : n % 10 === 3 && n !== 13 ? 'rd' : 'th'}`;

/** The name in a high-score entry (`<score>   <name>`, TCourseEditor.AddHighScore). */
const scoreName = (s: HighScore) => s.text.replace(/^\s*\d+\s*/, '');

export class Menu {
  private readonly root = el('div', 'wmenu');
  private readonly box = el('div', 'wm-box');
  private screen: Screen | null = null;
  private stack: Screen[] = [];
  private scoresCourse = '';
  private highlight = -1;
  private nameDone: ((name: string | null) => void) | null = null;
  private doneActions: { again: () => void; menu: () => void; editor?: () => void } | null = null;
  private files: FilesScreen | null = null;
  private message = { text: '', ok: false };
  private confirm = ''; // an action waiting for a second click (overwrite, reset)

  constructor(parent: HTMLElement, private readonly host: MenuHost) {
    const style = document.createElement('style');
    style.textContent = CSS;
    document.head.appendChild(style);
    this.root.hidden = true;
    this.root.appendChild(this.box);
    parent.appendChild(this.root);
    // before the game's keyboard (which takes the arrows and Space), while the menu is open
    window.addEventListener('keydown', (e) => this.key(e), { capture: true });
    // Space would click the focused button again on its way up
    window.addEventListener('keyup', (e) => {
      if (this.screen && this.screen !== 'name' && !(e.target instanceof HTMLInputElement) && e.code === 'Space') e.preventDefault();
    }, { capture: true });
  }

  get open(): boolean {
    return this.screen !== null;
  }

  /** In a game or the editor (the pause or editor menu), rather than on the title screen. */
  get paused(): boolean {
    const first = this.stack[0] ?? this.screen;
    return first === 'pause' || first === 'editor';
  }

  showTitle(): void {
    this.stack = [];
    this.go('title');
  }

  showPause(): void {
    this.stack = [];
    this.go('pause');
  }

  /** The editor's menu (Esc in the editor). */
  showEditor(): void {
    this.stack = [];
    this.go('editor');
  }

  close(): void {
    this.cancelFiles();
    this.screen = null;
    this.stack = [];
    this.root.hidden = true;
  }

  /** The high-score name entry: resolves with the name (no blanks), or null. */
  askName(place: number, score: number, name = ''): Promise<string | null> {
    this.stack = [];
    this.highlight = place;
    this.scoresCourse = this.host.course();
    return new Promise((resolve) => {
      this.nameDone = resolve;
      this.go('name', { place, score, name });
    });
  }

  /** After the name: the table with the new entry; resolves with the choice, Play again, the title or the editor. */
  showDone(): Promise<'again' | 'menu' | 'editor'> {
    this.stack = [];
    return new Promise((resolve) => {
      this.doneActions = { again: () => resolve('again'), menu: () => resolve('menu'),
        editor: this.host.editor.canReturn() ? () => resolve('editor') : undefined };
      this.go('done');
    });
  }

  /** Re-draw the current screen (the graphics setting or fullscreen changed). */
  refresh(): void {
    if (this.screen) this.render(this.screen);
  }

  private go(s: Screen, arg?: { place: number; score: number; name?: string }): void {
    this.message = { text: '', ok: false };
    this.confirm = '';
    if (this.screen && this.screen !== s && s !== 'name') this.stack.push(this.screen);
    this.screen = s;
    this.root.hidden = false;
    this.render(s, arg);
  }

  private back(): void {
    if (this.screen === 'name' || this.screen === 'done') return;
    if (this.screen === 'files') this.cancelFiles();
    const s = this.stack.pop();
    this.message = { text: '', ok: false };
    this.confirm = '';
    if (s) {
      this.screen = s;
      this.render(s);
    } else if (this.screen === 'pause' || this.screen === 'editor') this.host.resume();
    else this.close();
  }

  private cancelFiles(): void {
    const cancel = this.files?.cancel;
    if (this.files) this.files.cancel = undefined;
    cancel?.();
  }

  /** The file screen on its own (from the editor's panel): the name chosen, or null. */
  pickFile(f: Omit<FilesScreen, 'done' | 'cancel'>): Promise<string | null> {
    if (!this.screen) this.stack = [];
    return new Promise((resolve) => this.chooseFile(f, resolve, () => resolve(null)));
  }

  /** The file screen over the levels or courses; `done` gets the name chosen, then the screen goes back. */
  private chooseFile(f: Omit<FilesScreen, 'done' | 'cancel'>, done: (name: string) => void, cancel?: () => void): void {
    this.files = { ...f, cancel, done: (name) => {
      this.files!.cancel = undefined;
      this.back();
      done(name);
    } };
    this.go('files');
  }

  /** Show a line under the buttons (an error, or what was done), on the current screen. */
  private say(text: string, ok = false): void {
    this.message = { text, ok };
    const m = this.box.querySelector('.wm-msg');
    if (m) {
      m.textContent = text;
      m.classList.toggle('ok', ok);
    }
  }

  private msgLine(): HTMLElement {
    const m = el('div', 'wm-msg' + (this.message.ok ? ' ok' : ''), this.message.text);
    return m;
  }

  /** A button that asks again (its label changes to `ask`) before it does `action`. */
  private confirmed(label: string, ask: string, key: string, action: () => void, cls = ''): HTMLButtonElement {
    const b = this.button(this.confirm === key ? ask : label, () => {
      if (this.confirm !== key) {
        this.confirm = key;
        b.innerHTML = ask;
        return;
      }
      this.confirm = '';
      action();
    }, cls);
    return b;
  }

  private renderEditor(box: HTMLElement): void {
    const e = this.host.editor;
    const name = e.courseName();
    const dirty = e.dirty();
    const discard = (label: string, key: string, action: () => void) => dirty
      ? this.confirmed(label, `${label}: <span class="val">discard the changes?</span>`, key, action)
      : this.button(label, action);
    box.append(el('div', 'wm-title', 'Editor'),
      el('div', 'wm-text', (name ? courseTitle(name) : 'New course') + (dirty ? ' (not saved)' : '')),
      this.button('Back to editor', () => this.host.resume(), 'primary'),
      discard('New course', 'new', () => {
        e.newCourse();
        this.host.resume();
      }),
      discard('Open course…', 'open', () => this.chooseFile({ title: 'Open course', save: false, ext: 'cse', value: '' }, (n) => {
        e.openCourse(n);
        this.host.resume();
      })),
      this.button('Save course as…', () => this.chooseFile({ title: 'Save course as', save: true, ext: 'cse', value: name ?? '' }, (n) => {
        e.saveCourseAs(n).then((problems) => {
          this.render('editor');
          this.say(savedText(`Saved as ${courseTitle(n)}`, problems), problems.length === 0);
        }, (err: unknown) => {
          this.render('editor');
          this.say(notSaved(err));
        });
      })));
    const picker = this.importPicker((r) => {
      this.render('editor');
      this.importResult(r);
    });
    const files = el('div', 'wm-row small');
    files.append(this.button('Import…', () => picker.click()), this.button('⤓ Level', () => e.downloadLevel()),
      this.button('⤓ Course', () => e.downloadCourse()));
    box.append(files, picker);
    if (name) {
      box.append(this.confirmed('Reset high scores', 'Reset high scores: <span class="val">sure?</span>', 'reset', () => {
        e.resetHighScores();
        this.say('High scores cleared', true);
      }));
    }
    box.append(this.msgLine(), this.button('Main menu', () => this.showTitle()));
  }

  /** A hidden file input for .lev and .cse files; `done` gets what importFiles found. */
  private importPicker(done: (r: { names: string[]; errors: string[] }) => void): HTMLInputElement {
    const picker = el('input');
    picker.type = 'file';
    picker.multiple = true;
    picker.accept = '.lev,.cse';
    picker.hidden = true;
    picker.addEventListener('change', async () => {
      const r = await this.host.editor.importFiles([...(picker.files ?? [])]);
      picker.value = '';
      done(r);
    });
    return picker;
  }

  private importResult(r: { names: string[]; errors: string[] }): void {
    if (r.errors.length) this.say(r.errors.join(' · '));
    else if (r.names.length) this.say(`Imported ${r.names.join(', ')}`, true);
  }

  private renderFiles(box: HTMLElement): void {
    const f = this.files!, e = this.host.editor;
    const names = () => (f.ext === 'lev' ? e.levels() : e.courses());
    const withExt = (n: string) => (/\.[^.]*$/.test(n) ? n : `${n}.${f.ext}`);
    box.append(el('div', 'wm-title', f.title));
    let input: HTMLInputElement | null = null;
    let save: HTMLButtonElement | null = null;
    if (f.save) {
      input = el('input', 'wm-input');
      input.maxLength = 50; // a course keeps a string[50] per level
      input.placeholder = 'Name';
      input.value = f.value.replace(new RegExp(`\\.${f.ext}$`, 'i'), '');
      const name = () => withExt(input!.value.trim().replace(/[\\/:*?"<>|]/g, ''));
      const label = () => (names().includes(name()) ? `Overwrite <span class="val">${name()}</span>?` : 'Save');
      const go = () => {
        if (!input!.value.trim()) return;
        if (names().includes(name()) && this.confirm !== 'overwrite') {
          this.confirm = 'overwrite';
          save!.innerHTML = `Overwrite <span class="val">${name()}</span>? Yes`;
          return;
        }
        f.done(name());
      };
      input.addEventListener('input', () => {
        this.confirm = '';
        save!.innerHTML = label();
      });
      input.addEventListener('keydown', (ev) => {
        if (ev.key === 'Enter') go();
        if (ev.key === 'Escape') this.back();
        ev.stopPropagation();
      });
      save = this.button(label(), go, 'primary');
      box.append(input, save);
      requestAnimationFrame(() => input!.focus());
    }
    const list = el('div', 'wm-list');
    for (const n of names()) {
      const b = el('button', 'wm-item' + (input && withExt(input.value) === n ? ' sel' : ''));
      b.type = 'button';
      const thumb = f.ext === 'lev' ? e.thumbnail?.(n) : null;
      if (thumb) b.append(thumb);
      b.append(n.replace(new RegExp(`\\.${f.ext}$`, 'i'), ''));
      const dl = el('span', 'x', '⤓');
      dl.title = 'Download';
      dl.addEventListener('click', (ev) => {
        ev.stopPropagation();
        e.download(n);
      });
      b.append(dl);
      b.addEventListener('click', () => {
        if (!input) f.done(n);
        else {
          input.value = n.replace(new RegExp(`\\.${f.ext}$`, 'i'), '');
          input.dispatchEvent(new Event('input'));
          input.focus();
        }
      });
      list.append(b);
    }
    const picker = this.importPicker((r) => {
      this.render('files');
      this.importResult(r);
    });
    const row = el('div', 'wm-row small');
    row.append(this.button('Import file…', () => picker.click()), this.button('Back', () => this.back()));
    box.append(list, picker, this.msgLine(), row);
  }

  private button(label: string, action: () => void, cls = ''): HTMLButtonElement {
    const b = el('button', 'wm-btn' + (cls ? ' ' + cls : ''));
    b.type = 'button';
    b.innerHTML = label;
    b.addEventListener('click', (e) => {
      e.preventDefault();
      action();
    });
    return b;
  }

  /** A row that changes with ← → (and click): `change(+1 | -1)`. */
  private selector(label: string, change: (d: number) => void): HTMLButtonElement {
    const b = this.button(`<span class="arrow">◀</span>${label}<span class="arrow">▶</span>`, () => change(1));
    b.dataset.selector = '1';
    (b as HTMLButtonElement & { change?: (d: number) => void }).change = change;
    return b;
  }

  private render(s: Screen, arg?: { place: number; score: number; name?: string }): void {
    const box = this.box;
    box.replaceChildren();
    const h = this.host;
    const course = h.courses().find((c) => c.file === h.course()) ?? h.courses()[0];
    const graphics = () => this.selector(`Graphics: <span class="val">${h.remastered() ? 'Remastered' : 'Classic 1999'}</span>`,
      () => h.setRemastered(!h.remastered()));
    const music = () => h.music ? this.selector(`Music: <span class="val">${VOLUME_NAMES[h.music()]}</span>`, (d) => {
      h.setMusic((h.music!() + d + VOLUMES.length) % VOLUMES.length);
      this.render(s);
      (this.box.querySelector('[data-music]') as HTMLElement | null)?.focus();
    }) : null;
    const withMusic = (b: HTMLButtonElement | null) => {
      if (b) b.dataset.music = '1';
      return b;
    };
    const fullscreen = () => h.fullscreen ? this.button(h.isFullscreen() ? 'Leave fullscreen' : 'Fullscreen', () => h.fullscreen!()) : null;
    switch (s) {
      case 'title': {
        // the banners' lava text with their wave (tools/remaster_banners.py title_wave): the frames stacked, shown
        // one at a time through the box
        const logo = el('div', 'wm-logo');
        const img = document.createElement('img');
        img.src = import.meta.env.BASE_URL + 'remaster/title-wave.webp';
        img.alt = 'Wunioid';
        logo.append(img);
        const gems = el('div', 'wm-gems');
        for (const c of ['#f0302a', '#ffb43c', '#4cc84a', '#5a56e6', '#ee3ae6']) {
          const g = el('div', 'wm-gem');
          g.style.setProperty('--c', c);
          gems.append(g);
        }
        box.append(logo, el('div', 'wm-sub', 'REMASTERED'), gems,
          this.button(`Play <span class="val">${courseTitle(course.file)}</span>`, () => h.play(), 'primary'),
          this.button('Choose course', () => this.go('courses')),
          this.button('High scores', () => {
            this.scoresCourse = h.course();
            this.highlight = -1;
            this.go('scores');
          }));
        box.append(this.button('Editor', () => h.editor.open()), graphics());
        const m = withMusic(music());
        if (m) box.append(m);
        const fs = fullscreen();
        if (fs) box.append(fs);
        const foot = el('div', 'wm-foot');
        foot.innerHTML = '<kbd>← →</kbd> move · <kbd>Space</kbd> fire · <kbd>P</kbd> pause · <kbd>Esc</kbd> menu<br>' +
          '1999 by Wunibald, Horse Productions · Remastered 2026';
        box.append(foot);
        break;
      }
      case 'courses': {
        box.append(el('div', 'wm-title', 'Choose a course'));
        for (const c of h.courses()) {
          const best = c.scores[0];
          const b = this.button('', () => {
            h.setCourse(c.file);
            h.play();
          }, 'wm-card' + (c.file === h.course() ? ' sel' : ''));
          b.append(el('span', 'name', courseTitle(c.file)), el('span', 'info', `${c.levels} levels`));
          const bs = el('span', 'best');
          if (best) {
            bs.append('Best ', el('b', '', String(best.score)), scoreName(best));
          } else bs.textContent = 'No scores yet';
          b.append(bs);
          box.append(b);
        }
        box.append(this.button('Back', () => this.back()));
        break;
      }
      case 'scores':
      case 'done': {
        const courses = h.courses();
        const c = courses.find((x) => x.file === this.scoresCourse) ?? course;
        box.append(el('div', 'wm-title', s === 'done' ? 'Well played!' : 'High scores'));
        if (s === 'scores' && courses.length > 1) {
          box.append(this.selector(`Course: <span class="val">${courseTitle(c.file)}</span>`, (d) => {
            const i = courses.indexOf(c);
            this.scoresCourse = courses[(i + d + courses.length) % courses.length].file;
            this.highlight = -1;
            this.render('scores');
            (this.box.querySelector('[data-selector]') as HTMLElement | null)?.focus();
          }));
        } else box.append(el('div', 'wm-text', courseTitle(c.file)));
        if (c.scores.length) {
          const t = el('table', 'wm-table');
          c.scores.forEach((sc, i) => {
            const tr = el('tr', i === this.highlight ? 'new' : '');
            tr.append(el('td', '', `${i + 1}.`), el('td', '', scoreName(sc) || '—'), el('td', 'lvl', `Level ${sc.level + 1}`),
              el('td', 'score', String(sc.score)));
            t.append(tr);
          });
          box.append(t);
        } else box.append(el('div', 'wm-empty', 'No scores yet. Be the first!'));
        if (s === 'done') {
          const a = this.doneActions!;
          box.append(this.button('Play again', a.again, 'primary'));
          if (a.editor) box.append(this.button('Back to editor', a.editor));
          box.append(this.button('Main menu', a.menu));
        } else box.append(this.button('Back', () => this.back()));
        break;
      }
      case 'pause':
        box.append(el('div', 'wm-title', 'Paused'),
          this.button('Resume', () => h.resume(), 'primary'));
        if (h.editor.canReturn()) box.append(this.button('Back to editor', () => h.editor.open())); // a test game, or a game from the editor
        box.append(
          this.button(`New game <span class="val">${courseTitle(course.file)}</span>`, () => h.play()),
          this.button('Choose course', () => this.go('courses')),
          graphics());
        {
          const m = withMusic(music());
          if (m) box.append(m);
          const fs = fullscreen();
          if (fs) box.append(fs);
        }
        box.append(this.button('Main menu', () => this.showTitle()));
        break;
      case 'editor':
        this.renderEditor(box);
        break;
      case 'files':
        this.renderFiles(box);
        if (this.files?.save) return; // the name has the focus
        break;
      case 'name': {
        const place = arg?.place ?? 0, score = arg?.score ?? 0;
        box.append(el('div', 'wm-title', 'New high score!'),
          el('div', 'wm-text', `${score} points: ${ordinal(place + 1)} place in ${courseTitle(this.scoresCourse)}`));
        const input = el('input', 'wm-input');
        input.maxLength = 20;
        input.placeholder = 'Your name';
        input.value = arg?.name ?? '';
        input.setAttribute('autocomplete', 'nickname');
        input.addEventListener('input', () => (input.value = input.value.replace(/\s+/g, '')));
        const ok = () => {
          const done = this.nameDone;
          this.nameDone = null;
          done?.(input.value.replace(/\s+/g, ''));
        };
        input.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') ok();
          e.stopPropagation();
        });
        box.append(input, this.button('OK', ok, 'primary'));
        requestAnimationFrame(() => input.select());
        return;
      }
    }
    requestAnimationFrame(() => this.focusFirst());
  }

  private buttons(): HTMLButtonElement[] {
    return [...this.box.querySelectorAll<HTMLButtonElement>('button.wm-btn')];
  }

  private focusFirst(): void {
    if (this.box.contains(document.activeElement)) return;
    this.buttons()[0]?.focus({ preventScroll: false });
  }

  /** Move the focus (dy), change a selector (dx), choose, or go back: keys and gamepad. */
  nav(action: 'up' | 'down' | 'left' | 'right' | 'ok' | 'back'): void {
    if (!this.screen) return;
    if (this.screen === 'name') {
      if (action === 'ok') (this.box.querySelector('button.wm-btn') as HTMLButtonElement | null)?.click();
      return;
    }
    const bs = [...this.box.querySelectorAll<HTMLButtonElement>('button.wm-btn, button.wm-item')];
    const i = bs.indexOf(document.activeElement as HTMLButtonElement);
    const cur = bs[i] as (HTMLButtonElement & { change?: (d: number) => void }) | undefined;
    switch (action) {
      case 'up':
      case 'down': {
        const d = action === 'up' ? -1 : 1;
        bs[i < 0 ? 0 : (i + d + bs.length) % bs.length]?.focus();
        break;
      }
      case 'left':
      case 'right':
        if (cur?.change) {
          const idx = i;
          cur.change(action === 'left' ? -1 : 1);
          this.buttons()[idx]?.focus();
        }
        break;
      case 'ok':
        if (cur) {
          const idx = i;
          cur.click();
          if (cur.change) this.buttons()[idx]?.focus();
        } else this.focusFirst();
        break;
      case 'back':
        this.back();
        break;
    }
  }

  private key(e: KeyboardEvent): void {
    if (!this.screen || e.ctrlKey || e.metaKey || e.altKey) return;
    const map: Record<string, 'up' | 'down' | 'left' | 'right' | 'ok' | 'back'> = {
      ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right', Enter: 'ok', Space: 'ok',
      NumpadEnter: 'ok', Escape: 'back', KeyK: 'up', KeyH: 'left', KeyL: 'right',
    };
    const a = map[e.code];
    if (this.screen === 'name') {
      if (e.code === 'Escape') e.preventDefault();
      return; // the input has the keys
    }
    if (e.target instanceof HTMLInputElement) return; // the file name has the keys (its own Enter and Escape)
    if (e.code === 'KeyF' || e.code === 'KeyR') return; // fullscreen and graphics work everywhere (main.ts)
    e.stopPropagation();
    if (!a) return;
    e.preventDefault();
    if (!e.repeat || a === 'up' || a === 'down') this.nav(a);
  }
}
