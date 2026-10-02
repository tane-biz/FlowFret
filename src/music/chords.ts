/**
 * コードとスケールの定義（設計方針.md §4）
 *
 * 音の高さは半音の数で表す。0＝ド、1＝ド♯、2＝レ …… 11＝シ。
 * 和音は「根音からの半音差」で持つので、どのキーにも同じ形を当てはめられる。
 */

export type ChordQuality =
  | 'maj7'
  | 'm7'
  | '7'
  | '7alt'
  | 'm7b5'
  | 'dim7'
  | 'maj7#5'
  | 'm6';

export interface Chord {
  /** 根音。0＝ド、1＝ド♯ …… 11＝シ */
  root: number;
  quality: ChordQuality;
}

/** 根音からの半音差で表した構成音（1度・3度・5度・7度） */
export const CHORD_TONES: Record<ChordQuality, number[]> = {
  maj7: [0, 4, 7, 11],
  m7: [0, 3, 7, 10],
  '7': [0, 4, 7, 10],
  '7alt': [0, 4, 10, 8], // 1・3・♭7・♯5。オルタード（外した響き）
  m7b5: [0, 3, 6, 10],
  dim7: [0, 3, 6, 9],
  'maj7#5': [0, 4, 8, 11],
  m6: [0, 4, 7, 9],
};

/**
 * その和音の上で使えるスケール（音階）。
 * コードトーンの間を埋めるときに使う。
 */
export const CHORD_SCALES: Record<ChordQuality, number[]> = {
  maj7: [0, 2, 4, 7, 9, 11], // アイオニアン。4度は濁るので外す
  m7: [0, 2, 3, 5, 7, 9, 10], // ドリアン
  '7': [0, 2, 4, 5, 7, 9, 10], // ミクソリディアン
  '7alt': [0, 1, 3, 4, 6, 8, 10], // オルタード
  m7b5: [0, 2, 3, 5, 6, 8, 10], // ロクリアン♯2
  dim7: [0, 2, 3, 5, 6, 8, 9, 11], // コンビネーション・オブ・ディミニッシュ
  'maj7#5': [0, 2, 4, 6, 8, 9, 11], // リディアン・オーグメント
  m6: [0, 2, 3, 5, 7, 9, 11], // メロディック・マイナー
};

/**
 * ガイドトーン＝その和音の性格をいちばん強く表す音。
 * 3度と7度。無窮動では各小節の1音目に置く。
 */
export const GUIDE_TONES: Record<ChordQuality, number[]> = {
  maj7: [4, 11],
  m7: [3, 10],
  '7': [4, 10],
  '7alt': [4, 10],
  m7b5: [3, 10],
  dim7: [3, 9],
  'maj7#5': [4, 11],
  m6: [4, 9],
};

/** 和音の表示名（例：CMaj7） */
const QUALITY_LABEL: Record<ChordQuality, string> = {
  maj7: 'Maj7',
  m7: 'm7',
  '7': '7',
  '7alt': '7alt',
  m7b5: 'm7♭5',
  dim7: 'dim7',
  'maj7#5': 'Maj7♯5',
  m6: 'm6',
};

/**
 * 音名の書き方。
 * キーによって♯で書くか♭で書くかを変える（例：B♭キーでA♯とは書かない）。
 */
const SHARP_NAMES = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];
const FLAT_NAMES = ['C', 'D♭', 'D', 'E♭', 'E', 'F', 'G♭', 'G', 'A♭', 'A', 'B♭', 'B'];

export function pitchClassName(pc: number, useFlats: boolean): string {
  const index = ((pc % 12) + 12) % 12;
  return useFlats ? FLAT_NAMES[index] : SHARP_NAMES[index];
}

export function chordLabel(chord: Chord, useFlats: boolean): string {
  return pitchClassName(chord.root, useFlats) + QUALITY_LABEL[chord.quality];
}

/** 和音の構成音を、半音の集合（0〜11）として返す */
export function chordToneSet(chord: Chord): number[] {
  return CHORD_TONES[chord.quality].map(interval => (chord.root + interval) % 12);
}

export function scaleSet(chord: Chord): number[] {
  return CHORD_SCALES[chord.quality].map(interval => (chord.root + interval) % 12);
}

export function guideToneSet(chord: Chord): number[] {
  return GUIDE_TONES[chord.quality].map(interval => (chord.root + interval) % 12);
}
