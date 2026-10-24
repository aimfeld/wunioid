// Sound effects with Web Audio. TForm1.PlaySound (0x41b540) plays a WaveList item once; the items have
// MaxPlayingCount 0, so DelphiX opens a new buffer when the old ones are busy (TWaveCollectionItem.Play
// 0x416198): the same sound overlaps itself, without a limit. The waves are 11025 Hz 8-bit mono.

/** No music competes with the effects; this keeps a few overlapping 8-bit samples below clipping. */
const GAIN = 0.5;

export class Sfx {
  private readonly out: GainNode;

  private constructor(private readonly ctx: AudioContext, private readonly buffers: Map<string, AudioBuffer>) {
    this.out = ctx.createGain();
    this.out.gain.value = GAIN;
    this.out.connect(ctx.destination);
  }

  static async load(base: string, names: string[]): Promise<Sfx> {
    // iOS puts Web Audio in the "ambient" session, which the ring/silent switch mutes (Dark Planet's music, an
    // audio element, lifts its effects into "playback"); Safari 16.4+ lets the page ask for "playback" itself.
    const session = (navigator as { audioSession?: { type: string } }).audioSession;
    if (session) session.type = 'playback';
    const ctx = new AudioContext();
    const buffers = await Promise.all(names.map(async (n) => {
      const data = await (await fetch(`${base}sounds/${n}.wav`)).arrayBuffer();
      return [n, await ctx.decodeAudioData(data)] as const;
    }));
    return new Sfx(ctx, new Map(buffers));
  }

  /** Browsers start audio only after a user gesture; call this from input handlers. */
  unlock(): void {
    // iOS has a further state, "interrupted" (a call, the app in the background), that also needs a resume
    if (this.ctx.state !== 'running' && this.ctx.state !== 'closed') void this.ctx.resume();
  }

  /** The page is hidden or the game paused: hold the sounds. */
  setHidden(hidden: boolean): void {
    if (hidden) void this.ctx.suspend();
    else this.unlock();
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
