// The exported data (tools/export_game_data.py → public/data): image sizes, sounds, levels, courses, high scores.

import { parseCourse, parseHighScores, parseLevel } from './sim/files';
import type { Files, ImageInfo } from './sim/world';

export interface Manifest {
  images: Record<string, ImageInfo & { file: string; list: string }>;
  sounds: string[];
  levels: string[];
  courses: string[];
  scores: string[];
}

export interface GameData {
  manifest: Manifest;
  files: Files;
}

/** Reads a file below data/ (fetch in the browser, fs in the tests). */
export interface Source {
  json(name: string): Promise<unknown>;
  binary(name: string): Promise<ArrayBuffer>;
}

export async function loadGameData(src: Source): Promise<GameData> {
  const manifest = (await src.json('data.json')) as Manifest;
  const bytes = async (name: string) => new Uint8Array(await src.binary(name));
  const [levels, courses, scores] = await Promise.all([
    Promise.all(manifest.levels.map(async (n) => [n, parseLevel(await bytes('levels/' + n))] as const)),
    Promise.all(manifest.courses.map(async (n) => [n, parseCourse(await bytes(n))] as const)),
    Promise.all(manifest.scores.map(async (n) => [n, parseHighScores(await bytes(n))] as const)),
  ]);
  return { manifest, files: { levels: new Map(levels), courses: new Map(courses), scores: new Map(scores) } };
}
