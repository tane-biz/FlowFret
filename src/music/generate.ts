import {
  chordLabel,
  chordToneSet,
  guideToneSet,
  scaleSet,
  type Chord,
} from './chords';
import { chordsFor, useFlatsForKey, type Progression } from './progressions';
import { outnessForPass, reharmOptions, OUTNESS } from './reharmonize';

/**
 * 無窮動フレーズの生成（設計方針.md §4）
 *
 * 4分音符を4つ、休符なしで並べる。組み立て方は本の3要素に合わせる。
 *
 *   1拍目  ガイドトーン（3度か7度）      コードの性格が出る音
 *   2拍目  コードトーン、またはスケール音
 *   3拍目  コードトーン、またはスケール音
 *   4拍目  アプローチノート              次の小節の1音目へ半音で入る
 *
 * 1拍目と4拍目を決めることで、「無伴奏で弾いてもコード進行が聞こえる」状態になる。
 */

export interface GeneratedNote {
  /** 実音のMIDI番号。60＝真ん中のド */
  midi: number;
  /** その小節の何拍目か（1起点） */
  beat: number;
}

export interface GeneratedMeasure {
  index: number;
  /** 本来の和音 */
  chord: Chord;
  /** 置き換えた和音。置き換えていなければ null */
  reharm: Chord | null;
  /** 譜面に出すコード名（例：A7、A7(C♯dim7)） */
  label: string;
  notes: GeneratedNote[];
}

export interface GenerateOptions {
  progression: Progression;
  /** キーの主音（0＝C） */
  key: number;
  /** 弾く位置。1・5・7・9 など。左手の人差し指が来るフレット */
  position: number;
  /** 外し具合 0〜3。0ならリハーモナイズなし */
  outness: number;
  /** 同じ種を渡せば、いつでも同じフレーズが出る */
  seed: number;
  /** 音域を直接指定する。2声モードで、上声部だけに絞るときに使う */
  rangeOverride?: { low: number; high: number };
}

export interface GeneratedExercise {
  measures: GeneratedMeasure[];
  options: GenerateOptions;
  /** 音域（実音のMIDI番号） */
  range: { low: number; high: number };
}

// ─────────────────────────────────────────────
// 乱数（種を与えれば毎回同じ結果になる）
// ─────────────────────────────────────────────

function makeRandom(seed: number): () => number {
  let state = (seed | 0) || 1;
  return () => {
    // xorshift。短い式で、偏りの少ない乱数が作れる
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return ((state >>> 0) % 100000) / 100000;
  };
}

function pick<T>(items: T[], random: () => number): T {
  return items[Math.floor(random() * items.length) % items.length];
}

// ─────────────────────────────────────────────
// 音域（弾ける場所に収める）
// ─────────────────────────────────────────────

/** 6弦から1弦までの、開放弦の実音。ギターの標準チューニング */
const OPEN_STRINGS = [40, 45, 50, 55, 59, 64];

/**
 * そのポジションで押さえられる音域を返す。
 * 人差し指がpフレットに来るとき、p〜p+4フレットを使う。
 */
export function positionRange(position: number): { low: number; high: number } {
  return {
    low: OPEN_STRINGS[0] + position,
    high: OPEN_STRINGS[5] + position + 4,
  };
}

/** その音の高さの音を、指定の音域の中に収める */
function intoRange(pc: number, range: { low: number; high: number }): number[] {
  const result: number[] = [];
  for (let midi = range.low; midi <= range.high; midi++) {
    if (((midi % 12) + 12) % 12 === pc) result.push(midi);
  }
  return result;
}

// ─────────────────────────────────────────────
// 生成
// ─────────────────────────────────────────────

