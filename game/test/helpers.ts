// Test helpers: the exported data from public/data, and worlds built on it.

import { readFileSync } from 'node:fs';
import { loadGameData, type GameData } from '../src/data';
import { cellOffset, emptyLevel } from '../src/sim/files';
import { NO_INPUT, World, type Input } from '../src/sim/world';

const DATA = new URL('../public/data/', import.meta.url);

let cached: GameData | undefined;

export async function gameData(): Promise<GameData> {
  cached ??= await loadGameData({
    json: async (name) => JSON.parse(readFileSync(new URL(name, DATA), 'utf8')),
    binary: async (name) => {
      const b = readFileSync(new URL(name, DATA));
      return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
    },
  });
  return cached;
}

export async function newWorld(seed = 1): Promise<World> {
  const data = await gameData();
  return new World(data.manifest.images, data.files, seed);
}

/** A world with the course game started (the first tick handles the launch request). */
export async function courseGame(seed = 1): Promise<World> {
  const w = await newWorld(seed);
  w.tick(NO_INPUT);
  return w;
}

export function ticks(w: World, n: number, input: Input = NO_INPUT): void {
  for (let i = 0; i < n; i++) w.tick(input);
}

export const press = (keys: Partial<Input>): Input => ({ ...NO_INPUT, ...keys });

/** A level buffer with the given stones (col, row 1-based). */
export function makeLevel(stones: [col: number, row: number, kind: number, attr?: number][], tile = 0): Uint8Array {
  const level = emptyLevel();
  for (const [c, r, kind, attr = 0] of stones) {
    level[cellOffset(c, r)] = kind;
    level[cellOffset(c, r) + 1] = attr;
  }
  level[level.length - 1] = tile;
  return level;
}

/** A world playing `level` as a level test (state 2). */
export async function testGame(level: Uint8Array, seed = 1): Promise<World> {
  const w = await newWorld(seed);
  w.requested = 0;
  w.testLevel(level);
  w.tick(NO_INPUT);
  return w;
}
