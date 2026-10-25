// The Remastered HUD (decision 9): the original never finished its HUD (plain FPS / Lifes / Score / Level text at
// x 500 on black). Here it is a panel beside the playfield, in the playfield's white marble frame, with the
// title, the score, the course's best score, the spare lives as small paddles, the level and course, and bars for
// the power-ups that run out (glue, gun, piercing, mega ball). In a phone's portrait window it is a strip above
// the playfield (decision 10): lives, score and level. No FPS. In the level editor the panel holds the palette.

import { BlurFilter, Container, FillGradient, Graphics, Sprite, Text, type TextStyleOptions } from 'pixi.js';
import { GameState, type World } from '../../sim/world';
import { courseTitle } from '../../ui/menu';
import type { RemasterAssets } from './assets';
import { EditorPalette } from './palette';

export const FONT = 'Comic Neue';
export const PANEL_X = 428;
export const STRIP_H = 34;
const PX = 430, PW = 192; // the panel's contents, in its opening in the frame (x 428-624, y 16-464)
const CX = PX + PW / 2;
const MAX_ICONS = 8;
const TITLE_W = 168;

const LABEL: TextStyleOptions = { fontFamily: FONT, fontWeight: 'bold', fontSize: 12, fill: 0x9aa2e6, letterSpacing: 2 };
const VALUE: TextStyleOptions = { fontFamily: FONT, fontWeight: 'bold', fontSize: 30, fill: 0xffffff,
  dropShadow: { color: 0x000000, alpha: 0.6, blur: 2, distance: 2, angle: Math.PI / 3 } };
const SMALL: TextStyleOptions = { fontFamily: FONT, fontWeight: 'bold', fontSize: 14, fill: 0xd8dcff };

interface PowerUp {
  icon: string; // capsule image
  color: number;
  value: (w: World) => number; // 0..1 left
}

const POWER_UPS: PowerUp[] = [
  { icon: 'BGlue', color: 0x6ad85a, value: (w) => (w.paddle?.glueTimer ?? 0) / 800 },
  { icon: 'BGun', color: 0xff5a48, value: (w) => (w.paddle && w.paddle.kind === 1 ? w.paddle.gunTimer / 500 : 0) },
  { icon: 'B--o', color: 0x8a80ff, value: (w) => Math.max(0, ...w.balls.map((b) => b.piercingTimer / 400)) },
  { icon: 'BBig', color: 0xffb040, value: (w) => Math.max(0, ...w.balls.map((b) => b.megaTimer / 300)) },
];

function text(s: string, style: TextStyleOptions, anchorX = 0.5): Text {
  const t = new Text({ text: s, style });
  t.anchor.set(anchorX, 0);
  return t;
}

export class Hud {
  /** The panel (landscape), in picture px. */
  readonly panel = new Container();
  /** The strip above the playfield (portrait), 428 x STRIP_H from 0, 0. */
  readonly strip = new Container();
  private readonly texts: Text[] = [];
  private readonly score = text('0', VALUE);
  private readonly best = text('', SMALL);
  private readonly level = text('', { ...VALUE, fontSize: 26 });
  private readonly course = text('', SMALL);
  private readonly lifeIcons: Sprite[] = [];
  private readonly moreLives = text('', SMALL, 0);
  private readonly bars: { row: Container; fill: Graphics; color: number }[] = [];
  private readonly hint = text('Esc  menu   ·   P  pause', { ...LABEL, fontSize: 11, letterSpacing: 1, fill: 0x6c74b8 });
  private readonly game = new Container(); // what only shows in a game
  private readonly heading = new Container(); // the title, not in the editor
  private readonly palette: EditorPalette;
  /** The editor's eraser is the brush (the remake's, main.ts). */
  erase = false;
  // the strip
  private readonly sScore = text('0', { ...VALUE, fontSize: 22 });
  private readonly sLevel = text('', { ...SMALL, fontSize: 15 }, 1);
  private readonly sLives = text('', { ...SMALL, fontSize: 15 }, 0);
  private readonly sLifeIcon: Sprite;
  private readonly sBars = new Graphics();
  private readonly sGame = new Container();
  private shownScore = 0;
  private lastLives = -1;

