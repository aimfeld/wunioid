// The Remastered editor's course panel (the remake): beside the level editor (left of the picture, or under it in
// a portrait window), the course's levels as pictures in play order. A click edits a level; the selected one has
// buttons to move it, rename it, copy it and take it out; under the list a new level or an existing one goes in
// after it. Save writes the course and its changed levels; Play course saves and plays it. HTML, in the menus'
// look.

import type { EditorProject } from '../editorProject';
import type { Thumbnails } from '../render/thumbnail';
import { courseTitle } from './menu';

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface PanelHost {
  project(): EditorProject;
  readonly thumbs: Thumbnails;
  /** The level to edit changed (another entry, or none of the buffer is the world's any more). */
  edit(): void;
  /** A level file to add (the menu's file list), or null. */
  pickLevel(): Promise<string | null>;
  /** Save (a new course asks for its name); false if cancelled. */
  save(): Promise<boolean>;
  /** Save and play the course from its first level. */
  play(): void;
  /** Test the level being edited. */
  test(): void;
  /** The editor's menu (Esc). */
  menu(): void;
}

const CSS = `
.wep { position: fixed; z-index: 15; display: flex; flex-direction: column; gap: 8px; box-sizing: border-box; padding: 10px;
  font-family: 'Comic Neue', 'Comic Sans MS', cursive; font-weight: bold; color: #e8eaff;
  background: linear-gradient(#1c2160, #0c0e2a); border-right: 2px solid #d8d8e0; touch-action: manipulation; }
.wep.portrait { border-right: 0; border-top: 2px solid #d8d8e0; }
.wep[hidden] { display: none; }
.wep-head { display: flex; align-items: baseline; gap: 8px; padding: 0 4px; min-width: 0; }
.wep-head .lbl { font-size: 11px; letter-spacing: 2px; color: #9aa2e6; }
.wep-head .name { font-size: 20px; color: #ffd24a; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.wep-list { flex: 1; min-height: 60px; overflow-y: auto; display: flex; flex-direction: column; gap: 4px; padding: 4px;
  background: rgba(0,0,0,.3); border-radius: 10px; touch-action: pan-y; overscroll-behavior: contain; }
.wep-item { display: flex; align-items: center; gap: 8px; padding: 4px; border-radius: 8px; cursor: pointer; flex: none;
  -webkit-tap-highlight-color: transparent; }
.wep-item:hover { background: rgba(255,255,255,.07); }
.wep-item.sel { background: linear-gradient(#5a62d0, #363c9c); }
.wep-item canvas { flex: none; border-radius: 4px; box-shadow: 0 0 0 1px rgba(255,255,255,.18); background: #000; }
.wep-item .n { color: #9aa2e6; font-size: 13px; min-width: 1.4em; text-align: right; flex: none; }
.wep-item.sel .n { color: #d8dcff; }
.wep-item .t { font-size: 15px; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex: 1; }
.wep-item .dot, .wep-head .dot { color: #ffd24a; flex: none; font-size: 14px; }
.wep-item input { font: inherit; font-size: 15px; min-width: 0; flex: 1; padding: 2px 6px; border-radius: 6px;
  border: 2px solid #ffd24a; background: rgba(0,0,0,.45); color: #fff; outline: none; user-select: text; }
.wep-acts { display: flex; gap: 4px; padding: 0 4px 4px; flex: none; }
.wep-acts button { flex: 1; }
.wep button.b { font: inherit; font-size: 15px; color: #fff; padding: 6px 4px; border: 0; border-radius: 8px; cursor: pointer;
  background: linear-gradient(#4b52b8, #2c3184); box-shadow: inset 0 1px 0 rgba(255,255,255,.25), inset 0 -2px 0 rgba(0,0,0,.3);
  -webkit-tap-highlight-color: transparent; white-space: nowrap; }
.wep button.b:hover { box-shadow: inset 0 1px 0 rgba(255,255,255,.25), inset 0 -2px 0 rgba(0,0,0,.3), 0 0 0 2px #ffd24a; }
.wep button.b:active { transform: translateY(1px); }
.wep button.b:disabled { opacity: .45; cursor: default; box-shadow: none; }
.wep-acts button.b { font-size: 14px; padding: 4px 0; background: rgba(0,0,0,.3); }
.wep button.b.save.on { background: linear-gradient(#ffcf4a, #d89a10); color: #3a1c00; text-shadow: none; }
.wep button.b.primary { background: linear-gradient(#ff6a50, #c8261a); }
.wep-row { display: flex; gap: 6px; flex: none; }
.wep-row button { flex: 1; }
.wep-msg { font-size: 13px; color: #ff9a80; text-align: center; min-height: 1.1em; flex: none; }
.wep-msg.ok { color: #9ae68a; }
.wep-msg:empty { display: none; }
`;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', text = ''): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text) e.textContent = text;
  return e;
}

