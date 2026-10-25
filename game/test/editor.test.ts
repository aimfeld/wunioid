import { describe, expect, it } from 'vitest';
import { cellOffset, levelTile } from '../src/sim/files';
import { Creator, StoneAttr, StoneKind } from '../src/sim/sprites';
import { ADD_ONE_LEVEL, GameState, LEAVE_ONE_LEVEL, NO_INPUT, NO_NAME, type World } from '../src/sim/world';
import { courseGame, newWorld } from './helpers';

/** Picture px inside a playfield cell. */
const cellAt = (col: number, row: number): [number, number] => [(col - 1) * 30 + 25, (row - 1) * 15 + 25];
/** Picture px inside a palette slot: stones (row of 4 from 1), attributes, backgrounds (rows of 3 from 1). */
const stoneSlot = (kind: number): [number, number] => [465 + ((kind - 1) % 4) * 35, 80 + Math.trunc((kind - 1) / 4) * 23];
const attrSlot = (attr: number): [number, number] => [465 + (attr - 1) * 35, 200];
const tileSlot = (tile: number): [number, number] => [465 + ((tile - 1) % 3) * 45, 250 + Math.trunc((tile - 1) / 3) * 47];

async function emptyEditor(): Promise<World> {
  const w = await newWorld();
  w.tick(NO_INPUT); // the launch's course game
  w.newLevel();
  w.tick(NO_INPUT);
  return w;
}

const click = (w: World, [x, y]: [number, number], right = false) => w.editorMouseDown(x, y, right);
const cellOf = (w: World, col: number, row: number) => w.levelCell(col, row);

describe('level editor', () => {
  it('Level ▸ New: an empty level, the palette at 460, 50, the first stone as the brush', async () => {
    const w = await emptyEditor();
    expect(w.state).toBe(GameState.Editor);
    expect(w.level.every((b) => b === 0)).toBe(true);
    expect(w.tiles).toBeNull();
    const p = w.sprites.find((s) => s instanceof Creator)!;
    expect([p.x, p.y, p.z, p.w, p.h]).toEqual([460, 50, 2, 137, 387]);
    expect([w.brush, w.brushAttr]).toEqual([1, false]);
    expect(w.paddle).toBeNull();
  });

  it('places a stone with the left button and clears the cell with the right one', async () => {
    const w = await emptyEditor();
    click(w, stoneSlot(StoneKind.Granit));
    expect([w.brush, w.brushAttr]).toEqual([StoneKind.Granit, false]);
    click(w, cellAt(3, 2));
    expect(cellOf(w, 3, 2)).toEqual([StoneKind.Granit, 0]);
    const s = w.cell(3, 2)!;
    expect([s.x, s.y, s.image]).toEqual([79, 34, 'Granit']);
    click(w, stoneSlot(StoneKind.GemBlue));
    click(w, cellAt(3, 2)); // replaces it
    expect(cellOf(w, 3, 2)).toEqual([StoneKind.GemBlue, 0]);
    expect(s.dead).toBe(true);
    click(w, cellAt(3, 2), true);
    expect(cellOf(w, 3, 2)).toEqual([0, 0]);
    expect(w.cell(3, 2)).toBeNull();
    w.tick(NO_INPUT); // EditorTick frees the dead sprites
    expect(w.sprites.some((x) => x.dead)).toBe(false);
  });

  it('reaches columns 1…13 and rows 1…17 only, the bottom row not to its end', async () => {
    const w = await emptyEditor();
    click(w, [15, 15]);
    expect(cellOf(w, 1, 1)[0]).toBe(1);
    click(w, [403, 268]);
    expect(cellOf(w, 13, 17)[0]).toBe(1);
    click(w, [403, 270]); // still in row 17's stone, but past the editor's bound
    click(w, [404, 100]);
    expect(w.level.filter((b, i) => i % 2 === 0 && b !== 0).length).toBe(2);
  });

  it('sets attributes on stones only, as allowed, with their labels; the right button clears them', async () => {
    const w = await emptyEditor();
    click(w, cellAt(1, 1)); // GemRed
    click(w, stoneSlot(StoneKind.Granit));
    click(w, cellAt(2, 1));
    click(w, stoneSlot(StoneKind.Goldie));
    click(w, cellAt(3, 1));
    click(w, attrSlot(StoneAttr.Bonus));
    expect([w.brush, w.brushAttr]).toEqual([StoneAttr.Bonus, true]);
    click(w, cellAt(1, 1));
    click(w, cellAt(2, 1)); // Bonus only on gems
    click(w, cellAt(4, 1)); // no stone: nothing
    expect(cellOf(w, 1, 1)).toEqual([StoneKind.GemRed, StoneAttr.Bonus]);
    expect(cellOf(w, 2, 1)).toEqual([StoneKind.Granit, 0]);
    expect(cellOf(w, 4, 1)).toEqual([0, 0]);
    const label = w.cell(1, 1)!.label!;
    expect(label.image).toBe('ABonus');
    expect([label.x, label.y, label.z]).toEqual([34, 26, 3]);
    // drawn on the stone: Width and Height are 0, DelphiX centres the image in them (0x40ea04)
    expect([label.x + label.drawDx, label.y + label.drawDy]).toEqual([19, 19]);
    click(w, attrSlot(StoneAttr.Move));
    click(w, cellAt(3, 1)); // no Move on a Goldie
    click(w, cellAt(2, 1));
    expect(cellOf(w, 3, 1)).toEqual([StoneKind.Goldie, 0]);
    expect(cellOf(w, 2, 1)).toEqual([StoneKind.Granit, StoneAttr.Move]);
    click(w, cellAt(1, 1), true);
    expect(cellOf(w, 1, 1)).toEqual([StoneKind.GemRed, 0]);
    expect(label.dead).toBe(true);
    expect(w.cell(1, 1)!.label).toBeNull();
    // a stone brush on an attributed stone: a new stone without the attribute
    click(w, stoneSlot(StoneKind.Block));
    click(w, cellAt(2, 1));
    expect(cellOf(w, 2, 1)).toEqual([StoneKind.Block, 0]);
  });

  it('picks the background from the palette, keeping one tile sprite', async () => {
    const w = await emptyEditor();
    click(w, tileSlot(5));
    expect(levelTile(w.level)).toBe(5);
    const t = w.tiles!;
    expect(t.image).toBe('Tile5');
    click(w, tileSlot(9));
    expect(w.tiles).toBe(t);
    expect(t.image).toBe('Tile9');
    expect(w.sprites.filter((s) => s === t).length).toBe(1);
  });

  it('ignores clicks outside the editor', async () => {
    const w = await courseGame();
    const before = new Uint8Array(w.level);
    click(w, cellAt(5, 16));
    expect(w.level).toEqual(before);
  });

  it('Level ▸ Edit keeps the level played; Test plays the edited level and returns to the editor', async () => {
    const w = await courseGame();
    const hi = new Uint8Array(w.level);
    w.request(GameState.Editor);
    w.tick(NO_INPUT);
    expect(w.level).toEqual(hi);
    expect(w.cell(1, 1) === null).toBe(hi[cellOffset(1, 1)] === 0);
    // a level of one stone
    w.level.fill(0, 0, w.level.length - 1);
    w.request(GameState.Editor);
    w.tick(NO_INPUT);
    click(w, cellAt(7, 4));
    w.request(GameState.Test);
    w.tick(NO_INPUT);
    expect(w.state).toBe(GameState.Test);
    expect(w.stonesLeft).toBe(1);
    expect(w.paddle).not.toBeNull();
    w.cell(7, 4)!.hit(null);
    for (let i = 0; i < 400 && w.state === GameState.Test; i++) w.tick(NO_INPUT);
    expect(w.state).toBe(GameState.Editor); // "Well done", then back to the editor
    expect(cellOf(w, 7, 4)).toEqual([1, 0]);
  });
});

