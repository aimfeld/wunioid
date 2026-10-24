// Boot: load the data, run the fixed-tick loop (TForm1.TimerTimer) and draw the Classic picture.

import { Sfx } from './audio/sfx';
import { loadGameData } from './data';
import { toggleFullscreen } from './input/fullscreen';
import { Gamepad } from './input/gamepad';
import { Keyboard } from './input/keyboard';
import { Mouse } from './input/mouse';
import { TouchControls, touchLayout, type Insets, type TouchLayout } from './input/touch';
import { ClassicView, loadImages } from './render/classicView';
import { highScoreFile, parseHighScores, writeHighScores, type HighScore } from './sim/files';
import { GameState, World, type Input } from './sim/world';
import { chooseCourse, courseEditor, inputBox, menuBar } from './ui/dialogs';

const TICK_MS = 22; // decision 6: the DXTimer's interval, 1000/22 ≈ 45.45 ticks per second
const MAX_TICKS_PER_FRAME = 8; // after a stall, catch up at most this much
const SCORES_KEY = 'wunioid.scores.'; // + the high-score file name (defaultscr), base64

function storedScores(file: string): HighScore[] | null {
  try {
    const b64 = localStorage.getItem(SCORES_KEY + file);
    return b64 === null ? null : parseHighScores(Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)));
  } catch {
    return null;
  }
}

function storeScores(file: string, scores: HighScore[]): void {
  try {
    localStorage.setItem(SCORES_KEY + file, btoa(String.fromCharCode(...writeHighScores(scores))));
  } catch {
    // no storage (private window): not kept
  }
}

const UPDATE_CHECK_MS = 4000; // how long a start waits for the server's sw.js before going on (offline, slow network)
const UPDATE_INSTALL_MS = 20000; // how long it waits for a new version to install
const UPDATE_INTERVAL_MS = 60 * 60 * 1000;

const within = <T>(promise: Promise<T>, ms: number) =>
  Promise.race([promise, new Promise<void>((resolve) => setTimeout(resolve, ms))]);

/**
 * The service worker (sw.js, written by the build) caches the game for the installed app and offline play. Also
 * asks to keep the storage (high scores). (After Dark Planet's.)
 *
 * Updates: browsers look for a new sw.js only when a page is opened, and an installed app on a phone is mostly
 * resumed rather than restarted; the new version then took over in the background and only showed at the start
 * after that. So a start that already runs from the cache asks the server first and, if there is a new version,
 * waits for it and reloads ("Loading update…"). The app also asks whenever it comes back to the screen and every
 * hour; `onUpdate` is called when a new version has taken over, and the caller reloads at a moment that loses nothing.
 */
async function registerOffline(status: HTMLElement, onUpdate: () => void): Promise<void> {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;
  navigator.storage?.persist?.().catch(() => undefined);
  const sw = navigator.serviceWorker;
  // The first install also takes over the page (clients.claim); only a change of controller is an update.
  let controlled = sw.controller !== null;
  let updated = false;
  const changed = new Promise<void>((resolve) => {
    sw.addEventListener('controllerchange', () => {
      if (controlled) {
        updated = true;
        resolve();
        onUpdate();
      }
      controlled = true;
    });
  });
  const reg = await sw.register(import.meta.env.BASE_URL + 'sw.js', { updateViaCache: 'none' }).catch((e) => {
    console.warn('no service worker:', e);
  });
  if (!reg) return;
  const check = () => reg.update().catch(() => undefined);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) void check();
  });
  setInterval(() => void check(), UPDATE_INTERVAL_MS);
  if (!controlled) return; // the first visit: this page is the newest version
  await within(check(), UPDATE_CHECK_MS);
  if (!updated && !reg.installing && !reg.waiting) return;
  status.textContent = 'Loading update…';
  await within(changed, UPDATE_INSTALL_MS);
  if (updated) {
    location.reload();
    await new Promise(() => undefined); // the page is going away
  }
  status.textContent = 'Loading…';
}

