// The game state and flow of TForm1: the sprite engine, the stone grid, collisions, PlayTick and the game states.
// One World.tick() is one DXTimer event. The original's nested loops (blocking banners, the "Well done" phase)
// draw a frame per iteration; here they run one iteration per tick (decision 7), as a generator.

import { COLS, cellOffset, emptyLevel, highScoreFile, levelTile, ROWS, type HighScore, type Level } from './files';
import { DelphiRandom, normAngle } from './numeric';
import {
  Ball, Frame, Paddle, PaddleKind, Sprite, Stone, StoneAttr, StoneKind, TextSprite, Tiles, type Bonus, type Shot,
} from './sprites';

export interface ImageInfo {
  width: number;
  height: number;
  frames: number;
}

/** What the paddle reads from DXInput each tick: states Up, Left, Right, Button1 (TPaddle.DoMove). */
export interface Input {
  left: boolean;
  right: boolean;
  up: boolean;
  fire: boolean;
}

export const NO_INPUT: Input = { left: false, right: false, up: false, fire: false };

/** The original's game states (0x41e274). */
export const enum GameState {
  None = 0,
  Course = 1,
  Test = 2,
  Editor = 3,
  CourseEditor = 4,
}

/** The files the game reads: levels, courses (level lists) and high-score tables by file name. */
export interface Files {
  levels: Map<string, Level>;
  courses: Map<string, string[]>;
  scores: Map<string, HighScore[]>;
}

const GRID_COLS = 15; // TStone[15][19]: cols 1…13, rows 1…17 used, the border stays nil
const GRID_ROWS = 19;
export const DEFAULT_COURSE = 'default.cse';
/** TCourseEditor.AddHighScore keeps nothing for an unsaved course. */
const NO_NAME = 'NoName';

export class World {
  readonly rng: DelphiRandom;
  input: Input = NO_INPUT;
  /** The sprite engine's list, in creation order (SpriteEngine.Move moves them in this order). */
  sprites: Sprite[] = [];
  private drawCounter = 0;
  /** Sounds played this tick (WaveList names), for the audio. */
  sounds: string[] = [];

  paddle: Paddle | null = null;
  private grid: (Stone | null)[] = new Array(GRID_COLS * GRID_ROWS).fill(null);
  balls: Ball[] = [];
  shots: Shot[] = [];
  bonuses: Bonus[] = [];
  tiles: Tiles | null = null;
  /** The current non-blocking banner (0x4212f0). */
  text: TextSprite | null = null;

  level: Level = emptyLevel(); // the level buffer (0x421120)
  score = 0;
  lives = 0; // spare lives
  stonesLeft = 0; // counting stones (0x4212e4)
  levelIndex = 0; // in the course, 0-based
  endCollected = false; // the End capsule (0x4212ec)
  levelDonePhase = false; // "Well done": capsules can't be collected (0x4212f4)

  state = GameState.None;
  /** A state to start on the next tick (0x41e278); 1 at launch: a course game starts at once. */
  requested = GameState.Course;
  course = { name: '', levels: [] as string[] };
  highScores: HighScore[] = [];
  /** The course editor dialog is shown (state 4 starts a new game when it closes). */
  courseEditorOpen = false;
  /** A high score waiting for its name (TCourseEditor.AddHighScore's InputBox). */
  pendingHighScore: { score: number; level: number; place: number } | null = null;
  /** Called with the file name and the table whenever a course's high scores change. */
  onHighScores: ((file: string, scores: HighScore[]) => void) | null = null;

  /** The running PlayTick, while one of its loops waits for the next tick. */
  private flow: Generator<void, void, void> | null = null;

  constructor(readonly images: Record<string, ImageInfo>, readonly files: Files, seed = 0) {
    this.rng = new DelphiRandom(seed);
  }

  random(n: number): number {
    return this.rng.next(n);
  }

  sound(name: string): void {
    this.sounds.push(name);
  }

  /** TSprite.Add: a new sprite at the end of the engine list. Returns its draw sequence. */
  add(s: Sprite): number {
    this.sprites.push(s);
    return this.nextDrawSeq();
  }

  nextDrawSeq(): number {
    return ++this.drawCounter;
  }

