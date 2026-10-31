// Sound effects with Web Audio. TForm1.PlaySound (0x41b540) plays a WaveList item once; the items have
// MaxPlayingCount 0, so DelphiX opens a new buffer when the old ones are busy (TWaveCollectionItem.Play
// 0x416198): the same sound overlaps itself, without a limit. The waves are 11025 Hz 8-bit mono.

/** Keeps a few overlapping 8-bit samples below clipping; the music (music.ts) sits under it. */
const GAIN = 0.5;

/** The page's one AudioContext, for the effects and the music. */
export function createAudioContext(): AudioContext {
  // iOS puts Web Audio in the "ambient" session, which the ring/silent switch mutes (Dark Planet's music, an
  // audio element, lifts its effects into "playback"); Safari 16.4+ lets the page ask for "playback" itself.
  const session = (navigator as { audioSession?: { type: string } }).audioSession;
  if (session) session.type = 'playback';
  return new AudioContext();
}

export class Sfx {
  private readonly out: GainNode;

  private constructor(private readonly ctx: AudioContext, private readonly buffers: Map<string, AudioBuffer>) {
    this.out = ctx.createGain();
    this.out.gain.value = GAIN;
    this.out.connect(ctx.destination);
  }

  static async load(ctx: AudioContext, base: string, names: string[]): Promise<Sfx> {
    const buffers = await Promise.all(names.map(async (n) => {
      const data = await (await fetch(`${base}sounds/${n}.wav`)).arrayBuffer();
      return [n, await ctx.decodeAudioData(data)] as const;
    }));
    return new Sfx(ctx, new Map(buffers));
  }

  play(names: readonly string[]): void {
    if (this.ctx.state !== 'running') return; // before the first gesture: drop them rather than pile them up
    for (const n of names) {
      const buffer = this.buffers.get(n);
      if (!buffer) continue;
      const src = this.ctx.createBufferSource();
      src.buffer = buffer;
      src.connect(this.out);
      src.start();
    }
  }
}