/** The notch and the home bar (env(safe-area-inset-*)), from Dark Planet. */
function safeInsets(): Insets {
  const probe = document.createElement('div');
  probe.style.cssText = 'position:fixed;visibility:hidden;padding:env(safe-area-inset-top) env(safe-area-inset-right) ' +
    'env(safe-area-inset-bottom) env(safe-area-inset-left)';
  document.body.appendChild(probe);
  const cs = getComputedStyle(probe);
  const insets = { t: parseFloat(cs.paddingTop) || 0, r: parseFloat(cs.paddingRight) || 0,
    b: parseFloat(cs.paddingBottom) || 0, l: parseFloat(cs.paddingLeft) || 0 };
  probe.remove();
  return insets;
}

/** The touch button's fullscreen, locked to portrait where the browser allows it (as the manifest). */
async function touchFullscreen(): Promise<void> {
  await toggleFullscreen().catch(() => undefined);
  const orientation = screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> };
  if (document.fullscreenElement) await orientation.lock?.('portrait').catch(() => undefined);
}

/** The touch layout for the window, recomputed when its size changes. */
function layoutCache(): () => TouchLayout {
  let key = '';
  let layout: TouchLayout;
  return () => {
    const k = `${window.innerWidth}x${window.innerHeight}`;
    if (k !== key) {
      key = k;
      layout = touchLayout(window.innerWidth, window.innerHeight, safeInsets());
    }
    return layout;
  };
}

const merge = (...inputs: Input[]): Input => ({
  left: inputs.some((i) => i.left),
  right: inputs.some((i) => i.right),
  up: inputs.some((i) => i.up),
  fire: inputs.some((i) => i.fire),
});