  /** The sprites to draw, in DelphiX's order: by Z, and among equal Z the newest first (underneath). */
  drawList(): Sprite[] {
    return this.sprites.filter((s) => s.visible).sort((a, b) => a.z - b.z || b.drawSeq - a.drawSeq);
  }

  cell(col: number, row: number): Stone | null {
    if (col < 0 || col >= GRID_COLS || row < 0 || row >= GRID_ROWS) return null;
    return this.grid[col * GRID_ROWS + row];
  }

  setCell(col: number, row: number, s: Stone | null): void {
    this.grid[col * GRID_ROWS + row] = s;
  }

  /** (kind, attribute) of a level-buffer cell. */
  levelCell(col: number, row: number): [StoneKind, StoneAttr] {
    const o = cellOffset(col, row);
    return [this.level[o], this.level[o + 1]];
  }

  // ---- sprite engine

  /** SpriteEngine.Move(20): every sprite's DoMove, the ones created meanwhile from the next tick on. */
  private move(): void {
    for (let i = 0, n = this.sprites.length; i < n; i++) this.sprites[i].doMove();
  }

  /** SpriteEngine.Dead: free the sprites that died. */
  private freeDead(): void {
    if (this.sprites.some((s) => s.dead)) this.sprites = this.sprites.filter((s) => !s.dead);
  }

  // ---- collisions

  /** TForm1.Collisions (0x41a010), once per tick after all DoMoves. */
  collisions(): void {
    const paddle = this.paddle!, balls = this.balls, shots = this.shots;
    // 1. ball - paddle
    for (let i = 0, n = balls.length; i < n; i++) {
      const b = balls[i];
      if (b.glued || !b.overlaps(paddle) || !(b.dy > 0) || !(b.y < paddle.y)) continue;
      b.reflect(0); // a ball coming down at a: −a ≤ 0, so Reflect leaves 1440 − a
      b.angle = Math.min(160, Math.max(20, normAngle(b.angle) + paddle.offset(b)));
      b.setDirection();
      if (paddle.glueTimer > 0) {
        b.glued = true;
        b.y = paddle.y - b.h;
      }
      this.sound(this.random(2) === 0 ? 'PaddleBall' : 'PaddleBall2');
    }
    // 2. ball - stone, last ball first; the index is checked again for each stone (an Eater removes balls)
    for (let i = balls.length - 1; i >= 0; i--) {
      if (balls[i].glued) continue;
      for (let c = 1; c <= COLS; c++) {
        for (let r = 1; r <= ROWS; r++) {
          const s = this.cell(c, r);
          if (s && s.visible && i <= balls.length - 1 && balls[i].overlaps(s)) balls[i].bounceOffStone(s);
        }
      }
    }
    // 3. shot - stone
    for (let i = shots.length - 1; i >= 0; i--) {
      for (let c = 1; c <= COLS; c++) {
        for (let r = 1; r <= ROWS; r++) {
          const s = this.cell(c, r);
          if (s && s.visible && i <= shots.length - 1 && shots[i].overlaps(s)) shots[i].hitStone(s);
        }
      }
    }
    // 4. Move stones turn when they run into another visible stone
    for (let c = 1; c <= COLS; c++) {
      for (let r = 1; r <= ROWS; r++) {
        const m = this.cell(c, r);
        if (!m || m.attr !== StoneAttr.Move) continue;
        for (let c2 = 1; c2 <= COLS; c2++) {
          for (let r2 = 1; r2 <= ROWS; r2++) {
            const o = this.cell(c2, r2);
            if (o && (c2 !== c || r2 !== r) && o.visible && m.overlaps(o)) m.dir = m.x <= o.x ? -1 : 1;
          }
        }
      }
    }
    // 5. capsules - paddle
    if (this.levelDonePhase) return;
    for (let i = this.bonuses.length - 1; i >= 0; i--) {
      if (i <= this.bonuses.length - 1 && this.bonuses[i].overlaps(paddle)) this.bonuses[i].collect();
    }
  }

  // ---- texts

  /** TForm1.ShowText (0x41afb0), non-blocking: replaces the current banner. */
  showText(name: string, ticks: number): void {
    this.dropText();
    this.text = new TextSprite(this, name, ticks);
  }

