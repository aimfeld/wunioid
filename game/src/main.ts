// Boot: load the data, run the fixed-tick loop (TForm1.TimerTimer) and draw the picture: Remastered (the default,
// with its own menus and one editor for a course and its levels) or Classic (the original's picture, menu bar,
// dialogs and two editors), switchable at any time (R). Remastered has music (audio/music.ts).

import { Music, VOLUMES, type Wanted } from './audio/music';
import { createAudioContext, Sfx } from './audio/sfx';
import { loadGameData } from './data';
import { EditorProject } from './editorProject';
import { toggleFullscreen } from './input/fullscreen';
import { Gamepad } from './input/gamepad';
import { Keyboard } from './input/keyboard';
import { Mouse } from './input/mouse';
import { TouchControls, touchLayout, type Insets, type TouchLayout } from './input/touch';
import { createApp } from './render/app';
import { ClassicView, loadImages, STRIP_H as CLASSIC_STRIP } from './render/classicView';
import { RemasterAssets } from './render/remastered/assets';
import { STRIP_H as REMASTERED_STRIP } from './render/remastered/hud';
import { onBrushes, onEraser } from './render/remastered/palette';
import { RemasteredView } from './render/remasteredView';
import { Thumbnails } from './render/thumbnail';
import { loadSettings, saveSettings } from './settings';
import { highScoreFile, writeCourse } from './sim/files';
import { GameState, NO_NAME, World, type Input } from './sim/world';
import { download, importFiles, loadStoredFiles, sortedNames, storeCourse, storeLevel, storeScores } from './storage';
import { courseEditor, fileDialog, inputBox, menuBar } from './ui/dialogs';
import { EditorPanel } from './ui/editorPanel';
import { Menu } from './ui/menu';

