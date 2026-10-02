import { chordLabel, type Chord } from './chords';
import { chordsFor, useFlatsForKey, type Progression } from './progressions';
import { outnessForPass, reharmOptions, OUTNESS } from './reharmonize';
import { findVoicing, type Voicing } from './voicings';

/**
 * アルペジオ・モード（設計方針.md B）
 *
 * 弾き語りのための練習。コードを押さえたまま、右手の形を繰り返す。
 * 右手が無意識で回るようになることが目的なので、同じ形をひたすら続ける。
 *
 * 右手の割り当てはクラシックギターの基本どおり。
 *   p（親指）  → ベース弦
 *   i（人差指）→ 3弦
 *   m（中指）  → 2弦
 *   a（薬指）  → 1弦
 */

export type Finger = 'p' | 'i' | 'm' | 'a';

export interface ArpeggioPattern {
  id: string;
  name: string;
  description: string;
  /** 1小節ぶんの指の並び。8分音符8つ */
  fingers: Finger[];
}

export const ARPEGGIO_PATTERNS: ArpeggioPattern[] = [
  {
    id: 'pima',
    name: '基本 p i m a',
    description: '低音から高音へ。いちばん基本の形',
    fingers: ['p', 'i', 'm', 'a', 'p', 'i', 'm', 'a'],
  },
  {
    id: 'pimi',
    name: '内側 p i m i',
    description: '1弦を使わない形。薬指に頼らず弾く',
    fingers: ['p', 'i', 'm', 'i', 'p', 'i', 'm', 'i'],
  },
  {
    id: 'pami',
    name: '下降 p a m i',
    description: '高音から下りてくる形',
    fingers: ['p', 'a', 'm', 'i', 'p', 'a', 'm', 'i'],
  },
  {
    id: 'pimami',
    name: '往復 p i m a m i',
    description: '上って下りる形。「禁じられた遊び」に近い動き',
    fingers: ['p', 'i', 'm', 'a', 'm', 'i', 'p', 'i'],
  },
];

export function patternById(id: string): ArpeggioPattern {
  return ARPEGGIO_PATTERNS.find(p => p.id === id) ?? ARPEGGIO_PATTERNS[0];
}

export interface ArpeggioNote {
  midi: number;
  finger: Finger;
  string: number;
  fret: number;
  /** 小節内の位置。8分音符単位で0〜7 */
  slot: number;
}

export interface ArpeggioMeasure {
  index: number;
  chord: Chord;
  reharm: Chord | null;
  label: string;
  voicing: Voicing;
  notes: ArpeggioNote[];
}

export interface ArpeggioOptions {
  progression: Progression;
  key: number;
  position: number;
  outness: number;
  patternId: string;
  seed: number;
}

export interface ArpeggioExercise {
  measures: ArpeggioMeasure[];
  options: ArpeggioOptions;
  pattern: ArpeggioPattern;
}

function makeRandom(seed: number): () => number {
  let state = (seed | 0) || 1;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return ((state >>> 0) % 100000) / 100000;
  };
}

/** 指から、弾く弦を決める。p＝ベース弦、i＝3弦、m＝2弦、a＝1弦 */
function noteFor(finger: Finger, voicing: Voicing) {
  if (finger === 'p') return voicing.bass;
  const index = finger === 'i' ? 0 : finger === 'm' ? 1 : 2;
  return voicing.upper[index];
}

export function generateArpeggio(options: ArpeggioOptions): ArpeggioExercise {
  const { progression, key, position, outness, patternId, seed } = options;
  const random = makeRandom(seed);
  const pattern = patternById(patternId);
  const useFlats = useFlatsForKey(key);
  const base = chordsFor(progression, key);

  const measures: ArpeggioMeasure[] = [];
  // 直前の押さえ方。次のコードは、ここから近い形を選ぶ
  let previous: Voicing | null = null;

  for (let pass = 1; pass <= progression.repeats; pass++) {
    const limit = outnessForPass(pass, outness);

    base.forEach(chord => {
      let reharm = chooseReharm(chord, limit, random);

      // 押さえられる形を探す。置き換えたコードが押さえられなければ、元のコードに戻す
      let voicing = reharm ? findVoicing(reharm, position, previous) : null;
      if (!voicing) {
        reharm = null;
        voicing = findVoicing(chord, position, previous);
      }
      if (!voicing) return;
      previous = voicing;

      const notes: ArpeggioNote[] = pattern.fingers.map((finger, slot) => {
        const target = noteFor(finger, voicing);
        return {
          midi: target.midi,
          string: target.string,
          fret: target.fret,
          finger,
          slot,
        };
      });

      measures.push({
        index: measures.length,
        chord,
        reharm,
        label: reharm
          ? `${chordLabel(chord, useFlats)}(${chordLabel(reharm, useFlats)})`
          : chordLabel(chord, useFlats),
        voicing,
        notes,
      });
    });
  }

  // 最後に、トニックを1回だけ鳴らして終わる
  const tonic = base[0];
  const finalVoicing = findVoicing(tonic, position, previous);
  if (finalVoicing) {
    measures.push({
      index: measures.length,
      chord: tonic,
      reharm: null,
      label: chordLabel(tonic, useFlats),
      voicing: finalVoicing,
      notes: [
        { ...finalVoicing.bass, finger: 'p', slot: 0 },
        { ...finalVoicing.upper[0], finger: 'i', slot: 0 },
        { ...finalVoicing.upper[1], finger: 'm', slot: 0 },
        { ...finalVoicing.upper[2], finger: 'a', slot: 0 },
      ],
    });
  }

  return { measures, options, pattern };
}

function chooseReharm(chord: Chord, limit: number, random: () => number): Chord | null {
  if (limit <= 0) return null;
  const options = reharmOptions(chord).filter(o => OUTNESS[o.kind] <= limit);
  if (options.length === 0) return null;
  if (random() < 0.4) return null;
  return options[Math.floor(random() * options.length) % options.length].chord;
}
