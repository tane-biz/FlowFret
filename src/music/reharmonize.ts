import type { Chord } from './chords';

/**
 * リハーモナイズ（設計方針.md §5）
 *
 * 本来の和音とは違う和音を当てて、不思議な響きを作る手法。俗に「アウト」と呼ばれる。
 * 本の譜例では、同じ4小節を6回繰り返すあいだ、回を追って外し方が変わっていく。
 * これが耳のトレーニングの中心になっている。
 *
 * ここでは譜例から読み取れた置き換えを、4種類の規則として持つ。
 */

export type ReharmKind = 'tritone' | 'diminished' | 'tritoneMinor' | 'upper';

export interface ReharmOption {
  kind: ReharmKind;
  chord: Chord;
  /** 譜面に括弧書きで出す名前のもと */
  label: string;
}

/** 種類ごとの「外れ具合」。小さいほど素直 */
export const OUTNESS: Record<ReharmKind, number> = {
  diminished: 1,
  tritone: 2,
  upper: 2,
  tritoneMinor: 3,
};

/**
 * その和音に当てられる置き換えの候補を返す。
 *
 * ドミナント（7th）がいちばん置き換えやすい。ジャズの定石どおり。
 */
export function reharmOptions(chord: Chord): ReharmOption[] {
  const at = (semitones: number) => (chord.root + semitones) % 12;

  switch (chord.quality) {
    case '7':
      return [
        // 減五度の位置にある同じ役割のセブンス。半音でつながるので置き換えやすい
        { kind: 'tritone', chord: { root: at(6), quality: '7' }, label: '裏コード' },
        // ♭9の響き。7thの根音を抜くとこの形になる
        { kind: 'diminished', chord: { root: at(4), quality: 'dim7' }, label: 'ディミニッシュ' },
        // 裏コードのマイナー7th。さらに外れる
        { kind: 'tritoneMinor', chord: { root: at(6), quality: 'm7' }, label: '裏のm7' },
        // オルタード。元の根音のまま、テンションだけ外す
        { kind: 'upper', chord: { root: chord.root, quality: '7alt' }, label: 'オルタード' },
      ];

    case 'm7':
      return [
        // 上部構造。Dm7 に対する FMaj7♯5 のような重ね方
        { kind: 'upper', chord: { root: at(3), quality: 'maj7#5' }, label: '上部構造' },
        // 5度上のm7。9th・11th・13thの響きになる
        { kind: 'tritoneMinor', chord: { root: at(7), quality: 'm7' }, label: '5度上のm7' },
      ];

    case 'maj7':
      return [
        // 3度上のm7。Maj9の響きになる。いちばん自然な置き換え
        { kind: 'diminished', chord: { root: at(4), quality: 'm7' }, label: '3度上のm7' },
        // 5度上のMaj7。♯11が入ってリディアンの響きになる
        { kind: 'upper', chord: { root: at(7), quality: 'maj7' }, label: '5度上のMaj7' },
      ];

    default:
      return [];
  }
}

/**
 * 何回目の繰り返しで、どこまで外すか（設計方針.md §5）
 *
 * いきなり全部外すと、何が起きているか分からない。
 * 1回目は素直に、回を追って外していく。
 */
export function outnessForPass(pass: number, maxOutness: number): number {
  if (maxOutness <= 0) return 0;
  // 1回目は必ず素直。そこから1回ごとに1段階ずつ上げ、上限で頭打ちにする
  return Math.min(maxOutness, Math.max(0, pass - 1));
}
