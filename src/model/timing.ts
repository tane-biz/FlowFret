import { TICKS_PER_QUARTER, type Score, type TempoPoint } from './types';

/**
 * tick ⇄ 秒 の変換（設計方針.md §3）
 *
 * tick が正の値、秒は派生値。テンポを変えても tick は不変で、秒だけ計算し直す。
 */

/** tick を秒に変換する。tempoMap は tick 昇順であること */
export function tickToSeconds(tick: number, tempoMap: TempoPoint[]): number {
  if (tempoMap.length === 0) return (tick / TICKS_PER_QUARTER) * (60 / 120);

  let seconds = 0;
  let cursor = 0;
  let bpm = tempoMap[0].bpm;

  for (const point of tempoMap) {
    if (point.tick >= tick) break;
    if (point.tick > cursor) {
      seconds += ((point.tick - cursor) / TICKS_PER_QUARTER) * (60 / bpm);
      cursor = point.tick;
    }
    bpm = point.bpm;
  }

  seconds += ((tick - cursor) / TICKS_PER_QUARTER) * (60 / bpm);
  return seconds;
}

/** 秒を tick に変換する（再生位置から現在小節を求めるときに使う） */
export function secondsToTick(seconds: number, tempoMap: TempoPoint[]): number {
  if (tempoMap.length === 0) return (seconds / (60 / 120)) * TICKS_PER_QUARTER;

  let elapsed = 0;
  let cursor = 0;
  let bpm = tempoMap[0].bpm;

  for (const point of tempoMap) {
    const segmentSeconds = ((point.tick - cursor) / TICKS_PER_QUARTER) * (60 / bpm);
    if (point.tick > cursor && elapsed + segmentSeconds >= seconds) break;
    if (point.tick > cursor) {
      elapsed += segmentSeconds;
      cursor = point.tick;
    }
    bpm = point.bpm;
  }

  return cursor + ((seconds - elapsed) / (60 / bpm)) * TICKS_PER_QUARTER;
}

/**
 * 全音符の startTime / endTime を tempoMap から計算し直す。
 * 楽譜を読み込んだ直後と、原曲テンポを変えたときに呼ぶ。
 */
export function applyTimings(score: Score): void {
  for (const measure of score.measures) {
    for (const note of measure.notes) {
      note.startTime = tickToSeconds(note.startTick, score.tempoMap);
      note.endTime = tickToSeconds(note.endTick, score.tempoMap);
    }
  }
}

/** その小節の時点で有効な拍子を返す */
export function timeSignatureAt(score: Score, measureIndex: number) {
  let current = score.timeSignatures[0] ?? { measureIndex: 0, beats: 4, beatType: 4 };
  for (const ts of score.timeSignatures) {
    if (ts.measureIndex <= measureIndex) current = ts;
    else break;
  }
  return current;
}

/** 拍子から、1小節分の tick 数を求める */
export function measureTicks(beats: number, beatType: number): number {
  return (beats * TICKS_PER_QUARTER * 4) / beatType;
}

/** 1拍あたりの tick 数 */
export function beatTicks(beatType: number): number {
  return (TICKS_PER_QUARTER * 4) / beatType;
}
