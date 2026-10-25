// Boot: load the data, run the fixed-tick loop (TForm1.TimerTimer) and draw the picture: Remastered (the default,
// with its own menus) or Classic (the original's picture, menu bar and dialogs), switchable at any time (R).

import { Sfx } from './audio/sfx';
import { loadGameData } from './data';
import { toggleFullscreen } from './input/fullscreen';
import { Gamepad } from './input/gamepad';
import { Keyboard } from './input/keyboard';
import { Mouse } from './input/mouse';
import { TouchControls, touchLayout, type Insets, type TouchLayout } from './input/touch';
import { createApp } from './render/app';
import { ClassicView, loadImages, STRIP_H as CLASSIC_STRIP } from './render/classicView';
import { RemasterAssets } from './render/remastered/assets';
import { STRIP_H as REMASTERED_STRIP } from './render/remastered/hud';
import { RemasteredView } from './render/remasteredView';
import { loadSettings, saveSettings } from './settings';
import { highScoreFile, parseHighScores, writeHighScores, type HighScore } from './sim/files';
import { GameState, World, type Input } from './sim/world';
import { chooseCourse, courseEditor, inputBox, menuBar } from './ui/dialogs';
import { Menu } from './ui/menu';

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

/** The touch layout for the window and the HUD strip's height, recomputed when they change. */
function layoutCache(): (strip: number) => TouchLayout {
  let key = '';
  let layout: TouchLayout;
  return (strip) => {
    const k = `${window.innerWidth}x${window.innerHeight}x${strip}`;
    if (k !== key) {
      key = k;
      layout = touchLayout(window.innerWidth, window.innerHeight, safeInsets(), strip);
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
  const settings = loadSettings();
  // ?classic or ?remastered: that picture for this visit (links, tests), saved only when switched
  const query = new URLSearchParams(location.search);
  if (query.has('classic')) settings.remastered = false;
  if (query.has('remastered')) settings.remastered = true;
  if (!data.manifest.courses.includes(settings.course)) settings.course = data.manifest.courses[0];
  const remasterAssets = (images: Parameters<typeof RemasterAssets.load>[1]) =>
    RemasterAssets.load(import.meta.env.BASE_URL, images, data.manifest);
  const [images, sfx] = await Promise.all([
    loadImages(base, data.manifest),
    Sfx.load(base, data.manifest.sounds).catch((e) => {
      console.warn('no sounds:', e);
      return undefined;
    }),
  ]);

  const world = new World(data.manifest.images, data.files, Date.now() | 0); // Randomize
  world.onHighScores = (file, scores) => {
    data.files.scores.set(file, scores.map((s) => ({ ...s })));
    storeScores(file, scores);
  };
  const app = await createApp(document.getElementById('app')!);
  const classic = new ClassicView(app, images, data.manifest);
  // The Remastered graphics load when first needed (at once, as it is the default); until then, or if they can't
  // load, the Classic picture shows.
  let remastered: RemasteredView | null = null;
  let remasterLoading: Promise<RemasteredView | null> | null = null;
  const loadRemastered = () => remasterLoading ??= RemasteredView.create(app, import.meta.env.BASE_URL, remasterAssets(images))
    .then((v) => (remastered = v))
    .catch((e) => {
      console.warn('no remastered graphics:', e);
      return null;
    });
  if (settings.remastered) await loadRemastered();
  status.textContent = '';
  const useRemastered = () => settings.remastered && remastered !== null;
  const view = () => (useRemastered() ? remastered! : classic);

  const keys = new Keyboard(window);
  const mouse = new Mouse(app.canvas, (x, y) => view().toScreen(x, y));
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
  if (import.meta.env.DEV) {
    Object.assign(window, { world, ready: Promise.resolve(), settings });
    Object.defineProperty(window, 'view', { get: view, configurable: true });
  }

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

  // ---- the Remastered menus

  const startCourse = () => {
    world.loadCourse(settings.course);
    world.request(GameState.Course);
    menu.close();
    setPaused(false);
  };
  const menu: Menu = new Menu(document.body, {
    courses: () => data.manifest.courses.map((file) => ({
      file,
      levels: data.files.courses.get(file)?.filter((l) => data.files.levels.has(l)).length ?? 0,
      scores: data.files.scores.get(highScoreFile(file)) ?? [],
    })),
    course: () => settings.course,
    setCourse: (file) => {
      settings.course = file;
      saveSettings(settings);
    },
    play: startCourse,
    remastered: () => settings.remastered,
    setRemastered: (on) => setRemastered(on),
    fullscreen: document.fullscreenEnabled && !installedFullscreen ? () => void toggleFullscreen().catch(() => undefined) : undefined,
    isFullscreen: () => document.fullscreenElement !== null,
    resume: () => {
      menu.close();
      setPaused(false);
    },
  });
  document.addEventListener('fullscreenchange', () => menu.refresh());
  if (import.meta.env.DEV) Object.assign(window, { menu, startCourse, pause: (p = true) => setPaused(p) });
  const openPause = () => {
    if (!useRemastered() || dialog || menu.open) return;
    if (world.state === GameState.None) menu.showTitle();
    else menu.showPause();
  };
  touch.onMenu = null;

  /** The name for a high score, remembered for the next one (Cancel keeps the old one). */
  const enterName = (name: string | null) => {
    if (name) {
      settings.name = name;
      saveSettings(settings);
    }
    world.enterHighScore(name ?? '');
  };
  /** The high-score name: the Remastered menu, or Classic's prompt and course editor dialog. */
  const openCourseEditor = () => runDialog(async () => {
    const p = world.pendingHighScore;
    if (useRemastered()) {
      if (p) enterName(await menu.askName(p.place, p.score, settings.name));
      const choice = await menu.showDone();
      world.courseEditorOpen = false; // CourseEditorTick: a new game on the next tick
      if (choice === 'menu') {
        world.state = GameState.None; // no new game until Play
        menu.showTitle();
      } else menu.close();
      return;
    }
    if (p) {
      const name = await inputBox(`${p.place + 1}. place`, 'Please enter your name (No blanks!)', settings.name);
      enterName(name === null ? null : name.replace(/\s+/g, ''));
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

  const bar = menuBar([
    {
      label: 'Game', items: [
        { label: 'New', action: () => world.request(GameState.Course) },
        { label: 'Pause', action: () => setPaused(!paused), checked: () => paused },
        { label: 'Remastered', action: () => setRemastered(true) },
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
  ]);
  document.body.prepend(bar);

  /** Switch the graphics (R, the menus): the game goes on as it is. */
  function setRemastered(on: boolean): void {
    settings.remastered = on;
    saveSettings(settings);
    if (on && !remastered) {
      void loadRemastered().then(() => applyMode());
    }
    applyMode();
    menu.refresh();
  }
  function applyMode(): void {
    const r = useRemastered();
    classic.visible = !r;
    if (remastered) remastered.visible = r;
    bar.hidden = r;
    touch.onMenu = r ? openPause : null;
    if (!r && menu.open) {
      // Classic has no menu screen: go on with the game, or start one as the original does at launch
      menu.close();
      setPaused(false);
      if (world.state === GameState.None) world.request(GameState.Course);
    }
  }
  if (useRemastered()) {
    world.request(GameState.None); // the title screen first
    menu.showTitle();
  }
  applyMode();

  let second = last, ticksThisSecond = 0, fps = 0; // DXTimer.FrameRate: ticks in the last second
  let padPrev = { up: false, down: false, left: false, right: false, ok: false, back: false, start: false };
  const frame = (now: number) => {
    acc += Math.min(now - last, TICK_MS * MAX_TICKS_PER_FRAME);
    last = now;
    if (keys.takePress('KeyR') && !dialog) setRemastered(!settings.remastered);
    if (keys.takePress('KeyF') && (!dialog || menu.open)) void toggleFullscreen();
    if (!dialog && !menu.open) {
      if (keys.takePress('KeyP')) setPaused(!paused);
      if (keys.takePress('F2')) world.request(GameState.Course);
      if (keys.takePress('Escape')) openPause();
    }
    // the gamepad in the menus: d-pad / stick, A, B; Start opens the pause menu
    pad.sample();
    const gp = navigator.getGamepads?.().find((p) => p?.connected) ?? null;
    if (gp) {
      const b = (i: number) => gp.buttons[i]?.pressed ?? false;
      const cur = { up: b(12) || gp.axes[1] < -0.5, down: b(13) || gp.axes[1] > 0.5, left: b(14) || gp.axes[0] < -0.5,
        right: b(15) || gp.axes[0] > 0.5, ok: b(0), back: b(1), start: b(9) };
      if (menu.open) {
        for (const k of ['up', 'down', 'left', 'right', 'ok', 'back'] as const) if (cur[k] && !padPrev[k]) menu.nav(k);
        if (cur.start && !padPrev.start && menu.paused) menu.nav('back');
      } else if (cur.start && !padPrev.start) openPause();
      padPrev = cur;
    }
    if (paused || dialog || menu.open) acc = 0;
    const r = useRemastered() ? remastered : null;
    while (acc >= TICK_MS) {
      keys.sample();
      mouse.sample();
      touch.sample();
      const k = keys.input(), g = pad.input(), t = touch.input();
      if (k.left || k.right || g.left || g.right || t.left || t.right) mouse.target = null; // they take over from the mouse
      const p = world.paddle;
      const steer = p ? mouse.steer(p.x + Math.trunc(p.w / 2)) : { left: false, right: false };
      r?.beforeTick(world);
      world.tick(merge(k, g, t, { ...steer, up: false, fire: mouse.fire }));
      r?.afterTick(world);
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
    app.canvas.style.cursor = playing && !menu.open ? 'none' : 'default';
    const strip = r ? REMASTERED_STRIP : CLASSIC_STRIP;
    touch.update(touchUsed, playing && !dialog && !menu.open, layout(strip));
    if (r) r.touch = touchUsed;
    view().setArea(touchUsed ? layout(strip).game : null, touchUsed && layout(strip).portrait);
    if (r) r.draw(world, paused || dialog || menu.open ? 0 : acc / TICK_MS);
    else if (!paused) classic.draw(world, fps);
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}

void main();
