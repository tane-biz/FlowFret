import type { Chord, ChordQuality } from './chords';

/**
 * コード進行の定義（設計方針.md §3）
 *
 * 進行は「キーの主音から何半音上か」で持つ。
 * こうしておけば、1つ定義するだけで12キーすべてに移調できる。
 */

export interface ProgressionStep {
  /** キーの主音からの半音差。I＝0、VI＝9、II＝2、V＝7 */
  degree: number;
  quality: ChordQuality;
}

export interface Progression {
  id: string;
  name: string;
  description: string;
  /** 1コーラスの小節（1小節＝1コード） */
  steps: ProgressionStep[];
  /** 何回繰り返して1セットにするか */
  repeats: number;
  /** 使うキー（主音の半音値）。本と同じ並び */
  keys: number[];
}

/** 本と同じキーの並び：C G D A E B F B♭ E♭ A♭ D♭ G♭ */
const JAZZ_KEYS = [0, 7, 2, 9, 4, 11, 5, 10, 3, 8, 1, 6];

/**
 * 歌謡曲で使う並び。ギターで押さえやすいキーを先に置く。
 * 弾き語りでは、この順に出てくることが多い。
 */
const POP_KEYS = [0, 7, 2, 9, 4, 5, 10, 3, 8, 11, 1, 6];

/** ♭で書くキー（F・B♭・E♭・A♭・D♭・G♭） */
const FLAT_KEYS = new Set([5, 10, 3, 8, 1, 6]);

export function useFlatsForKey(key: number): boolean {
  return FLAT_KEYS.has(((key % 12) + 12) % 12);
}

export const PROGRESSIONS: Progression[] = [
  {
    id: '1625',
    name: '1625進行',
    description: 'I-VI-II-V。ジャズでいちばん基本の循環コード',
    steps: [
      { degree: 0, quality: 'maj7' }, // I
      { degree: 9, quality: '7' },    // VI7（セカンダリー・ドミナント）
      { degree: 2, quality: 'm7' },   // IIm7
      { degree: 7, quality: '7' },    // V7
    ],
    repeats: 6,
    keys: JAZZ_KEYS,
  },
  {
    id: 'oudou',
    name: '王道進行',
    description: 'IV-V-IIIm-VIm。日本のポップスでいちばん多い',
    steps: [
      { degree: 5, quality: 'maj7' }, // IVMaj7
      { degree: 7, quality: '7' },    // V7
      { degree: 4, quality: 'm7' },   // IIIm7
      { degree: 9, quality: 'm7' },   // VIm7
    ],
    repeats: 6,
    keys: POP_KEYS,
  },
  {
    id: 'komuro',
    name: '小室進行',
    description: 'VIm-IV-V-I。サビで多く使われる',
    steps: [
      { degree: 9, quality: 'm7' },   // VIm7
      { degree: 5, quality: 'maj7' }, // IVMaj7
      { degree: 7, quality: '7' },    // V7
      { degree: 0, quality: 'maj7' }, // IMaj7
    ],
    repeats: 6,
    keys: POP_KEYS,
  },
  {
    id: '1564',
    name: '1564進行',
    description: 'I-V-VIm-IV。弾き語りの基本形',
    steps: [
      { degree: 0, quality: 'maj7' },
      { degree: 7, quality: '7' },
      { degree: 9, quality: 'm7' },
      { degree: 5, quality: 'maj7' },
    ],
    repeats: 6,
    keys: POP_KEYS,
  },
  {
    id: 'canon',
    name: 'カノン進行',
    description: 'I-V-VIm-IIIm-IV-I-IV-V。8小節の定番',
    steps: [
      { degree: 0, quality: 'maj7' },
      { degree: 7, quality: '7' },
      { degree: 9, quality: 'm7' },
      { degree: 4, quality: 'm7' },
      { degree: 5, quality: 'maj7' },
      { degree: 0, quality: 'maj7' },
      { degree: 5, quality: 'maj7' },
      { degree: 7, quality: '7' },
    ],
    repeats: 3,
    keys: POP_KEYS,
  },
];

export function progressionById(id: string): Progression {
  return PROGRESSIONS.find(p => p.id === id) ?? PROGRESSIONS[0];
}

/** 進行とキーから、実際の和音の並びを作る */
export function chordsFor(progression: Progression, key: number): Chord[] {
  return progression.steps.map(step => ({
    root: ((key + step.degree) % 12 + 12) % 12,
    quality: step.quality,
  }));
}

export const KEY_ORDER = JAZZ_KEYS;