  private dropText(): void {
    if (this.text) {
      this.text.die();
      this.text = null;
    }
  }

  /** ShowText blocking: only the banner moves, ticks − 1 iterations (TTextSprite.Create's loop). */
  private *showTextBlocking(name: string, ticks: number): Generator<void, void, void> {
    this.dropText();
    const t = new TextSprite(this, name, ticks);
    let n = ticks;
    do {
      n--;
      t.doMove();
      this.freeDead();
      yield;
    } while (n !== 1);
  }

  // ---- levels and games

  /** TForm1.ClearLevel (0x41b704). */
  private clearLevel(): void {
    this.sprites = [];
    this.paddle = null;
    this.grid.fill(null);
    this.tiles = null;
    this.shots = [];
    this.balls = [];
    this.bonuses = [];
    this.text = null;
  }

  /** TForm1.CreateStones (0x41ae50). */
  private createStones(): void {
    this.stonesLeft = 0;
    for (let c = 1; c <= COLS; c++) {
      for (let r = 1; r <= ROWS; r++) {
        if (this.level[cellOffset(c, r)] !== 0) this.setCell(c, r, new Stone(this, 0, r, c));
      }
    }
  }

  /** TForm1.CreateBackground (0x41aed0). */
  private createBackground(): void {
    const tile = levelTile(this.level);
    if (tile !== 0) this.tiles = new Tiles(this, tile);
  }

  /** TForm1.StartLevel (0x41a5dc). */
  private startLevel(): void {
    this.clearLevel();
    new Frame(this);
    new Paddle(this);
    new Ball(this);
    this.createStones();
    this.createBackground();
    this.endCollected = false;
    this.levelDonePhase = false;
  }

  /** TForm1.LoadLevel (0x41b9d8): a file from Levels\ into the level buffer. */
  loadLevel(name: string): void {
    const level = this.files.levels.get(name);
    if (!level) throw new Error(`no level ${name}`);
    this.level = new Uint8Array(level);
  }

  /** TCourseEditor.LoadCourse (0x41c898): the course, its high scores, without levels that don't exist. */
  loadCourse(name: string): void {
    const levels = this.files.courses.get(name);
    if (!levels) throw new Error(`no course ${name}`);
    this.course = { name, levels: levels.filter((l) => this.files.levels.has(l)) };
    this.highScores = (this.files.scores.get(highScoreFile(name)) ?? []).map((s) => ({ ...s }));
  }

  private lastLevelIndex(): number {
    return this.course.levels.length - 1;
  }

  /** TForm1.StartGame (0x41a6a4): state 1. */
  private startGame(): void {
    this.levelIndex = 0;
    this.score = 0;
    this.lives = 3;
    if (this.course.levels.length === 0) this.loadCourse(DEFAULT_COURSE);
    this.loadLevel(this.course.levels[0]);
    this.startLevel();
    this.showText('Letsgo', 100);
  }

  /** TForm1.StartTest (0x41a68c): state 2, the level in the buffer. */
  private startTest(): void {
    this.score = 0;
    this.lives = 3;
    this.startLevel();
  }

  /** TForm1.StartEditor (0x41a940): state 3, the level with its attribute labels (editing is Phase 4). */
  private startEditor(): void {
    this.clearLevel();
    new Frame(this);
    this.createStones();
    this.createBackground();
  }

  /** TForm1.ShowCourseEditor (0x41a9b8): the course editor dialog, the game is hidden. */
  private showCourseEditor(): void {
    this.courseEditorOpen = true;
  }

  // ---- high scores (CourseEdit)

  /** TCourseEditor.IsHighScore (0x41ca28). */
  isHighScore(score: number): boolean {
    const t = this.highScores;
    return t.length === 10 ? t[t.length - 1].score < score : true;
  }

  /** TCourseEditor.HighScorePlace (0x41ca78): before the first lower score. */
  private highScorePlace(score: number): number {
    const i = this.highScores.findIndex((s) => s.score < score);
    return i < 0 ? this.highScores.length : i;
  }

  /** TCourseEditor.AddHighScore (0x41cb34), up to the name prompt; enterHighScore completes it. */
  private addHighScore(score: number, level: number): void {
    if (this.course.name === NO_NAME) return;
    this.pendingHighScore = { score, level, place: this.highScorePlace(score) };
  }

