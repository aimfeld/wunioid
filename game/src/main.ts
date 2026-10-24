// Boot: load the data, run the fixed-tick loop (TForm1.TimerTimer) and draw the Classic picture.

import { Sfx } from './audio/sfx';
import { loadGameData } from './data';
import { toggleFullscreen } from './input/fullscreen';
import { Gamepad } from './input/gamepad';
import { Keyboard } from './input/keyboard';
import { Pointer } from './input/pointer';
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

/**
 * The service worker (sw.js, written by the build) caches the game for the installed app and offline play. A new
 * version installs in the background and is used from the next start. Also asks to keep the storage (high scores).
 */
function registerOffline(): void {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;
  navigator.storage?.persist?.().catch(() => undefined);
  navigator.serviceWorker.register(import.meta.env.BASE_URL + 'sw.js', { updateViaCache: 'none' }).then((reg) => {
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) reg.update().catch(() => undefined);
    });
  }, (e) => console.warn('no service worker:', e));
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
  registerOffline();

  const world = new World(data.manifest.images, data.files, Date.now() | 0); // Randomize
  world.onHighScores = (file, scores) => {
    data.files.scores.set(file, scores.map((s) => ({ ...s })));
    storeScores(file, scores);
  };
  const view = await ClassicView.create(document.getElementById('app')!, images, data.manifest);
  const keys = new Keyboard(window);
  const pointer = new Pointer(view.element, (x, y) => view.toScreen(x, y));
  const pad = new Gamepad();
  const unlock = () => sfx?.unlock();
  for (const type of ['keydown', 'pointerdown', 'pointerup', 'touchend']) window.addEventListener(type, unlock);
  // for the browser console, and tools that drive the page (`ready` resolves once the game runs)
  if (import.meta.env.DEV) Object.assign(window, { world, view, ready: Promise.resolve() });

  let acc = 0;
  let last = performance.now();
  let paused = false;
  let dialog = false; // a dialog has the keyboard and the game waits
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
      pointer.sample();
      pad.sample();
      const k = keys.input(), g = pad.input();
      if (k.left || k.right || g.left || g.right) pointer.target = null; // the keys take over from the pointer
      const p = world.paddle;
      const steer = p ? pointer.steer(p.x + Math.trunc(p.w / 2)) : { left: false, right: false };
      world.tick(merge(k, g, { ...steer, up: false, fire: pointer.fire }));
      sfx?.play(world.sounds);
      ticksThisSecond++;
      acc -= TICK_MS;
    }
    if (now - second >= 1000) {
      fps = ticksThisSecond;
      ticksThisSecond = 0;
      second = now;
    }
    if (world.state === GameState.CourseEditor && world.courseEditorOpen && !dialog) void openCourseEditor();
    view.element.style.cursor = world.state === GameState.Course || world.state === GameState.Test ? 'none' : 'default';
    if (!paused) view.draw(world, fps);
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}

void main();
