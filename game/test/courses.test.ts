import { describe, expect, it } from 'vitest';
import { GameState, NO_INPUT } from '../src/sim/world';
import { gameData, testGame } from './helpers';

// The remake's own courses (courses/*.txt → tools/build_courses.py). test/autoplay.test.ts plays them through.
describe('the remake\'s courses', () => {
  for (const course of ['Postcards.cse', 'Contraptions.cse', 'Inferno.cse']) {
    it(`${course}: 20 levels, each there and with stones to clear`, async () => {
      const files = (await gameData()).files;
      const levels = files.courses.get(course)!;
      expect(levels).toHaveLength(20);
      for (const name of levels) {
        const w = await testGame(files.levels.get(name)!);
        w.tick(NO_INPUT);
        expect(w.state, name).toBe(GameState.Test);
        expect(w.stonesLeft, name).toBeGreaterThan(0);
      }
    });
  }
});