const SIDE_MIN = 240, SIDE_MAX = 300, BELOW_MIN = 210;
const THUMB = 88; // CSS px

export class EditorPanel {
  readonly root = el('div', 'wep');
  private readonly name = el('span', 'name');
  private readonly headDot = el('span', 'dot');
  private readonly list = el('div', 'wep-list');
  private readonly msg = el('div', 'wep-msg');
  private readonly saveButton: HTMLButtonElement;
  private readonly playButton: HTMLButtonElement;
  private placed: { key: string; area: Rect } = { key: '', area: { x: 0, y: 0, w: 0, h: 0 } };
  private items: { root: HTMLElement; canvas: HTMLCanvasElement; dot: HTMLElement }[] = [];
  private renaming = -1;
  private stale = false; // the current level's picture
  private marks = '';

  constructor(parent: HTMLElement, private readonly host: PanelHost) {
    const style = document.createElement('style');
    style.textContent = CSS;
    document.head.appendChild(style);
    this.root.hidden = true;
    const head = el('div', 'wep-head');
    head.append(el('span', 'lbl', 'COURSE'), this.name, this.headDot);
    const add = el('div', 'wep-row');
    add.append(
      this.button('+ New level', () => {
        this.host.project().addNew();
        this.changed(true);
      }),
      this.button('+ Add level…', async () => {
        const name = await this.host.pickLevel();
        if (!name) return;
        this.host.project().addExisting(name);
        this.changed(true);
      }));
    this.saveButton = this.button('Save', () => void this.save(), 'save');
    const foot = el('div', 'wep-row');
    this.playButton = this.button('Play course', () => this.host.play());
    this.playButton.title = 'Play the course from its first level';
    foot.append(this.saveButton, this.playButton);
    const tools = el('div', 'wep-row');
    tools.append(this.button('Test level', () => this.host.test(), 'primary'), this.button('☰ Menu', () => this.host.menu()));
    this.root.append(head, this.list, add, this.msg, foot, tools);
    parent.appendChild(this.root);
    // Ctrl+S saves (before the game's keyboard)
    window.addEventListener('keydown', (e) => {
      if (this.root.hidden || !(e.ctrlKey || e.metaKey) || e.code !== 'KeyS') return;
      e.preventDefault();
      void this.save();
    });
  }

  get visible(): boolean {
    return !this.root.hidden;
  }

  set visible(on: boolean) {
    if (on === this.visible) return;
    this.root.hidden = !on;
    if (on) this.render();
  }

  /**
   * Where the panel goes in a window of w x h (left of the 640 x 480 picture, the two centred together; under it
   * when the window is portrait); returns the picture's area.
   */
  place(w: number, h: number): Rect {
    const key = `${w}x${h}`;
    if (key !== this.placed.key) this.placed = { key, area: this.layout(w, h) };
    return this.placed.area;
  }

  private layout(w: number, h: number): Rect {
    const portrait = w < h;
    this.root.classList.toggle('portrait', portrait);
    const r = this.root.style;
    if (portrait) {
      const ph = Math.min((w * 3) / 4, h - BELOW_MIN);
      Object.assign(r, { left: '0px', top: `${ph}px`, width: `${w}px`, height: `${h - ph}px` });
      return { x: 0, y: 0, w, h: ph };
    }
    const side = Math.max(SIDE_MIN, Math.min(SIDE_MAX, w - (h * 4) / 3));
    const pw = Math.min(w - side, (h * 4) / 3);
    const x = Math.max(0, (w - side - pw) / 2);
    Object.assign(r, { left: `${x}px`, top: '0px', width: `${side}px`, height: `${h}px` });
    return { x: x + side, y: 0, w: pw, h };
  }

  /** Painted in the editor: the current level's picture and the unsaved marks follow (next update). */
  painted(): void {
    this.stale = true;
  }

  /** Once a frame while shown: the current picture if painted, the unsaved marks. */
  update(): void {
    if (this.root.hidden) return;
    const p = this.host.project();
    if (this.stale) {
      this.stale = false;
      const item = this.items[p.current];
      if (item) this.host.thumbs.draw(item.canvas, p.level, THUMB);
    }
    const marks = (p.dirty ? '1' : '0') + p.entries.map((_, i) => (p.levelDirty(i) ? '1' : '0')).join('');
    if (marks === this.marks) return;
    this.marks = marks;
    this.headDot.textContent = p.dirty ? '●' : '';
    this.headDot.title = p.dirty ? 'Unsaved changes' : '';
    this.saveButton.classList.toggle('on', p.dirty);
    this.saveButton.textContent = p.dirty ? 'Save ●' : 'Saved';
    this.playButton.textContent = p.dirty ? 'Save & play course' : 'Play course';
    this.items.forEach((it, i) => (it.dot.textContent = marks[i + 1] === '1' ? '●' : ''));
  }

