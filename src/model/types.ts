/**
 * 内部データ（設計方針.md §8）
 *
 * 楽譜ファイルを読み込まないので、既存の練習アプリより大幅に小さい。
 * 生成したフレーズを、再生と描画の両方へ渡すための入れ物。
 */

/** 内部の時間分解能。四分音符 = 960 tick */
export const TICKS_PER_QUARTER = 960;

export interface NoteEvent {
  id: string;
  measureIndex: number;
  /** 小節内の拍位置（1起点） */
  beat: number;

  /** 曲頭からの位置。tick が正、秒は tempoMap からの派生値 */
  startTick: number;
  durationTick: number;
  endTick: number;
  startTime: number;
  endTime: number;

  isRest: boolean;
  /** 実音のMIDI番号 */
  midi?: number;
}

export interface Measure {
  /** 0起点の内部番号 */
  index: number;
  /** 楽譜上の小節番号（1起点） */
  number: number;
  startTick: number;
  endTick: number;
  notes: NoteEvent[];
  /** 譜面に出すコード名 */
  label: string;
}

export interface TimeSignature {
  measureIndex: number;
  beats: number;
  beatType: number;
}

export interface TempoPoint {
  tick: number;
  bpm: number;
}

export interface Score {
  id: string;
  title: string;
  timeSignatures: TimeSignature[];
  tempoMap: TempoPoint[];
  measures: Measure[];
}