  /** The name from the prompt "<n>. place / Please enter your name (No blanks!)". */
  enterHighScore(name: string): void {
    const p = this.pendingHighScore;
    if (!p) return;
    this.pendingHighScore = null;
    this.highScores.splice(p.place, 0, { text: `${p.score}   ${name}`, score: p.score, level: p.level });
    this.highScores.length = Math.min(this.highScores.length, 10);
    this.onHighScores?.(highScoreFile(this.course.name), this.highScores);
  }

  /** Game over or the course done: the name prompt for a high score, else a new game (PlayTick, NextLevel). */
  private courseEnd(): void {
    if (this.isHighScore(this.score)) {
      this.showCourseEditor();
      this.state = GameState.CourseEditor;
      this.addHighScore(this.score, this.levelIndex);
    } else this.startGame();
  }

  // ---- the flow

  /** TForm1.LevelDone (0x41b4b4): "Well done" while the game goes on, until the banner ends. */
  private *levelDone(): Generator<void, void, void> {
    this.showText('Welldone', 200);
    this.sound('Woohoo');
    this.levelDonePhase = true;
    do {
      this.move();
      this.collisions();
      this.freeDead();
      yield;
    } while (this.text !== null);
  }

  /** TForm1.NextLevel (0x41b044). */
  private *nextLevel(): Generator<void, void, void> {
    if (this.levelIndex < this.lastLevelIndex()) {
      this.levelIndex++;
      this.loadLevel(this.course.levels[this.levelIndex]);
      this.startLevel();
      return;
    }
    this.sound('IMean');
    yield* this.showTextBlocking('CourseDone', 200);
    this.courseEnd();
  }

  /** TForm1.PlayTick (0x41a784). */
  private *playTick(): Generator<void, void, void> {
    this.move();
    this.collisions();
    this.freeDead();
    if (this.balls.length === 0) {
      if (this.lives > 0) {
        this.sound('Doh');
        yield* this.showTextBlocking('DOh', 100);
        this.paddle!.setKind(PaddleKind.Normal);
        new Ball(this);
        this.lives--;
      } else {
        this.sound('MultiDoh');
        yield* this.showTextBlocking('GameOver', 200);
        if (this.state === GameState.Course) this.courseEnd();
        if (this.state === GameState.Test) this.startTest();
      }
    }
    if (this.stonesLeft === 0) {
      yield* this.levelDone();
      if (this.state === GameState.Course) yield* this.nextLevel();
      if (this.state === GameState.Test) this.requested = GameState.Editor;
    }
    if (this.endCollected && this.state === GameState.Course) {
      yield* this.levelDone();
      yield* this.nextLevel();
    }
  }

  /** Start a state on the next tick (the menu items: Game ▸ New is 1, Level ▸ Test is 2). */
  request(state: GameState): void {
    this.requested = state;
  }

  /** Play the level in the buffer (Level ▸ Test / Load). */
  testLevel(level: Level): void {
    this.level = new Uint8Array(level);
    this.request(GameState.Test);
  }

  /** True while a PlayTick loop (blocking banner, "Well done") is running. */
  get inLoop(): boolean {
    return this.flow !== null;
  }

  /** TForm1.TimerTimer (0x41b168) without the drawing: one tick. */
  tick(input: Input): void {
    this.sounds = [];
    this.input = input;
    if (this.flow) {
      if (this.flow.next().done) this.flow = null;
      return;
    }
    if (this.requested === GameState.None) {
      if (this.state === GameState.Course || this.state === GameState.Test) {
        this.flow = this.playTick();
        if (this.flow.next().done) this.flow = null;
      } else if (this.state === GameState.CourseEditor) {
        // CourseEditorTick (0x41a9dc): closing the dialog starts a new game
        if (!this.courseEditorOpen) this.requested = GameState.Course;
      }
      return;
    }
    this.state = this.requested;
    this.requested = GameState.None;
    switch (this.state) {
      case GameState.Course:
        this.startGame();
        break;
      case GameState.Test:
        this.startTest();
        break;
      case GameState.Editor:
        this.startEditor();
        break;
      case GameState.CourseEditor:
        this.showCourseEditor();
        break;
    }
  }
}
