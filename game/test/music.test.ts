import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Music, type Playlist, type Track } from '../src/audio/music';

const SR = 44100;
const track = (file: string, seconds = 100, intro = 10): Track =>
  ({ file, title: file, sampleRate: SR, length: seconds * SR, loopStart: intro * SR, loopEnd: seconds * SR });
const PLAYLIST: Playlist = { menu: track('menu.mp3'), levels: [track('a.mp3'), track('b.mp3'), track('c.mp3')] };

/** Just enough of Web Audio to follow what Music starts and stops. */
class FakeContext {
  currentTime = 0;
  destination = {};
  sources: FakeSource[] = [];
  /** Seconds of encoder delay the fake decoder leaves in (0: it reads the gapless header). */
  delay = 0;
  createGain() {
    return { gain: new FakeParam(), connect: (n: unknown) => n };
  }
  createBufferSource() {
    const s = new FakeSource();
    this.sources.push(s);
    return s;
  }
  async decodeAudioData(data: ArrayBuffer) {
    const file = new TextDecoder().decode(data);
    const t = [PLAYLIST.menu, ...PLAYLIST.levels].find((x) => x.file === file)!;
    return { file, duration: t.length / SR + this.delay };
  }
}
class FakeParam {
  value = 1;
  setValueAtTime(v: number) {
    this.value = v;
  }
  linearRampToValueAtTime() {}
  setTargetAtTime() {}
  cancelScheduledValues() {}
}
class FakeSource {
  buffer: { file: string } | null = null;
  loop = false;
  loopStart = 0;
  loopEnd = 0;
  startedAt = -1;
  offset = -1;
  stopAt = Infinity;
  connect(n: unknown) {
    return n;
  }
  start(when: number, offset: number) {
    this.startedAt = when;
    this.offset = offset;
  }
  stop(when: number) {
    this.stopAt = when;
  }
}

const flush = () => new Promise((r) => setTimeout(r, 0));

describe('Music', () => {
  let ctx: FakeContext;
  let music: Music;
  const playing = () => ctx.sources.filter((s) => s.startedAt >= 0 && s.stopAt === Infinity);

  beforeEach(() => {
    ctx = new FakeContext();
    music = new Music(ctx as unknown as AudioContext, 'music/', PLAYLIST);
    vi.stubGlobal('fetch', async (url: string) => ({ arrayBuffer: async () => new TextEncoder().encode(url.slice(6)).buffer }));
  });
  afterEach(() => vi.unstubAllGlobals());

  it('plays level n\'s track as (n − 1) mod N', () => {
    expect([1, 2, 3, 4, 7].map((n) => music.levelTrack(n).file)).toEqual(['a.mp3', 'b.mp3', 'c.mp3', 'a.mp3', 'a.mp3']);
  });

  it('starts a track from its intro and loops between the loop points', async () => {
    music.want({ track: PLAYLIST.menu, key: 'menu', fade: false, hold: false });
    await flush();
    const [s] = playing();
    expect(s.buffer).toMatchObject({ file: 'menu.mp3' });
    expect([s.offset, s.loop, s.loopStart, s.loopEnd]).toEqual([0, true, 10, 100]);
    music.want({ track: PLAYLIST.menu, key: 'menu', fade: false, hold: false }); // the same key: goes on
    await flush();
    expect(ctx.sources).toHaveLength(1);
  });

  it('moves the loop points by the MP3 encoder delay when the decoder leaves it in', async () => {
    ctx.delay = 1105 / SR + 0.02;
    music.want({ track: PLAYLIST.menu, key: 'menu', fade: false, hold: false });
    await flush();
    const [s] = playing();
    expect(s.offset).toBeCloseTo(1105 / SR);
    expect(s.loopStart).toBeCloseTo(10 + 1105 / SR);
  });

  it('starts again on a new key, fades out at a level\'s end, holds and goes on', async () => {
    const lvl = (key: string, o: { fade?: boolean; hold?: boolean } = {}) =>
      music.want({ track: music.levelTrack(1), key, fade: o.fade ?? false, hold: o.hold ?? false });
    lvl('level 1');
    await flush();
    ctx.currentTime = 30;
    lvl('level 1', { hold: true }); // the pause menu
    expect(playing()).toHaveLength(0);
    ctx.currentTime = 60;
    lvl('level 1');
    expect(playing()[0].offset).toBeCloseTo(30); // where it stopped
    ctx.currentTime = 70;
    lvl('level 1', { fade: true }); // "Well done"
    expect(playing()).toHaveLength(0);
    lvl('level 2'); // the next level (here the same track): from the start
    await flush();
    expect(playing()).toHaveLength(1);
    expect(playing()[0].offset).toBe(0);
  });

  it('is silent at volume 0 and starts again when switched on', async () => {
    music.setVolume(0);
    music.want({ track: PLAYLIST.menu, key: 'menu', fade: false, hold: false });
    await flush();
    expect(playing()).toHaveLength(0);
    music.setVolume(0.25);
    music.want({ track: PLAYLIST.menu, key: 'menu', fade: false, hold: false });
    await flush();
    expect(playing()).toHaveLength(1);
  });
});