async function main(): Promise<void> {
  const status = document.getElementById('status')!;
  status.textContent = 'Loading…';
  // A new version took over: reload where nothing is lost (once the game exists: no progress and no dialog).
  let updateReady = false;
  let canReload = () => true;
  await registerOffline(status, () => {
    updateReady = true;
    if (canReload()) location.reload();
  });
  const base = import.meta.env.BASE_URL + 'data/';
  const data = await loadGameData({
    json: async (name) => (await fetch(base + name)).json(),
    binary: async (name) => (await fetch(base + name)).arrayBuffer(),
  });
  for (const course of data.manifest.courses) {
    const file = highScoreFile(course);
    const stored = storedScores(file);
    if (stored) data.files.scores.set(file, stored);
  }
  const [images, sfx] = await Promise.all([
    loadImages(base, data.manifest),
    Sfx.load(base, data.manifest.sounds).catch((e) => {
      console.warn('no sounds:', e);
      return undefined;
    }),
  ]);
  status.textContent = '';

  const world = new World(data.manifest.images, data.files, Date.now() | 0); // Randomize
  world.onHighScores = (file, scores) => {
    data.files.scores.set(file, scores.map((s) => ({ ...s })));
    storeScores(file, scores);
  };
  const view = await ClassicView.create(document.getElementById('app')!, images, data.manifest);
  const keys = new Keyboard(window);
  const mouse = new Mouse(view.element, (x, y) => view.toScreen(x, y));
  // The installed app is fullscreen already (manifest); a second, element fullscreen would only add a way out to learn.
  const installedFullscreen = window.matchMedia('(display-mode: fullscreen)').matches;
  const touch = new TouchControls(document.body, installedFullscreen ? undefined : () => void touchFullscreen());
  const layout = layoutCache();
  // The touch buttons show on a phone or tablet, and from the last touch until the next mouse click.
  let touchUsed = window.matchMedia('(pointer: coarse)').matches;
  window.addEventListener('pointerdown', (e) => (touchUsed = e.pointerType !== 'mouse'), { capture: true });
  const pad = new Gamepad();
  const unlock = () => sfx?.unlock();
  for (const type of ['keydown', 'pointerdown', 'pointerup', 'touchend']) window.addEventListener(type, unlock);
  // for the browser console, and tools that drive the page (`ready` resolves once the game runs)
  if (import.meta.env.DEV) Object.assign(window, { world, view, ready: Promise.resolve() });

  let acc = 0;
  let last = performance.now();
  let paused = false;
  let dialog = false; // a dialog has the keyboard and the game waits
  // no game yet, or a course game on its first level with no points (also a new game after game over)
  canReload = () => !dialog && (world.state === GameState.None ||
    (world.state === GameState.Course && world.levelIndex === 0 && world.score === 0));
  const setPaused = (p: boolean) => {
    paused = p;
    sfx?.setHidden(p || document.hidden);
  };
  // Timer.ActiveOnly: the original stops while its window is inactive and goes on when it is active again
  document.addEventListener('visibilitychange', () => {
    acc = 0;
    last = performance.now();
    sfx?.setHidden(document.hidden || paused);
  });

  const runDialog = async (f: () => Promise<unknown>) => {
    dialog = true;
    try {
      await f();
    } finally {
      dialog = false;
      keys.clearPresses();
    }
  };
  const openCourseEditor = () => runDialog(async () => {
    const p = world.pendingHighScore;
    if (p) {
      const name = await inputBox(`${p.place + 1}. place`, 'Please enter your name (No blanks!)');
      world.enterHighScore((name ?? '').replace(/\s+/g, ''));
    }
    await courseEditor({
      course: world.course.name,
      levels: world.course.levels,
      scores: world.highScores,
      selected: p ? p.place : -1,
      courses: data.manifest.courses,
      open: (name) => {
        world.loadCourse(name);
        return { levels: world.course.levels, scores: world.highScores };
      },
    });
    world.courseEditorOpen = false;
  });

  document.body.prepend(menuBar([
    {
      label: 'Game', items: [
        { label: 'New', action: () => world.request(GameState.Course) },
        { label: 'Pause', action: () => setPaused(!paused), checked: () => paused },
      ],
    },
    {
      label: 'Level', items: [
        { label: 'New' },
        { label: 'Edit' },
        { label: 'Test', action: () => world.request(GameState.Test) },
        { label: 'Save as...' },
        { label: 'Load...' },
      ],
    },
    {
      label: 'Course', items: [
        {
          label: 'Load...', action: () => void runDialog(async () => {
            const c = await chooseCourse(data.manifest.courses, world.course.name);
            if (!c) return;
            world.loadCourse(c);
            world.request(GameState.Course);
          }),
        },
        { label: 'Editor...', action: () => world.request(GameState.CourseEditor) },
      ],
    },
  ]));

  let second = last, ticksThisSecond = 0, fps = 0; // DXTimer.FrameRate: ticks in the last second
  const frame = (now: number) => {
    acc += Math.min(now - last, TICK_MS * MAX_TICKS_PER_FRAME);
    last = now;
    if (!dialog) {
      if (keys.takePress('KeyP')) setPaused(!paused);
      if (keys.takePress('KeyF')) void toggleFullscreen();
      if (keys.takePress('F2')) world.request(GameState.Course);
    }
    if (paused || dialog) acc = 0;
    while (acc >= TICK_MS) {
      keys.sample();
      mouse.sample();
      touch.sample();
      pad.sample();
      const k = keys.input(), g = pad.input(), t = touch.input();
      if (k.left || k.right || g.left || g.right || t.left || t.right) mouse.target = null; // they take over from the mouse
      const p = world.paddle;
      const steer = p ? mouse.steer(p.x + Math.trunc(p.w / 2)) : { left: false, right: false };
      world.tick(merge(k, g, t, { ...steer, up: false, fire: mouse.fire }));
      sfx?.play(world.sounds);
      ticksThisSecond++;
      acc -= TICK_MS;
    }
    if (now - second >= 1000) {
      fps = ticksThisSecond;
      ticksThisSecond = 0;
      second = now;
    }
    if (updateReady && canReload()) {
      location.reload();
      return;
    }
    if (world.state === GameState.CourseEditor && world.courseEditorOpen && !dialog) void openCourseEditor();
    const playing = world.state === GameState.Course || world.state === GameState.Test;
    view.element.style.cursor = playing ? 'none' : 'default';
    touch.update(touchUsed, playing && !dialog, layout());
    view.setArea(touchUsed ? layout().game : null, touchUsed && layout().portrait);
    if (!paused) view.draw(world, fps);
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}

void main();
