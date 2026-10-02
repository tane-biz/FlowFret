import { chordToneSet, type Chord } from './chords';
import { generateExercise, type GeneratedMeasure } from './generate';
import type { Progression } from './progressions';

/**
 * メロディ＋ベースの2声モード（設計方針.md C）
 *
 * 上にメロディ（4分音符）、下にベース（全音符）を同時に鳴らす。
 * ソロギターの土台そのもの。
 *
 * 大事なのは「同時に押さえられること」。
 * メロディを1〜3弦、ベースを4〜6弦に分け、どちらも同じポジションの
 * 範囲に収めることで、押さえられない形が出ないようにする。
 */

const OPEN_STRINGS = [40, 45, 50, 55, 59, 64]; // 6弦→1弦
const HAND_SPAN = 4;

export interface DuoMeasure {
  index: number;
  chord: Chord;
  reharm: Chord | null;
  label: string;
  /** 上声部。4分音符4つ */
  melody: number[];
  /**
   * 下声部。1拍目と3拍目に鳴らす（2分音符×2）。
   * ソロギターでいちばんよく使う書き方で、右手の親指を安定させる練習にもなる。
   */
  bass: number;
}

export interface DuoOptions {
  progression: Progression;
  key: number;
  position: number;
  outness: number;
  seed: number;
}

export interface DuoExercise {
  measures: DuoMeasure[];
  options: DuoOptions;
  melodyRange: { low: number; high: number };
  bassRange: { low: number; high: number };
}

/** 1〜3弦で出せる音の範囲（メロディ用） */
export function melodyRangeFor(position: number): { low: number; high: number } {
  const low = Math.max(0, position - 1);
  return { low: OPEN_STRINGS[3] + low, high: OPEN_STRINGS[5] + position + HAND_SPAN };
}

/**
 * 4〜6弦で出せる音の範囲（ベース用）
 *
 * メロディの最低音と重ならないようにする。
 * 重なると、どちらが上の声部か分からなくなる。
 */
export function bassRangeFor(position: number): { low: number; high: number } {
  const low = Math.max(0, position - 1);
  const melodyLow = melodyRangeFor(position).low;
  return {
    low: OPEN_STRINGS[0] + low,
    high: Math.min(OPEN_STRINGS[2] + position + HAND_SPAN, melodyLow - 1),
  };
}

export function generateDuo(options: DuoOptions): DuoExercise {
  const { progression, key, position, outness, seed } = options;
  const melodyRange = melodyRangeFor(position);
  const bassRange = bassRangeFor(position);

  // 上声部は、いままでの無窮動をそのまま使う。音域だけ1〜3弦に絞る
  const line = generateExercise({
    progression,
    key,
    position,
    outness,
    seed,
    rangeOverride: melodyRange,
  });

  let previousBass: number | null = null;

  const measures: DuoMeasure[] = line.measures.map((source: GeneratedMeasure) => {
    const sounding = source.reharm ?? source.chord;
    const bass = pickBass(sounding, bassRange, previousBass);
    previousBass = bass;

    return {
      index: source.index,
      chord: source.chord,
      reharm: source.reharm,
      label: source.label,
      melody: source.notes.map(n => n.midi),
      bass,
    };
  });

  return { measures, options, melodyRange, bassRange };
}

/**
 * ベースを選ぶ。
 *
 * 根音が基本。ソロギターでは、低音が根音でないと土台にならない。
 * ただし根音だけに固定すると、キーによって低音が大きく飛んでしまう。
 * 飛びすぎるときは他の構成音でも代用できるようにして、動きをなだらかにする。
 *
 * 代用に使うのは、必ずそのコードの構成音にする。
 * 機械的に5度を足すと、ディミニッシュやオルタードのように
 * 完全5度を持たないコードで、外れた低音になってしまう。
 */
function pickBass(
  chord: Chord,
  range: { low: number; high: number },
  previous: number | null,
): number {
  const tones = chordToneSet(chord);
  const rootPc = chord.root % 12;
  const fifthPc = (chord.root + 7) % 12;

  // 根音を強く優先する。5度が続くと、土台がぼやけて聞こえる
  const penaltyFor = (pc: number) => {
    if (pc === rootPc) return 0;
    if (pc === fifthPc) return 9; // 根音が遠いときだけ使う
    return 14;                    // それ以外は最後の手段
  };

  const pool: { midi: number; penalty: number }[] = [];
  for (let midi = range.low; midi <= range.high; midi++) {
    const pc = ((midi % 12) + 12) % 12;
    if (!tones.includes(pc)) continue;
    pool.push({ midi, penalty: penaltyFor(pc) });
  }
  if (pool.length === 0) return range.low;

  const target = previous ?? range.low + 4;
  let bestMidi = pool[0].midi;
  let bestCost = Infinity;
  pool.forEach(entry => {
    const cost = Math.abs(entry.midi - target) + entry.penalty;
    if (cost < bestCost) {
      bestCost = cost;
      bestMidi = entry.midi;
    }
  });
  return bestMidi;
}
