// アルペジオ・モードの検算（設計方針.md B-⑥）
//
// いちばん大事なのは「実際に押さえられるか」。
// 指が届かない形を出してしまうと、練習にならない。

import { build } from 'esbuild';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';

const APP = dirname(dirname(fileURLToPath(import.meta.url)));
const BUNDLE = join(APP, 'node_modules', '.cache-verify-arpeggio.mjs');

await build({
  stdin: {
    contents: `
      export { generateArpeggio, ARPEGGIO_PATTERNS } from './src/music/arpeggio';
      export { findVoicing, voicingCenter } from './src/music/voicings';
      export { PROGRESSIONS } from './src/music/progressions';
      export { chordToneSet, chordLabel } from './src/music/chords';
    `,
    resolveDir: APP,
    loader: 'ts',
  },
  bundle: true,
  format: 'esm',
  platform: 'neutral',
  outfile: BUNDLE,
  logLevel: 'warning',
});

const { generateArpeggio, ARPEGGIO_PATTERNS, PROGRESSIONS, chordToneSet, voicingCenter } =
  await import(pathToFileURL(BUNDLE).href);

let failures = 0;
let checks = 0;

function section(title) {
  console.log('');
  console.log(`=== ${title} ===`);
}

function check(label, ok, detail = '') {
  checks++;
  if (!ok) failures++;
  console.log(`${ok ? '  OK ' : '★NG '} ${label}${detail ? `  ${detail}` : ''}`);
}

const HAND_SPAN = 4;

function inspect(exercise) {
  const problems = { span: [], tones: [], strings: [], fingers: [], order: [], bass: [], move: [] };
  const pattern = exercise.pattern.fingers;

  exercise.measures.forEach((measure, i) => {
    const isFinal = i === exercise.measures.length - 1;
    const { bass, upper } = measure.voicing;
    const used = [bass.fret, ...upper.map(u => u.fret)].filter(f => f > 0);

    // ① 指が届くか
    if (used.length > 1 && Math.max(...used) - Math.min(...used) > HAND_SPAN) {
      problems.span.push(`${i + 1}小節`);
    }

    // ② 鳴る音がすべてコードの構成音か
    const sounding = measure.reharm ?? measure.chord;
    const tones = chordToneSet(sounding);
    [bass, ...upper].forEach(n => {
      if (!tones.includes(((n.midi % 12) + 12) % 12)) problems.tones.push(`${i + 1}小節`);
    });

    // ③ 弦の割り当て。i＝3弦、m＝2弦、a＝1弦、p＝6〜4弦
    if (![6, 5, 4].includes(bass.string)) problems.bass.push(`${i + 1}小節`);
    if (upper[0].string !== 3 || upper[1].string !== 2 || upper[2].string !== 1) {
      problems.strings.push(`${i + 1}小節`);
    }

    // ④ 上の3弦は音が上がっていくこと
    if (!(upper[0].midi < upper[1].midi && upper[1].midi < upper[2].midi)) {
      problems.order.push(`${i + 1}小節`);
    }

    // ⑤ 前のコードから手が飛びすぎないか（コードチェンジの練習にならなくなる）
    const prev = exercise.measures[i - 1];
    if (prev) {
      const distance = Math.abs(voicingCenter(measure.voicing) - voicingCenter(prev.voicing));
      if (distance > 5) problems.move.push(`${i}→${i + 1}小節（${distance.toFixed(1)}フレット）`);
    }

    // ⑥ 右手の並びがパターンどおりか
    if (!isFinal) {
      const fingers = measure.notes.map(n => n.finger).join('');
      if (fingers !== pattern.join('')) problems.fingers.push(`${i + 1}小節 ${fingers}`);
    }
  });

  return problems;
}

// ─────────────────────────────────────────────

section('王道進行 in C・5ポジション・基本パターン');
{
  const ex = generateArpeggio({
    progression: PROGRESSIONS[1], key: 0, position: 5,
    outness: 0, patternId: 'pima', seed: 1,
  });
  const p = inspect(ex);
  check('小節数が25（4小節×6回＋終わり）', ex.measures.length === 25, `実際 ${ex.measures.length}`);
  check('指が届く（4フレット以内）', p.span.length === 0, p.span.slice(0, 5).join(' '));
  check('鳴る音がすべて構成音', p.tones.length === 0, p.tones.slice(0, 5).join(' '));
  check('親指は6〜4弦', p.bass.length === 0, p.bass.slice(0, 5).join(' '));
  check('i＝3弦 m＝2弦 a＝1弦', p.strings.length === 0, p.strings.slice(0, 5).join(' '));
  check('上の3弦は音が上がる', p.order.length === 0, p.order.slice(0, 5).join(' '));
  check('コードチェンジで手が飛ばない', p.move.length === 0, p.move.slice(0, 5).join(' '));
  check('右手の並びがパターンどおり', p.fingers.length === 0, p.fingers.slice(0, 3).join(' '));
  check('1小節が8分音符8つ', ex.measures.slice(0, -1).every(m => m.notes.length === 8));
}

section('全5進行 × 全12キー × 4ポジション × 4パターン');
{
  let total = 0;
  let missing = 0;
  const bad = { span: 0, tones: 0, strings: 0, fingers: 0, order: 0, bass: 0, move: 0 };

  for (const prog of PROGRESSIONS) {
    for (const key of prog.keys) {
      for (const position of [1, 5, 7, 9]) {
        for (const pattern of ARPEGGIO_PATTERNS) {
          const ex = generateArpeggio({
            progression: prog, key, position,
            outness: 0, patternId: pattern.id, seed: key * 17 + position,
          });
          total++;
          const expected = prog.steps.length * prog.repeats + 1;
          if (ex.measures.length !== expected) missing++;
          const p = inspect(ex);
          Object.keys(bad).forEach(k => { if (p[k].length > 0) bad[k]++; });
        }
      }
    }
  }

  console.log(`  試した組み合わせ：${total}通り`);
  check('押さえ方が見つからない組み合わせがない', missing === 0, `${missing}件`);
  check('指が届く', bad.span === 0, `${bad.span}件`);
  check('鳴る音がすべて構成音', bad.tones === 0, `${bad.tones}件`);
  check('親指は6〜4弦', bad.bass === 0, `${bad.bass}件`);
  check('i＝3弦 m＝2弦 a＝1弦', bad.strings === 0, `${bad.strings}件`);
  check('上の3弦は音が上がる', bad.order === 0, `${bad.order}件`);
  check('コードチェンジで手が飛ばない', bad.move === 0, `${bad.move}件`);
  check('右手の並びがパターンどおり', bad.fingers === 0, `${bad.fingers}件`);
}

section('押さえ方（目で見て確認する用）王道進行 in C・5ポジション');
{
  const ex = generateArpeggio({
    progression: PROGRESSIONS[1], key: 0, position: 5,
    outness: 0, patternId: 'pima', seed: 1,
  });
  ex.measures.slice(0, 4).forEach(m => {
    const { bass, upper } = m.voicing;
    const show = n => `${n.string}弦${n.fret}F`;
    console.log(
      `  ${m.label.padEnd(10)} p:${show(bass).padEnd(7)} i:${show(upper[0]).padEnd(7)} ` +
      `m:${show(upper[1]).padEnd(7)} a:${show(upper[2])}`,
    );
  });
}

console.log('');
console.log('───────────────────────────────');
console.log(failures === 0 ? `全 ${checks} 項目 合格` : `★ ${failures} 項目 不合格（全 ${checks} 項目）`);
process.exit(failures === 0 ? 0 : 1);
