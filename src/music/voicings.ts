import { chordToneSet, type Chord } from './chords';

/**
 * コードの押さえ方を、その場で計算する（設計方針.md B-①）
 *
 * 押さえ方の表を手で作らず、計算で求める。
 * 指定ポジションの中から、各弦でコードの構成音になるフレットを探し、
 * 指が届く範囲に収まる組み合わせを選ぶ。
 *
 * この方式なら12キーすべて・どのコードでも出せて、
 * 「押さえられない形」が原理的に出ない。
 */

/** 6弦から1弦までの、開放弦の実音 */
const OPEN_STRINGS = [40, 45, 50, 55, 59, 64];

/** 指が届く範囲。人差し指から小指まで4フレット */
const HAND_SPAN = 4;

export interface StringNote {
  /** 1弦＝1、6弦＝6 */
  string: number;
  fret: number;
  /** 実音のMIDI番号 */
  midi: number;
}

export interface Voicing {
  /** 親指（p）で弾く低音弦 */
  bass: StringNote;
  /** 3弦・2弦・1弦。それぞれ i・m・a で弾く */
  upper: [StringNote, StringNote, StringNote];
}

/** 弦番号（1〜6）から、配列の添字へ */
function indexOf(stringNumber: number): number {
  return 6 - stringNumber;
}

function noteAt(stringNumber: number, fret: number): StringNote {
  return { string: stringNumber, fret, midi: OPEN_STRINGS[indexOf(stringNumber)] + fret };
}

/** 低い位置では開放弦を使う。弾き語りの定番の形がここに入る */
const OPEN_STRING_LIMIT = 3;

/**
 * その弦で、コードの構成音になるフレットの候補を返す。
 *
 * 開放弦を混ぜてよいのは低い位置のときだけにする。
 * 高い位置で開放弦を混ぜると、手が離れた不自然な形になってしまう。
 */
function candidates(stringNumber: number, chord: Chord, position: number): StringNote[] {
  const tones = chordToneSet(chord);
  const result: StringNote[] = [];
  const allowOpen = position <= OPEN_STRING_LIMIT;
  const low = Math.max(allowOpen ? 0 : 1, position - 1);
  const high = position + HAND_SPAN;

  for (let fret = low; fret <= high; fret++) {
    if (fret === 0 && !allowOpen) continue;
    const note = noteAt(stringNumber, fret);
    if (tones.includes(((note.midi % 12) + 12) % 12)) result.push(note);
  }
  return result;
}

/** 押さえている指の広がり（開放弦は数えない） */
function span(frets: number[]): number {
  const pressed = frets.filter(f => f > 0);
  if (pressed.length <= 1) return 0;
  return Math.max(...pressed) - Math.min(...pressed);
}

/** 押さえている位置のおおよその中心。手がどこにあるかの目安 */
export function voicingCenter(voicing: Voicing): number {
  const frets = [voicing.bass.fret, ...voicing.upper.map(u => u.fret)].filter(f => f > 0);
  if (frets.length === 0) return 0;
  return frets.reduce((a, b) => a + b, 0) / frets.length;
}

/**
 * 指定ポジションで、そのコードの押さえ方を1つ求める。
 *
 * 低音弦は根音を優先する（弾き語りではベースが根音でないと落ち着かない）。
 *
 * previous を渡すと、前のコードの近くにある形を選ぶ。
 * 弾き語りでいちばん難しいのはコードチェンジなので、
 * 1小節ごとに手が飛ぶ形を出すと練習にならない。
 */
export function findVoicing(
  chord: Chord,
  position: number,
  previous?: Voicing | null,
): Voicing | null {
  const rootPc = chord.root % 12;

  // ① 親指で弾く低音弦を決める。6弦→5弦→4弦の順に、根音があるものを探す
  const bassCandidates: StringNote[] = [];
  for (const stringNumber of [6, 5, 4]) {
    candidates(stringNumber, chord, position).forEach(note => {
      const isRoot = ((note.midi % 12) + 12) % 12 === rootPc;
      if (isRoot) bassCandidates.push(note);
    });
  }
  // 根音が見つからない場合は、構成音のいちばん低い音で代用する
  if (bassCandidates.length === 0) {
    for (const stringNumber of [6, 5, 4]) {
      bassCandidates.push(...candidates(stringNumber, chord, position));
    }
  }
  if (bassCandidates.length === 0) return null;

  // ② 3弦・2弦・1弦の候補
  const third = candidates(3, chord, position);
  const second = candidates(2, chord, position);
  const first = candidates(1, chord, position);
  if (third.length === 0 || second.length === 0 || first.length === 0) return null;

  // ③ 指が届いて、音がよく散らばる組み合わせを選ぶ
  let best: { voicing: Voicing; cost: number } | null = null;

  for (const bass of bassCandidates) {
    for (const t of third) {
      for (const s of second) {
        for (const f of first) {
          const frets = [bass.fret, t.fret, s.fret, f.fret];
          const width = span(frets);
          if (width > HAND_SPAN) continue;

          // 上の3弦は、音が上がっていくほうがアルペジオらしく響く
          if (!(t.midi < s.midi && s.midi < f.midi)) continue;

          // 何種類の構成音が鳴るか。多いほど和音らしく響く
          const pcs = new Set<number>();
          [bass, t, s, f].forEach(n => pcs.add(((n.midi % 12) + 12) % 12));

          const candidate: Voicing = { bass, upper: [t, s, f] };
          // 前のコードからの手の移動量。近いほうが弾きやすい
          const move = previous ? Math.abs(voicingCenter(candidate) - voicingCenter(previous)) : 0;

          const cost =
            width * 2 +                                   // 手の広がりは小さいほうが楽
            (chordToneSet(chord).length - pcs.size) * 3 + // 構成音が多く鳴るほうがよい
            frets.filter(x => x === 0).length * -0.5 +    // 開放弦は少し有利（押さえが楽）
            Math.abs(bass.string - 6) * 0.3 +             // ベースは低い弦のほうが落ち着く
            move * 1.8;                                   // 前のコードから遠いほど不利

          if (best === null || cost < best.cost) {
            best = { voicing: candidate, cost };
          }
        }
      }
    }
  }

  return best?.voicing ?? null;
}