  /** Show a line over the buttons (an error, or what was done). */
  say(text: string, ok = false): void {
    this.msg.textContent = text;
    this.msg.classList.toggle('ok', ok);
  }

  /** The list again (a course opened, entries changed). */
  render(): void {
    const p = this.host.project();
    this.name.textContent = p.name ? courseTitle(p.name) : 'New course';
    this.list.replaceChildren();
    this.items = [];
    this.marks = '';
    p.entries.forEach((name, i) => {
      const item = el('div', 'wep-item' + (i === p.current ? ' sel' : ''));
      const canvas = el('canvas');
      this.host.thumbs.draw(canvas, p.levelOf(i), THUMB);
      const dot = el('span', 'dot');
      item.append(canvas, el('span', 'n', `${i + 1}`));
      const title = name.replace(/\.lev$/i, '');
      if (i === this.renaming) item.append(this.renameInput(i, title));
      else {
        const t = el('span', 't', title);
        t.title = name;
        item.append(t);
      }
      item.append(dot);
      item.addEventListener('click', () => {
        if (i === this.renaming) return;
        this.renaming = -1;
        if (i !== p.current) {
          p.select(i);
          this.changed(true);
        }
      });
      item.addEventListener('dblclick', () => {
        if (i !== this.renaming) this.startRename(i);
      });
      this.list.append(item);
      this.items.push({ root: item, canvas, dot });
      if (i === p.current) this.list.append(this.actions(i));
    });
    this.update();
    requestAnimationFrame(() => this.list.querySelector('.wep-item.sel')?.scrollIntoView({ block: 'nearest' }));
  }

  /** The selected entry's buttons. */
  private actions(i: number): HTMLElement {
    const p = this.host.project();
    const acts = el('div', 'wep-acts');
    const up = this.button('▲', () => {
      p.move(i, -1);
      this.changed(false);
    });
    up.disabled = i === 0;
    up.title = 'Move up';
    const down = this.button('▼', () => {
      p.move(i, 1);
      this.changed(false);
    });
    down.disabled = i === p.entries.length - 1;
    down.title = 'Move down';
    const rename = this.button('✎', () => this.startRename(i));
    rename.title = 'Rename';
    const copy = this.button('⧉', () => {
      p.duplicate(i);
      this.changed(true);
    });
    copy.title = 'Duplicate';
    const remove = this.button('✕', () => {
      const err = p.remove(i);
      if (err) this.say(err);
      else this.changed(true);
    });
    remove.title = 'Take out of the course (the file stays)';
    acts.append(up, down, rename, copy, remove);
    return acts;
  }

  private startRename(i: number): void {
    this.renaming = i;
    this.render();
  }

  private renameInput(i: number, title: string): HTMLInputElement {
    const input = el('input');
    input.value = title;
    input.maxLength = 46;
    let done = false;
    const finish = (commit: boolean) => {
      if (done) return;
      done = true;
      this.renaming = -1;
      if (commit) {
        const err = this.host.project().rename(i, input.value);
        if (err) this.say(err);
        else this.say('');
      }
      this.changed(true); // the entry's buffer may be a new one
    };
    input.addEventListener('keydown', (e) => {
      e.stopPropagation(); // the game's keys (R, F, P, Esc)
      if (e.key === 'Enter') finish(true);
      if (e.key === 'Escape') finish(false);
    });
    input.addEventListener('blur', () => finish(true));
    input.addEventListener('click', (e) => e.stopPropagation());
    requestAnimationFrame(() => {
      input.focus();
      input.select();
    });
    return input;
  }

  /** After a change of the entries: the list again, and the editor on the current level if it changed. */
  private changed(edit: boolean): void {
    if (edit) this.host.edit();
    this.render();
  }

  private async save(): Promise<void> {
    if (await this.host.save()) this.say(`Saved ${courseTitle(this.host.project().name!)}`, true);
    this.render();
  }

  private button(label: string, action: () => void, cls = ''): HTMLButtonElement {
    const b = el('button', 'b' + (cls ? ' ' + cls : ''), label);
    b.type = 'button';
    b.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.say('');
      action();
      b.blur(); // Space and Enter belong to the game again
    });
    return b;
  }
}
