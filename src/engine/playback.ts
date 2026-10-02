import * as Tone from 'tone';
import { TICKS_PER_QUARTER, type Score } from '../model/types';
import { beatTicks, measureTicks, timeSignatureAt } from '../model/timing';

/**
 * 共通再生クロック（設計方針.md §8 / 指示書§43）
 *
 * 模範再生・メトロノーム・現在位置は、すべて Tone.Transport という
 * 1本の高精度クロックから動かす。別々のタイマーを持たせない。
 * 画面の更新だけは requestAnimationFrame で、この時計を「読む」だけにする。
 *
 * 時間の単位は tick。Transport の PPQ を内部モデルと同じ 960 に合わせているので、
 * 内部モデルの tick をそのまま Transport の tick として使える。
 */

/** 同時に鳴らせる音の数 */
const VOICE_COUNT = 16;
/** 1音を鳴らし続ける長さの上限（秒）。実際のギターの弦の減衰に合わせる */
const MAX_RING_SECONDS = 3;
/** 短すぎる音でもこれだけは鳴らす（秒） */
const MIN_RING_SECONDS = 0.25;

/** 音符イベント1つ分（Tone.Part に渡す形） */
interface PartEvent {
  /**
   * Tone.Part が読み取る発音位置。"960i" のように tick 単位で書く。
   * 秒ではなく音楽時間で登録するため、BPMを変えても登録し直す必要がなく、
   * 音程も変わらない（指示書§21）
   */
  time: string;
  /** Transport 上の tick（= 楽譜上の tick + カウントイン分） */
  tick: number;
  midi: number;
  durationTick: number;
}

export interface PlaybackState {
  /** 楽譜上の tick（カウントイン分を引いた値。カウントイン中は負） */
  scoreTick: number;
  measureIndex: number;
  beat: number;
  isCountingIn: boolean;
  /** カウントインの残り拍数（4,3,2,1）。カウントイン中でなければ 0 */
  countInBeat: number;
}

export class PlaybackEngine {
  private score: Score | null = null;
  private part: Tone.Part<PartEvent> | null = null;
  private metronome: Tone.Loop | null = null;
  private synths: Tone.PluckSynth[] = [];
  private clickHigh: Tone.MembraneSynth | null = null;
  private clickLow: Tone.MembraneSynth | null = null;
  private synthCursor = 0;

  /** カウントインに使う長さ（1小節分の tick）。楽譜全体をこの分だけ後ろにずらす */
  private preroll = TICKS_PER_QUARTER * 4;
  private beatUnit = TICKS_PER_QUARTER;
  private beatsPerMeasure = 4;

  /** この tick より前の音は鳴らさない（カウントイン中の無音化に使う） */
  private muteBefore = Number.NEGATIVE_INFINITY;
  private muteClearId: number | null = null;

  private metronomeOn = false;
  private started = false;


  // ── 準備 ────────────────────────────────────

  /**
   * 音を出す許可を取る。
   * ブラウザは「ユーザーが操作した瞬間」でないと音を鳴らさないため、
   * 再生ボタンを押したときに呼ぶ必要がある。
   */
  async ensureAudio(): Promise<void> {
    if (Tone.getContext().state !== 'running') {
      await Tone.start();
    }
    if (!this.started) {
      this.buildInstruments();
      this.started = true;
    }
  }

  private buildInstruments(): void {
    // ギターは同時に6本の弦が鳴る。余裕をみて10本のプラック音源を使い回す
    // ギターは6弦。ゆっくりのテンポでは音が長く残るため、余裕をみて16本使い回す
    this.synths = Array.from({ length: VOICE_COUNT }, () =>
      new Tone.PluckSynth({
        attackNoise: 1,
        // 高すぎると耳障り、低すぎるとこもって音程が分かりにくくなる
        dampening: 4500,
        resonance: 0.92,
        release: 0.4,
      }).toDestination(),
    );

    this.clickHigh = new Tone.MembraneSynth({
      pitchDecay: 0.008,
      octaves: 2,
      envelope: { attack: 0.001, decay: 0.14, sustain: 0 },
      volume: -10,
    }).toDestination();

    this.clickLow = new Tone.MembraneSynth({
      pitchDecay: 0.008,
      octaves: 2,
      envelope: { attack: 0.001, decay: 0.1, sustain: 0 },
      volume: -16,
    }).toDestination();
  }

  // ── 楽譜の読み込み ──────────────────────────

