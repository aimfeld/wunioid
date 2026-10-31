// The Remastered music (the remake's; the original has none, decision 14): MP3s rendered by
// tools/music/export_music.py from the scores in tools/music/songs/ (docs/music.md), listed in music/music.json.
// Each track has an intro that plays once and a loop: an AudioBufferSourceNode loops between the exact loop
// points (an <audio loop> would click or leave a gap at the MP3's encoder delay and padding). One track is decoded
// at a time (a three-minute track is about 60 MB as float samples).
//
// main.ts says each frame what should play (want()): the track, whether it is fading out (level done, game over)
// and whether it is held (the pause menu); a new track fades the old one out and starts from its beginning.

export interface Track {
  file: string;
  title: string;
  sampleRate: number;
  /** Samples: the file's length; the loop runs from loopStart to loopEnd (the end of the file). */
  length: number;
  loopStart: number;
  loopEnd: number;
}

export interface Playlist {
  menu: Track;
  levels: Track[];
}

/** What should play: a track and a key that changes when it should start again (a new level, a new game). */
export interface Wanted {
  track: Track | null;
  key: string;
  /** Fade out and stay silent (level done, game over) until the key changes. */
  fade: boolean;
  /** Stop where it is and go on from there later (the pause menu). */
  hold: boolean;
}

/** Music volume settings: off, low, medium, high (about −18, −12 and −7 dB, under the effects at 0.5). */
export const VOLUMES = [0, 0.12, 0.25, 0.45];
export const VOLUME_NAMES = ['Off', 'Low', 'Medium', 'High'];

const SWITCH_S = 0.6; // fade out when the track changes
const FADE_S = 2.5; // fade out at a level's end and at game over
const RESUME_S = 0.15; // fade in after a hold
/**
 * The LAME encoder delay (576 + 529 samples at 44.1 kHz). Browsers that read the MP3's gapless header (LAME/Xing)
 * remove it and the padding; a decoder that doesn't leaves the delay before the music and is longer by at least
 * this much: then the loop points move by the delay.
 */
const MP3_DELAY = 1105;

export class Music {
  private readonly out: GainNode;
  private volume = VOLUMES[2];
  private key = '';
  private track: Track | null = null;
  private buffer: AudioBuffer | null = null;
  private bufferFile = '';
  private lead = 0; // s of encoder delay left in the decoded buffer
  private source: { node: AudioBufferSourceNode; gain: GainNode; started: number; offset: number } | null = null;
  private position = 0; // s into the buffer where a held track goes on
  private held = false;
  private fading = false;
  private loading = 0; // counts loads, so a late one for an old key is dropped

  constructor(private readonly ctx: AudioContext, private readonly base: string, readonly playlist: Playlist) {
    this.out = ctx.createGain();
    this.out.gain.value = this.volume;
    this.out.connect(ctx.destination);
  }

  static async load(ctx: AudioContext, base: string): Promise<Music> {
    const playlist = (await (await fetch(`${base}music.json`)).json()) as Playlist;
    return new Music(ctx, base, playlist);
  }

  /** The track for level n (1-based): (n − 1) mod N. */
  levelTrack(n: number): Track {
    const l = this.playlist.levels;
    return l[(((n - 1) % l.length) + l.length) % l.length];
  }

  setVolume(v: number): void {
    this.volume = v;
    this.out.gain.setTargetAtTime(v, this.ctx.currentTime, 0.05);
  }

  /** Called every frame with what should play. */
  want(w: Wanted): void {
    const track = this.volume > 0 ? w.track : null;
    const key = track ? w.key : '';
    if (key !== this.key) {
      this.key = key;
      this.stop(SWITCH_S);
      this.track = track;
      this.position = 0;
      this.fading = false;
      this.held = w.hold;
      if (track) void this.start(track, key);
      return;
    }
    if (w.fade && !this.fading) {
      this.fading = true;
      this.stop(FADE_S);
    }
    if (w.hold !== this.held && !this.fading) {
      this.held = w.hold;
      if (w.hold) {
        this.position = this.playhead();
        this.stop(RESUME_S);
      } else if (this.buffer && this.track) this.play(this.position, RESUME_S);
    }
  }

  private async start(track: Track, key: string): Promise<void> {
    const n = ++this.loading;
    if (!this.buffer || this.bufferFile !== track.file) {
      this.buffer = null; // let the old one go before decoding the next
      let buffer: AudioBuffer;
      try {
        const data = await (await fetch(this.base + track.file)).arrayBuffer();
        buffer = await this.ctx.decodeAudioData(data);
      } catch (e) {
        console.warn('no music:', track.file, e);
        return;
      }
      if (n !== this.loading) return;
      this.buffer = buffer;
      this.bufferFile = track.file;
      this.lead = buffer.duration - track.length / track.sampleRate >= MP3_DELAY / track.sampleRate
        ? MP3_DELAY / track.sampleRate : 0;
    }
    if (n !== this.loading || key !== this.key || this.fading) return;
    if (this.held) return; // starts from the beginning when the hold ends
    this.play(0, 0);
  }

  /** Start the buffer at `at` s into the track (0: the intro), fading in over `fadeIn` s. */
  private play(at: number, fadeIn: number): void {
    const t = this.track!;
    const node = this.ctx.createBufferSource();
    node.buffer = this.buffer;
    node.loop = true;
    node.loopStart = this.lead + t.loopStart / t.sampleRate;
    node.loopEnd = this.lead + t.loopEnd / t.sampleRate;
    const gain = this.ctx.createGain();
    const now = this.ctx.currentTime;
    gain.gain.setValueAtTime(fadeIn > 0 ? 0 : 1, now);
    if (fadeIn > 0) gain.gain.linearRampToValueAtTime(1, now + fadeIn);
    node.connect(gain).connect(this.out);
    const offset = at > 0 ? at : this.lead;
    node.start(now, offset);
    this.source = { node, gain, started: now, offset };
  }

  /** Where the playing source is in the buffer, s (wrapped into the loop). */
  private playhead(): number {
    const s = this.source;
    if (!s) return this.position;
    const { loopStart, loopEnd } = s.node;
    let p = s.offset + (this.ctx.currentTime - s.started);
    if (p >= loopEnd) p = loopStart + ((p - loopStart) % (loopEnd - loopStart));
    return p;
  }

  private stop(fade: number): void {
    const s = this.source;
    if (!s) return;
    this.source = null;
    const now = this.ctx.currentTime;
    s.gain.gain.cancelScheduledValues(now);
    s.gain.gain.setValueAtTime(s.gain.gain.value, now);
    s.gain.gain.linearRampToValueAtTime(0, now + fade);
    s.node.stop(now + fade + 0.05);
  }
}