export function generateExercise(options: GenerateOptions): GeneratedExercise {
  const { progression, key, position, outness, seed } = options;
  const random = makeRandom(seed);
  const range = options.rangeOverride ?? positionRange(position);
  const useFlats = useFlatsForKey(key);
  const base = chordsFor(progression, key);

  // ① 和音の並びを作る（繰り返しごとにリハーモナイズを当てる）
  const plan: { chord: Chord; reharm: Chord | null; label: string }[] = [];
  for (let pass = 1; pass <= progression.repeats; pass++) {
    const limit = outnessForPass(pass, outness);
    base.forEach(chord => {
      const reharm = chooseReharm(chord, limit, random);
      plan.push({
        chord,
        reharm,
        label: reharm
          ? `${chordLabel(chord, useFlats)}(${chordLabel(reharm, useFlats)})`
          : chordLabel(chord, useFlats),
      });
    });
  }

  // ② 各小節の1音目（ガイドトーン）を決める。前の小節といちばん近いものを選ぶ
  const heads: number[] = [];
  plan.forEach((item, i) => {
    const sounding = item.reharm ?? item.chord;
    const candidates = guideToneSet(sounding).flatMap(pc => intoRange(pc, range));
    if (candidates.length === 0) {
      // ガイドトーンが音域に無いときはコードトーンから選ぶ
      candidates.push(...chordToneSet(sounding).flatMap(pc => intoRange(pc, range)));
    }
    const previous = i === 0 ? (range.low + range.high) / 2 : heads[i - 1];
    // 3半音まで幅を持たせる。滑らかさを保ちつつ、毎回違う出だしになる
    heads.push(nearest(candidates, previous, random, 3));
  });

  // ③ 終止の音を先に決めておく。
  // ここを先に決めないと、最後の小節だけ飛び離れて終わってしまう
  const tonic = base[0];
  const finalHead = nearest(
    chordToneSet(tonic).flatMap(pc => intoRange(pc, range)),
    heads[heads.length - 1],
    random,
  );

  // ④ 2〜4拍目を埋める
  const measures: GeneratedMeasure[] = plan.map((item, i) => {
    const sounding = item.reharm ?? item.chord;
    const nextHead = heads[i + 1] ?? finalHead;
    const notes = fillMeasure(heads[i], nextHead, sounding, range, random);
    return {
      index: i,
      chord: item.chord,
      reharm: item.reharm,
      label: item.label,
      notes: notes.map((midi, k) => ({ midi, beat: k + 1 })),
    };
  });

  // ⑤ 最後に終止の小節（全音符）を足す
  measures.push({
    index: measures.length,
    chord: tonic,
    reharm: null,
    label: chordLabel(tonic, useFlats),
    notes: [{ midi: finalHead, beat: 1 }],
  });

  return { measures, options, range };
}

function chooseReharm(chord: Chord, limit: number, random: () => number): Chord | null {
  if (limit <= 0) return null;
  const options = reharmOptions(chord).filter(o => OUTNESS[o.kind] <= limit);
  if (options.length === 0) return null;
  // 毎回必ず置き換えると落ち着かないので、3回に1回ほどは素直なまま残す
  if (random() < 0.3) return null;
  return pick(options, random).chord;
}

/**
 * 候補の中から、目標の高さに近いものを選ぶ。
 *
 * いちばん近いものだけを選ぶと、同じコードが来るたびに同じ音になり、
 * 6回の繰り返しがまったく同じフレーズになってしまう。
 * 少しだけ幅を持たせて、違うフレーズが出るようにする。
 */
function nearest(
  candidates: number[],
  target: number,
  random: () => number,
  tolerance = 0,
): number {
  if (candidates.length === 0) return Math.round(target);
  let best = Infinity;
  candidates.forEach(midi => {
    best = Math.min(best, Math.abs(midi - target));
  });
  const allowed = candidates.filter(midi => Math.abs(midi - target) <= best + tolerance);
  return pick(allowed, random);
}

/**
 * 1小節（4分音符4つ）を作る。
 *
 * 1音目は決まっている。4音目は次の小節の1音目へ半音で入る音にする。
 * 2・3音目は、その間を滑らかに埋める。
 *
 * 大事なのは2点。
 *  ・4音目も「いまのコードに合う音」から選ぶ。合わない音を置くと、そこだけ浮いて聞こえる
 *  ・跳躍を抑える。4分音符はひとつひとつがはっきり聞こえるので、大きく跳ぶと不自然になる
 */