const TICK_MS = 22; // decision 6: the DXTimer's interval, 1000/22 ≈ 45.45 ticks per second
const MAX_TICKS_PER_FRAME = 8; // after a stall, catch up at most this much

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
  loadStoredFiles(data.files);
  const courseNames = () => sortedNames(data.files.courses.keys());
  const levelNames = () => sortedNames(data.files.levels.keys());
  const settings = loadSettings();
  // ?classic or ?remastered: that picture for this visit (links, tests), saved only when switched
  const query = new URLSearchParams(location.search);
  if (query.has('classic')) settings.remastered = false;
  if (query.has('remastered')) settings.remastered = true;
  if (!data.files.courses.has(settings.course)) settings.course = courseNames()[0];
  const remasterAssets = (images: Parameters<typeof RemasterAssets.load>[1]) =>
    RemasterAssets.load(import.meta.env.BASE_URL, images, data.manifest);
  const audio = createAudioContext();
  const [images, sfx, music] = await Promise.all([
    loadImages(base, data.manifest),
    Sfx.load(audio, base, data.manifest.sounds).catch((e) => {
      console.warn('no sounds:', e);
      return undefined;
    }),
    Music.load(audio, import.meta.env.BASE_URL + 'music/').catch((e) => {
      console.warn('no music:', e);
      return undefined;
    }),
  ]);
  if (!(settings.music in VOLUMES)) settings.music = 2;
  music?.setVolume(VOLUMES[settings.music]);

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
  // Browsers start audio only after a user gesture; iOS has a further state, "interrupted" (a call, the app in the
  // background), that also needs a resume.
  const unlock = () => {
    if (audio.state !== 'running' && audio.state !== 'closed') void audio.resume();
  };
  /** The page is hidden or the game paused: hold the effects and the music. */
  const setHidden = (hidden: boolean) => {
    if (hidden) void audio.suspend();
    else unlock();
  };
  for (const type of ['keydown', 'pointerdown', 'pointerup', 'touchend']) window.addEventListener(type, unlock);
  // for the browser console, and tools that drive the page (`ready` resolves once the game runs)
  if (import.meta.env.DEV) {
    Object.assign(window, { world, ready: Promise.resolve(), settings, music });
    Object.defineProperty(window, 'view', { get: view, configurable: true });
  }

  let acc = 0;
  let last = performance.now();
  let paused = false;
  let dialog = false; // a dialog has the keyboard and the game waits
  // no game yet, or a course game on its first level with no points (also a new game after game over)
  canReload = () => !dialog && !project?.dirty && (world.state === GameState.None ||
    (world.state === GameState.Course && world.levelIndex === 0 && world.score === 0));
  const setPaused = (p: boolean) => {
    paused = p;
    setHidden(p || document.hidden);
  };
  // Timer.ActiveOnly: the original stops while its window is inactive and goes on when it is active again
  document.addEventListener('visibilitychange', () => {
    acc = 0;
    last = performance.now();
    setHidden(document.hidden || paused);
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

  const go = (state: GameState) => {
    world.request(state);
    menu.close();
    setPaused(false);
  };
  const startCourse = () => {
    fromEditor = false;
    world.loadCourse(settings.course);
    go(GameState.Course);
  };

  // ---- the Remastered editor: a course and its levels (editorProject.ts), the course panel beside the picture

  const thumbs = new Thumbnails(images, data.manifest);
  let project: EditorProject | null = null;
  let fromEditor = false; // a course game started from the editor
  /** The course being edited; the first time, the course chosen for Play. */
  const theProject = () => {
    if (!project) {
      project = new EditorProject(data.files, { level: storeLevel, course: storeCourse });
      project.open(settings.course);
    }
    return project;
  };
  /** The level editor on the project's current level: the world edits its buffer in place. */
  const editProject = () => {
    fromEditor = false;
    world.level = theProject().level;
    go(GameState.Editor);
  };
  /** Save the project; a new course asks for its name first. False if cancelled. */
  const saveProject = async (): Promise<boolean> => {
    const p = theProject();
    const name = p.name ?? await menu.pickFile({ title: 'Save course as', save: true, ext: 'cse', value: '' });
    if (!name) return false;
    p.save(name);
    return true;
  };
  /** Save, then a game of the course from its first level (with its high scores). */
  const playProject = async () => {
    if (!(await saveProject())) return;
    const name = theProject().name!;
    settings.course = name;
    saveSettings(settings);
    world.loadCourse(name);
    go(GameState.Course);
    fromEditor = true;
  };
  window.addEventListener('beforeunload', (e) => {
    if (project?.dirty) e.preventDefault();
  });
  const menu: Menu = new Menu(document.body, {
    courses: () => courseNames().map((file) => ({
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
    music: music ? () => settings.music : undefined,
    setMusic: (v) => {
      settings.music = v;
      saveSettings(settings);
      music?.setVolume(VOLUMES[v]);
    },
    fullscreen: document.fullscreenEnabled && !installedFullscreen ? () => void toggleFullscreen().catch(() => undefined) : undefined,
    isFullscreen: () => document.fullscreenElement !== null,
    resume: () => {
      menu.close();
      setPaused(false);
    },
    editor: {
      open: editProject,
      canReturn: () => world.state === GameState.Test || fromEditor,
      courseName: () => theProject().name,
      dirty: () => theProject().dirty,
      newCourse: () => {
        theProject().newCourse();
        panel.render();
        editProject();
      },
      openCourse: (name) => {
        theProject().open(name);
        panel.render();
        editProject();
      },
      saveCourseAs: (name) => {
        theProject().save(name);
        panel.render();
      },
      levels: levelNames,
      courses: courseNames,
      importFiles: (files) => importer(files),
      download: (name) => download(name, /\.lev$/i.test(name) ? data.files.levels.get(name)! : writeCourse(data.files.courses.get(name)!)),
      downloadLevel: () => {
        const p = theProject();
        download(p.entries[p.current], new Uint8Array(p.level));
      },
      downloadCourse: () => {
        const p = theProject();
        download(p.name ?? `${NO_NAME}.cse`, writeCourse(p.entries));
      },
      resetHighScores: () => {
        const name = theProject().name;
        if (!name) return;
        data.files.scores.set(highScoreFile(name), []);
        storeScores(highScoreFile(name), []);
        if (world.course.name === name) world.highScores = [];
      },
      thumbnail: (name) => {
        const level = data.files.levels.get(name);
        if (!level) return null;
        const c = document.createElement('canvas');
        thumbs.draw(c, level, 54);
        return c;
      },
    },
  });
  const panel = new EditorPanel(document.body, {
    project: theProject,
    thumbs,
    edit: editProject,
    pickLevel: () => menu.pickFile({ title: 'Add level', save: false, ext: 'lev', value: '' }),
    save: saveProject,
    play: () => void playProject(),
    test: () => go(GameState.Test),
    menu: () => openPause(),
  });
  document.addEventListener('fullscreenchange', () => menu.refresh());
  if (import.meta.env.DEV) Object.assign(window, { menu, startCourse, editProject, pause: (p = true) => setPaused(p) });

  // The level editor: DrawMouseDown, the left button places, the right one clears (no context menu over the
  // picture). Both pictures paint along a drag (the original takes clicks only). Remastered adds the palette's
  // eraser (touch has no right button).
  let erase = false;
  let painted = ''; // the cell the drag last painted
  const editorClick = (e: PointerEvent, drag: boolean) => {
    if (world.state !== GameState.Editor || dialog || menu.open) return;
    const [fx, fy] = view().toScreen(e.clientX, e.clientY);
    const x = Math.floor(fx), y = Math.floor(fy);
    const r = useRemastered();
    const cell = `${Math.trunc((x - 19) / 30)},${Math.trunc((y - 19) / 15)}`;
    if (drag) {
      const right = (e.buttons & 2) !== 0;
      if (!(e.buttons & 3) || cell === painted || x > 414) return;
      painted = cell;
      place(x, y, right);
      return;
    }
    painted = cell;
    if (r && onEraser(x, y)) {
      erase = true;
      return;
    }
    if (r && onBrushes(x, y)) erase = false;
    place(x, y, e.button === 2);
  };
  /** A click; the eraser is a right click with a stone brush (an attribute brush only clears the attribute). */
  const place = (x: number, y: number, right: boolean) => {
    if (useRemastered() && erase && x < 414) {
      const attr = world.brushAttr;
      world.brushAttr = false;
      world.editorMouseDown(x, y, true);
      world.brushAttr = attr;
    } else world.editorMouseDown(x, y, right);
    panel.painted();
  };
  app.canvas.addEventListener('pointerdown', (e) => editorClick(e, false));
  app.canvas.addEventListener('pointermove', (e) => editorClick(e, true));
  app.canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  const openPause = () => {
    if (!useRemastered() || dialog || menu.open) return;
    // a test game (Remastered starts one only from the editor): straight back to the editor
    if (world.state === GameState.Test) return go(GameState.Editor);
    if (world.state === GameState.None) menu.showTitle();
    else if (world.state === GameState.Editor) menu.showEditor();
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
      } else if (choice === 'editor') editProject();
      else menu.close();
      return;
    }
    if (p) {
      const name = await inputBox(`${p.place + 1}. place`, 'Please enter your name (No blanks!)', settings.name);
      enterName(name === null ? null : name.replace(/\s+/g, ''));
    }
    await courseEditor({
      world,
      selected: p ? p.place : -1,
      chooseLevel: () => levelDialog({ title: 'Add level to course' }),
      chooseCourse: (save) => courseDialog(save),
      open: (name) => world.loadCourse(name),
      save: saveCourse,
    });
    world.courseEditorOpen = false;
  });

  // ---- files: the open and save dialogs over the shipped and the player's files

  const importer = (files: File[]) => importFiles(files, data.files);
  const levelDialog = (o: { title?: string; save?: boolean; value?: string } = {}) => fileDialog({
    ...o, names: levelNames, filter: 'Level Files (*.lev)', ext: 'lev', import: importer,
    download: (name) => download(name, data.files.levels.get(name)!),
  });
  const courseDialog = (save: boolean) => fileDialog({
    save, value: save ? world.course.name : '', names: courseNames, filter: 'Course Files (*.cse)', ext: 'cse',
    import: importer, download: (name) => download(name, writeCourse(data.files.courses.get(name)!)),
  });
  /** SaveCourseAs (0x41c318): the course under the name chosen. */
  const saveCourse = (name: string) => {
    world.courseSaved(name);
    storeCourse(name, world.course.levels);
  };
  /** The level buffer to a file. */
  let levelName = '';
  const writeLevel = (name: string) => {
    levelName = name;
    const level = new Uint8Array(world.level);
    data.files.levels.set(name, level);
    storeLevel(name, level);
  };
  /** Level ▸ Save as (Save1Click 0x41b824): the editor goes on. */
  const saveLevelAs = () => runDialog(async () => {
    const name = await levelDialog({ save: true, value: levelName });
    if (name) writeLevel(name);
  });
  /** Level ▸ Load (Load1Click 0x41baa0): a level file into the buffer, then a test game (also after Cancel). */
  const loadLevel = () => runDialog(async () => {
    const name = await levelDialog({ value: levelName });
    if (name) {
      levelName = name;
      world.loadLevel(name);
    }
    world.request(GameState.Test);
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
        { label: 'New', action: () => world.newLevel() },
        { label: 'Edit', action: () => world.request(GameState.Editor) },
        { label: 'Test', action: () => world.request(GameState.Test) },
        { label: 'Save as...', action: () => void saveLevelAs() },
        { label: 'Load...', action: () => void loadLevel() },
      ],
    },
    {
      label: 'Course', items: [
        {
          label: 'Load...', action: () => void runDialog(async () => {
            const c = await courseDialog(false);
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
    world.keepBrush = r;
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

  /**
   * The music (Remastered only, decision 14): the menu track on the title screen, in the menus and the editor;
   * in a game the level's track, (level − 1) mod N, from its start at each level (and each new game), fading out
   * at "Well done" and "Game over", held while the pause menu is open.
   */
  const musicWanted = (): Wanted => {
    if (!music || !useRemastered()) return { track: null, key: '', fade: false, hold: false };
    if (world.state === GameState.Course || world.state === GameState.Test) {
      const level = world.state === GameState.Test ? (project?.current ?? 0) + 1 : world.levelIndex + 1;
      return { track: music.levelTrack(level), key: `level ${world.levelStarts}`,
        fade: world.levelDonePhase || world.gameOver, hold: menu.open || dialog };
    }
    return { track: music.playlist.menu, key: 'menu', fade: false, hold: false };
  };

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
    music?.want(musicWanted());
    const playing = world.state === GameState.Course || world.state === GameState.Test;
    app.canvas.style.cursor = playing && !menu.open ? 'none' : 'default';
    const strip = r ? REMASTERED_STRIP : CLASSIC_STRIP;
    touch.update(touchUsed, playing && !dialog && !menu.open, layout(strip));
    if (r) {
      r.touch = touchUsed;
      r.hud.erase = erase;
    }
    // the editor needs the palette beside the playfield (never the portrait strip), and has no touch buttons;
    // Remastered's has the course panel beside the picture
    const editing = world.state === GameState.Editor;
    panel.visible = r !== null && editing;
    panel.update();
    if (panel.visible) view().setArea(panel.place(window.innerWidth, window.innerHeight));
    else view().setArea(touchUsed && !editing ? layout(strip).game : null, touchUsed && layout(strip).portrait && !editing);
    if (r) r.draw(world, paused || dialog || menu.open ? 0 : acc / TICK_MS);
    else if (!paused) classic.draw(world, fps);
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}

void main();