  constructor(private readonly assets: RemasterAssets) {
    // the panel: dark blue glass in the playfield's marble frame (it shares the playfield's right border)
    const bg = new Graphics()
      .rect(426, 14, 200, 452).fill(new FillGradient({
        type: 'linear', start: { x: 0, y: 0 }, end: { x: 0, y: 1 }, textureSpace: 'local',
        colorStops: [{ offset: 0, color: 0x262c6e }, { offset: 0.5, color: 0x161a48 }, { offset: 1, color: 0x0c0e2a }],
      }))
      .rect(428, 16, 196, 58).fill({ color: 0xffffff, alpha: 0.05 });
    const rim = new Sprite(assets.panelFrame);
    rim.scale.set(0.25);
    rim.position.set(412, 0);
    // the title: the banners' lava text (tools/remaster_banners.py), over a soft shadow
    const title = new Container();
    for (const [dx, dy, shadow] of [[2, 3, true], [0, 0, false]] as const) {
      const t = new Sprite(assets.title);
      t.anchor.set(0.5);
      t.scale.set(TITLE_W / assets.title.width);
      t.position.set(CX + dx, 44 + dy);
      if (shadow) {
        t.tint = 0x000000;
        t.alpha = 0.6;
        t.filters = [new BlurFilter({ strength: 3 })];
      }
      title.addChild(t);
    }
    const sub = text('REMASTERED', { ...LABEL, fontSize: 10, letterSpacing: 4, fill: 0xc8ccff });
    sub.position.set(CX, 72);
    this.palette = new EditorPalette(assets);
    this.heading.addChild(title, sub);
    this.panel.addChild(bg, rim, this.heading, this.game, this.hint, this.palette.root);
    const label = (s: string, y: number) => {
      const t = text(s, LABEL);
      t.position.set(CX, y);
      this.game.addChild(t);
      return t;
    };
    label('SCORE', 96);
    this.score.position.set(CX, 110);
    this.best.position.set(CX, 148);
    label('LIVES', 180);
    this.moreLives.position.set(0, 0);
    label('LEVEL', 252);
    this.level.position.set(CX, 266);
    this.course.position.set(CX, 300);
    label('POWER-UPS', 330);
    this.game.addChild(this.score, this.best, this.moreLives, this.level, this.course);
    POWER_UPS.forEach((p, i) => {
      const row = new Container();
      const f = assets.get(p.icon)!;
      const icon = new Sprite(f.textures[9]);
      icon.scale.set(f.scale * 0.9);
      icon.position.set(0, 0);
      const track = new Graphics().roundRect(34, 6, 112, 7, 3.5).fill({ color: 0x000000, alpha: 0.45 });
      const fill = new Graphics();
      row.addChild(icon, track, fill);
      row.position.set(PX + 22, 350 + i * 23);
      this.game.addChild(row);
      this.bars.push({ row, fill, color: p.color });
    });
    this.hint.position.set(CX, 442);
    this.texts.push(sub, this.score, this.best, this.level, this.course, this.moreLives, this.hint, ...this.palette.texts);

    // the strip
    const sbg = new Graphics()
      .rect(0, 0, 428, STRIP_H).fill(new FillGradient({
        type: 'linear', start: { x: 0, y: 0 }, end: { x: 0, y: 1 }, textureSpace: 'local',
        colorStops: [{ offset: 0, color: 0x262c6e }, { offset: 1, color: 0x10123a }],
      }))
      .rect(0, STRIP_H - 2, 428, 2).fill({ color: 0xd8d8e0 });
    const pf = assets.get('Paddle')!;
    this.sLifeIcon = new Sprite(pf.textures[0]);
    this.sLifeIcon.scale.set(pf.scale * 0.42);
    this.sLifeIcon.position.set(10, 12);
    this.sLives.position.set(48, 6);
    this.sScore.position.set(214, 2);
    this.sLevel.position.set(418, 6);
    this.sGame.addChild(this.sLifeIcon, this.sLives, this.sScore, this.sLevel, this.sBars);
    this.strip.addChild(sbg, this.sGame);
    this.texts.push(this.sScore, this.sLevel, this.sLives);
  }