function fillMeasure(
  head: number,
  nextHead: number | undefined,
  chord: Chord,
  range: { low: number; high: number },
  random: () => number,
): number[] {
  const tones = chordToneSet(chord);
  const scale = scaleSet(chord);
  const fourth = pickApproach(head, nextHead, tones, scale, range, random);

  // 使える音を先に集める。コードトーンを優先し、スケール音は少し不利にする
  const pool: { midi: number; penalty: number }[] = [];
  for (let midi = range.low; midi <= range.high; midi++) {
    const pc = ((midi % 12) + 12) % 12;
    if (tones.includes(pc)) pool.push({ midi, penalty: 0 });
    else if (scale.includes(pc)) pool.push({ midi, penalty: 1.2 });
  }

  // 2音目と3音目は、まとめて決める。
  // 片方ずつ選ぶと、あとから見て遠回りな並びになることがある
  let best: { second: number; third: number; cost: number } | null = null;
  const ties: { second: number; third: number; cost: number }[] = [];

  for (const s of pool) {
    if (s.midi === head || s.midi === fourth) continue;
    for (const t of pool) {
      if (t.midi === s.midi || t.midi === fourth || t.midi === head) continue;

      const moves = [
        Math.abs(s.midi - head),
        Math.abs(t.midi - s.midi),
        Math.abs(fourth - t.midi),
      ];
      // 動く幅の合計が小さいほど滑らか。大きく跳ぶものは重く罰する
      const leap = moves.reduce((sum, m) => sum + (m > 7 ? 6 : m > 5 ? 2 : 0), 0);
      const cost = moves[0] + moves[1] + moves[2] + s.penalty + t.penalty + leap;

      if (best === null || cost < best.cost) {
        best = { second: s.midi, third: t.midi, cost };
      }
      ties.push({ second: s.midi, third: t.midi, cost });
    }
  }

  if (best === null) {
    const second = nudge(head, fourth, range, [head, fourth]);
    const third = nudge(fourth, head, range, [head, second, fourth]);
    return [head, second, third, fourth];
  }

  // 最良に近いものからも選ぶ。同じコードが続いても、同じ形ばかりにならない
  const bestCost = best.cost;
  const allowed = ties.filter(entry => entry.cost <= bestCost + 1.5);
  const chosen = pick(allowed, random);
  return [head, chosen.second, chosen.third, fourth];
}

/**
 * 4音目：次の小節の1音目へ、半音（無ければ全音）で入る音。
 *
 * ただし、いまのコードに合う音を優先する。
 * ここを音の近さだけで選ぶと、G7の上でB♭を鳴らすような、浮いた響きになる。
 */
function pickApproach(
  head: number,
  nextHead: number | undefined,
  tones: number[],
  scale: number[],
  range: { low: number; high: number },
  random: () => number,
): number {
  if (nextHead === undefined) {
    return pickFrom(tones, head, range, random, [head]);
  }

  const candidates = [nextHead - 1, nextHead + 1, nextHead - 2, nextHead + 2].filter(
    midi => midi >= range.low && midi <= range.high && midi !== nextHead,
  );
  if (candidates.length === 0) {
    return pickFrom(tones, nextHead, range, random, [nextHead]);
  }

  const score = (midi: number) => {
    const pc = ((midi % 12) + 12) % 12;
    // いまのコードに合うか。合わない音（半音で外れた音）は大きく不利にする
    const harmony = tones.includes(pc) ? 0 : scale.includes(pc) ? 1.2 : 3;
    // 下から入るほうが落ち着く
    const direction = midi < nextHead ? 0 : 0.5;
    // 半音で入るほうが、次のコードへの流れが強く出る
    const step = Math.abs(midi - nextHead) === 1 ? 0 : 0.6;
    // 1音目から遠すぎない
    const reach = Math.abs(midi - head) * 0.12;
    return harmony + direction + step + reach;
  };

  let best = Infinity;
  candidates.forEach(midi => {
    best = Math.min(best, score(midi));
  });
  return pick(candidates.filter(midi => score(midi) === best), random);
}

/** どうしても見つからないときの逃げ道。重なる音を避けて隣へずらす */
function nudge(
  from: number,
  toward: number,
  range: { low: number; high: number },
  exclude: number[],
): number {
  const direction = toward >= from ? 1 : -1;
  for (let step = 1; step <= 12; step++) {
    for (const sign of [direction, -direction]) {
      const midi = from + sign * step;
      if (midi < range.low || midi > range.high) continue;
      if (exclude.includes(midi)) continue;
      return midi;
    }
  }
  return from;
}

function pickFrom(
  pcs: number[],
  target: number,
  range: { low: number; high: number },
  random: () => number,
  avoid: number[],
): number {
  const candidates = pcs
    .flatMap(pc => intoRange(pc, range))
    .filter(midi => !avoid.includes(midi));
  return nearest(candidates, target, random);
}