describe('course editor', () => {
  it('adds, moves and deletes levels, keeping at least one', async () => {
    const w = await courseGame();
    w.loadCourse('Mystery.cse');
    const n = w.course.levels.length;
    const [a, b] = w.course.levels;
    expect(w.courseMove(0, -1)).toBe(0);
    expect(w.courseMove(0, 1)).toBe(1);
    expect(w.course.levels.slice(0, 2)).toEqual([b, a]);
    expect(w.courseMove(n - 1, 1)).toBe(n - 1);
    w.courseAdd('x'.repeat(60) + '.lev');
    expect(w.course.levels.at(-1)).toBe('x'.repeat(50));
    expect(w.courseDelete(n)).toBeNull();
    expect(w.course.levels.length).toBe(n);
    while (w.course.levels.length > 1) expect(w.courseDelete(0)).toBeNull();
    expect(w.courseDelete(0)).toBe(LEAVE_ONE_LEVEL);
    expect(w.courseDelete(5)).toBeNull();
    expect(w.course.levels.length).toBe(1);
  });

  it('Course ▸ New: NoName without levels or scores; nothing saved for it', async () => {
    const w = await courseGame();
    const saved: string[] = [];
    w.onHighScores = (f) => saved.push(f);
    w.courseNew();
    expect([w.course.name, w.course.levels, w.highScores]).toEqual([NO_NAME, [], []]);
    w.clearHighScores();
    expect(saved).toEqual([]);
    expect(ADD_ONE_LEVEL).toMatch(/add one level/);
    w.courseAdd('Hi.lev');
    w.courseSaved('test-editor.cse');
    expect(w.files.courses.get('test-editor.cse')).toEqual(['Hi.lev']);
    w.clearHighScores();
    expect(saved).toEqual(['test-editorscr']);
    w.files.courses.delete('test-editor.cse');
  });
});