  load(score: Score): void {
    this.score = score;

    const transport = Tone.getTransport();
    transport.stop();
    transport.cancel();
    transport.PPQ = TICKS_PER_QUARTER;

    const ts = timeSignatureAt(score, 0);
    this.beatsPerMeasure = ts.beats;
    this.beatUnit = beatTicks(ts.beatType);
    this.preroll = measureTicks(ts.beats, ts.beatType);

    this.part?.dispose();
    this.part = new Tone.Part<PartEvent>((time, event) => {
      if (event.tick < this.muteBefore) return;
      this.pluck(event.midi, event.durationTick, time);
    }, this.buildEvents(score));
    this.part.start(0);

    this.metronome?.dispose();
    // 間隔は「秒」ではなく tick で指定する。
    // 秒で固定すると、テンポを変えたときにメトロノームだけ元の速さのまま取り残される
    this.metronome = new Tone.Loop((time) => {
      this.tick(time);
    }, `${this.beatUnit}i`);
    this.metronome.start(0);

    transport.position = 0;
    transport.ticks = this.preroll;
  }

  private buildEvents(score: Score): PartEvent[] {
    const events: PartEvent[] = [];

    for (const measure of score.measures) {
      for (const note of measure.notes) {
        if (note.isRest || note.midi === undefined) continue;

        const tick = note.startTick + this.preroll;
        events.push({
          time: `${tick}i`,
          tick,
          midi: note.midi,
          durationTick: note.durationTick,
        });
      }
    }

    return events.sort((a, b) => a.tick - b.tick);
  }

  private pluck(midi: number, durationTick: number, time: number): void {
    const synth = this.synths[this.synthCursor];
    this.synthCursor = (this.synthCursor + 1) % this.synths.length;
    if (!synth) return;

    // 周波数はMIDI番号だけで決まる。テンポは一切関わらない（音程は変わらない）
    const frequency = Tone.Frequency(midi, 'midi').toFrequency();
    synth.triggerAttack(frequency, time);

    // 鳴らす長さは音価に合わせるが、上限を設ける。
    // ギターの弦は実際には数秒で減衰するため、テンポを落としたときに
    // 音価どおり伸ばすと低音が唸りとして溜まり、音程が下がったように聞こえてしまう
    const musical = Tone.Ticks(durationTick).toSeconds() * 1.05;
    const ring = Math.min(Math.max(musical, MIN_RING_SECONDS), MAX_RING_SECONDS);
    synth.triggerRelease(time + ring);
  }

  /** メトロノームとカウントインの打点。どちらも同じ時計から鳴らす */
  private tick(time: number): void {
    const transport = Tone.getTransport();
    const ticks = transport.getTicksAtTime(time);
    const isCountingIn = ticks < this.muteBefore;

    // カウントイン中は、メトロノームがOFFでも必ず鳴らす（指示書§23）
    if (!this.metronomeOn && !isCountingIn) return;

    const beatIndex = Math.round((ticks - this.preroll) / this.beatUnit);
    const isDownbeat = ((beatIndex % this.beatsPerMeasure) + this.beatsPerMeasure) % this.beatsPerMeasure === 0;

    if (isDownbeat) this.clickHigh?.triggerAttackRelease('C5', '32n', time);
    else this.clickLow?.triggerAttackRelease('G4', '32n', time);
  }

  // ── 再生操作 ────────────────────────────────

  async play(options: { fromScoreTick: number; countIn: boolean }): Promise<void> {
    await this.ensureAudio();
    const transport = Tone.getTransport();

    const musicStart = options.fromScoreTick + this.preroll;
    const startAt = options.countIn ? Math.max(0, musicStart - this.preroll) : musicStart;

    this.clearMuteSchedule();

    // 先頭より前には音符が無いので、音を消す処理は要らない。
    // ここで消しにかかると、1音目が鳴らないことがある
    this.muteBefore =
      options.fromScoreTick > 0 && options.countIn
        ? musicStart
        : Number.NEGATIVE_INFINITY;

    if (this.muteBefore !== Number.NEGATIVE_INFINITY) {
      // 途中から再生したときだけ、カウントイン中の音を消す。
      // 解除しないと、ループで戻ったときに冒頭が鳴らなくなる
      this.muteClearId = transport.scheduleOnce(() => {
        this.muteBefore = Number.NEGATIVE_INFINITY;
        this.muteClearId = null;
      }, Tone.Ticks(musicStart));
    }

    transport.ticks = startAt;
    transport.start();
  }

