// The Remastered menus (the remake; Classic keeps the original's menu bar and dialogs): a title screen to start a
// course, choose one and see its high scores, switch the graphics and go fullscreen; the pause menu (Esc, ☰ on
// touch); and the high-score name entry with the table after it. HTML over the game, in the HUD's look (Comic
// Neue, the banners' gold, the stones' glossy colours). Mouse, touch, keys (↑ ↓ move, ← → change, Enter / Space
// choose, Esc back) and gamepad (main.ts calls nav).

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
  fullscreen?: () => void;
  isFullscreen(): boolean;
  /** Close the pause menu and go on. */
  resume(): void;
}

export const courseTitle = (file: string) => {
  const n = file.replace(/\.cse$/i, '');
  return n.charAt(0).toUpperCase() + n.slice(1);
};

const CSS = `
@font-face { font-family: 'Comic Neue'; font-weight: bold; src: url(fonts/ComicNeue-Bold.ttf); }
.wmenu { position: fixed; inset: 0; z-index: 30; display: flex; align-items: center; justify-content: center;
  font-family: 'Comic Neue', 'Comic Sans MS', cursive; font-weight: bold; color: #e8eaff;
  background: radial-gradient(ellipse at 50% 30%, rgba(38,44,110,.82), rgba(6,7,24,.94));
  -webkit-backdrop-filter: blur(5px); backdrop-filter: blur(5px); touch-action: manipulation; overflow-y: auto; }
.wmenu[hidden] { display: none; }
.wm-box { width: min(440px, calc(100vw - 32px)); padding: 16px 0 24px; display: flex; flex-direction: column;
  align-items: stretch; gap: 10px; margin: auto; }
.wm-logo { position: relative; text-align: center; font-size: clamp(56px, 16vw, 92px); line-height: 1.05;
  margin-bottom: 0; user-select: none; }
.wm-logo span { display: block; }
.wm-logo .back { color: #4a1c00; -webkit-text-stroke: 12px #4a1c00; text-shadow: 0 6px 14px rgba(0,0,0,.7); }
.wm-logo .front { position: absolute; inset: 0; background: linear-gradient(#fff6b0, #ffc02a 48%, #d8580a);
  -webkit-background-clip: text; background-clip: text; color: transparent; }
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
  inset 0 -3px 0 rgba(0,0,0,.3), 0 0 0 3px #ffd24a, 0 0 22px rgba(255,200,60,.55); }
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

type Screen = 'title' | 'courses' | 'scores' | 'pause' | 'name' | 'done';

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
  private doneActions: { again: () => void; menu: () => void } | null = null;

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
      if (this.screen && this.screen !== 'name' && e.code === 'Space') e.preventDefault();
    }, { capture: true });
  }

  get open(): boolean {
    return this.screen !== null;
  }

  /** In a game (the pause menu), rather than on the title screen. */
  get paused(): boolean {
    return this.stack[0] === 'pause';
  }

  showTitle(): void {
    this.stack = [];
    this.go('title');
  }

  showPause(): void {
    this.stack = [];
    this.go('pause');
  }

  close(): void {
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

  /** After the name: the table with the new entry; resolves with the choice, Play again or the title screen. */
  showDone(): Promise<'again' | 'menu'> {
    this.stack = [];
    return new Promise((resolve) => {
      this.doneActions = { again: () => resolve('again'), menu: () => resolve('menu') };
      this.go('done');
    });
  }

  /** Re-draw the current screen (the graphics setting or fullscreen changed). */
  refresh(): void {
    if (this.screen) this.render(this.screen);
  }

  private go(s: Screen, arg?: { place: number; score: number; name?: string }): void {
    if (this.screen && this.screen !== s && s !== 'name') this.stack.push(this.screen);
    this.screen = s;
    this.root.hidden = false;
    this.render(s, arg);
  }

  private back(): void {
    if (this.screen === 'name' || this.screen === 'done') return;
    const s = this.stack.pop();
    if (s) {
      this.screen = s;
      this.render(s);
    } else if (this.screen === 'pause') this.host.resume();
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
    const fullscreen = () => h.fullscreen ? this.button(h.isFullscreen() ? 'Leave fullscreen' : 'Fullscreen', () => h.fullscreen!()) : null;
    switch (s) {
      case 'title': {
        const logo = el('div', 'wm-logo');
        logo.append(el('span', 'back', 'Wunioid'), el('span', 'front', 'Wunioid'));
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
          }),
          graphics());
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
          box.append(this.button('Play again', a.again, 'primary'), this.button('Main menu', a.menu));
        } else box.append(this.button('Back', () => this.back()));
        break;
      }
      case 'pause':
        box.append(el('div', 'wm-title', 'Paused'),
          this.button('Resume', () => h.resume(), 'primary'),
          this.button(`New game <span class="val">${courseTitle(course.file)}</span>`, () => h.play()),
          this.button('Choose course', () => this.go('courses')),
          graphics());
        {
          const fs = fullscreen();
          if (fs) box.append(fs);
        }
        box.append(this.button('Main menu', () => this.showTitle()));
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
    const bs = this.buttons();
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
    if (e.code === 'KeyF' || e.code === 'KeyR') return; // fullscreen and graphics work everywhere (main.ts)
    e.stopPropagation();
    if (!a) return;
    e.preventDefault();
    if (!e.repeat || a === 'up' || a === 'down') this.nav(a);
  }
}