  /** Text is drawn at this many device px per picture px, so it stays sharp at any scale. */
  setResolution(r: number): void {
    for (const t of this.texts) t.resolution = r;
  }

  set touch(on: boolean) {
    this.touchUsed = on;
    this.palette.touch = on;
  }

  private touchUsed = false;

  update(w: World): void {
    const playing = (w.state === GameState.Course || w.state === GameState.Test) && w.paddle !== null;
    const editing = w.state === GameState.Editor;
    this.game.visible = this.sGame.visible = playing;
    this.palette.root.visible = editing;
    this.heading.visible = !editing;
    this.hint.visible = !editing && !this.touchUsed;
    const hint = w.state === GameState.Test ? 'Esc  editor   ·   P  pause' : 'Esc  menu   ·   P  pause'; // Esc ends a test
    if (this.hint.text !== hint) this.hint.text = hint;
    if (editing) this.palette.update(w, this.erase);
    if (!playing) return;
    // the score counts up
    const d = w.score - this.shownScore;
    this.shownScore = d <= 0 ? w.score : this.shownScore + Math.max(1, Math.ceil(d * 0.2));
    const score = String(this.shownScore);
    if (this.score.text !== score) this.score.text = this.sScore.text = score;
    const best = w.highScores[0]?.score;
    const bestText = best !== undefined && w.state === GameState.Course ? `Best  ${Math.max(best, w.score)}` : '';
    if (this.best.text !== bestText) this.best.text = bestText;
    if (w.lives !== this.lastLives) this.setLives(w.lives);
    const course = w.state === GameState.Course;
    const level = course ? `${w.levelIndex + 1} / ${w.course.levels.length}` : 'Test';
    if (this.level.text !== level) this.level.text = level;
    const name = course ? courseTitle(w.course.name) : '';
    if (this.course.text !== name) this.course.text = name;
    const sLevel = course ? `Level ${w.levelIndex + 1}/${w.course.levels.length}` : 'Test';
    if (this.sLevel.text !== sLevel) this.sLevel.text = sLevel;
    this.sBars.clear();
    let x = 0;
    POWER_UPS.forEach((p, i) => {
      const v = Math.max(0, Math.min(1, p.value(w)));
      const b = this.bars[i];
      b.row.alpha = v > 0 ? 1 : 0.3;
      b.fill.clear();
      if (v > 0) {
        b.fill.roundRect(34, 6, 112 * v, 7, 3.5).fill({ color: b.color });
        this.sBars.rect(x, STRIP_H - 5, 107 * v, 3).fill({ color: p.color });
      }
      x += 107;
    });
  }

  private setLives(n: number): void {
    this.lastLives = n;
    const pf = this.assets.get('Paddle')!;
    while (this.lifeIcons.length < Math.min(n, MAX_ICONS)) {
      const s = new Sprite(pf.textures[0]);
      s.scale.set(pf.scale * 0.5);
      this.lifeIcons.push(s);
      this.game.addChild(s);
    }
    this.lifeIcons.forEach((s, i) => {
      s.visible = i < n;
      const row = Math.floor(i / 4), col = i % 4;
      s.position.set(PX + 14 + col * 43, 198 + row * 20);
    });
    const more = n > MAX_ICONS ? `+${n - MAX_ICONS}` : '';
    this.moreLives.text = n === 0 ? 'none left' : more;
    this.moreLives.anchor.set(n === 0 ? 0.5 : 0, 0);
    this.moreLives.position.set(n === 0 ? CX : PX + 14, n === 0 ? 198 : 232);
    this.sLives.text = `× ${n}`;
  }
}