  pause(): void {
    Tone.getTransport().pause();
  }

  stop(): void {
    const transport = Tone.getTransport();
    transport.stop();
    this.clearMuteSchedule();
    this.muteBefore = Number.NEGATIVE_INFINITY;
    this.releaseAll();
  }

  private clearMuteSchedule(): void {
    if (this.muteClearId !== null) {
      Tone.getTransport().clear(this.muteClearId);
      this.muteClearId = null;
    }
  }

  private releaseAll(): void {
    const now = Tone.now();
    for (const synth of this.synths) synth.triggerRelease(now);
  }

  // ── 設定 ────────────────────────────────────

  setBpm(bpm: number): void {
    Tone.getTransport().bpm.value = bpm;
  }

  setMetronome(on: boolean): void {
    this.metronomeOn = on;
  }


  /** ループ範囲を小節番号（1起点）で指定する */
  setLoop(enabled: boolean, startMeasure: number, endMeasure: number): void {
    const transport = Tone.getTransport();
    transport.loop = enabled;
    if (!enabled || !this.score) return;

    const measures = this.score.measures;
    const first = measures[Math.max(0, Math.min(measures.length - 1, startMeasure - 1))];
    const last = measures[Math.max(0, Math.min(measures.length - 1, endMeasure - 1))];
    if (!first || !last) return;

    transport.loopStart = Tone.Ticks(first.startTick + this.preroll).toSeconds();
    transport.loopEnd = Tone.Ticks(last.endTick + this.preroll).toSeconds();
  }

  /** 小節番号（1起点）へ移動する */
  seekToMeasure(measureNumber: number): void {
    if (!this.score) return;
    const measure = this.score.measures[measureNumber - 1];
    if (!measure) return;
    Tone.getTransport().ticks = measure.startTick + this.preroll;
  }

  // ── 現在位置の読み取り（画面更新用） ──────────

  /**
   * いま実際に耳に届いている音の時刻。
   *
   * Transport.ticks は「これから鳴らす音」を仕込んでいる先の位置を指しており、
   * 耳に届く音より少し先を走っている。そのまま画面に使うと、帯が音より先に進む。
   * 音の出力にかかる遅れを引いて、聞こえている位置に合わせる。
   */
  private audibleTime(): number {
    const context = Tone.getContext();
    const raw = context.rawContext as unknown as {
      outputLatency?: number;
      baseLatency?: number;
    };
    const latency = (raw.outputLatency ?? 0) + (raw.baseLatency ?? 0);
    return Math.max(0, context.currentTime - latency);
  }

  read(): PlaybackState {
    const transport = Tone.getTransport();
    const ticks = transport.state === 'started'
      ? transport.getTicksAtTime(this.audibleTime())
      : transport.ticks;
    const scoreTick = ticks - this.preroll;

    if (scoreTick < 0) {
      const remaining = Math.ceil(-scoreTick / this.beatUnit);
      return {
        scoreTick,
        measureIndex: 0,
        beat: 1,
        isCountingIn: true,
        countInBeat: Math.max(1, Math.min(this.beatsPerMeasure, remaining)),
      };
    }

    const measureIndex = this.findMeasureIndex(scoreTick);
    const measure = this.score?.measures[measureIndex];
    const beat = measure ? (scoreTick - measure.startTick) / this.beatUnit + 1 : 1;

    return { scoreTick, measureIndex, beat, isCountingIn: false, countInBeat: 0 };
  }

  private findMeasureIndex(scoreTick: number): number {
    const measures = this.score?.measures;
    if (!measures || measures.length === 0) return 0;

    let low = 0;
    let high = measures.length - 1;
    while (low < high) {
      const mid = Math.ceil((low + high) / 2);
      if (measures[mid].startTick <= scoreTick) low = mid;
      else high = mid - 1;
    }
    return low;
  }

  get isPlaying(): boolean {
    return Tone.getTransport().state === 'started';
  }

  dispose(): void {
    this.stop();
    this.part?.dispose();
    this.metronome?.dispose();
    for (const synth of this.synths) synth.dispose();
    this.clickHigh?.dispose();
    this.clickLow?.dispose();
    this.synths = [];
    this.part = null;
    this.metronome = null;
    this.score = null;
  }
}

/** アプリ全体で1つだけ使う */
export const playbackEngine = new PlaybackEngine();
