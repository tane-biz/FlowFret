// 無窮動フレーズの検算（設計方針.md §9）
//
// 規則どおりに作れているかを数値で確かめる。
// 音楽的な良し悪しは測れないので、最後は必ず音を聴いて確かめること。

import { build } from 'esbuild';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';

const APP = dirname(dirname(fileURLToPath(import.meta.url)));
const BUNDLE = join(APP, 'node_modules', '.cache-verify-generate.mjs');

await build({
  stdin: {
    contents: `
      export { generateExercise, positionRange } from './src/music/generate';
      export { PROGRESSIONS, chordsFor, useFlatsForKey } from './src/music/progressions';
      export { chordToneSet, guideToneSet, scaleSet, chordLabel, pitchClassName } from './src/music/chords';
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

const {
  generateExercise, positionRange, PROGRESSIONS,
  chordToneSet, guideToneSet, scaleSet,
} = await import(pathToFileURL(BUNDLE).href);

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

const progression = PROGRESSIONS[0];
const KEY_ORDER = PROGRESSIONS[0].keys;

/** 1つの練習を検査する */
function inspect(exercise, { position, outness }) {
  const range = positionRange(position);
  const problems = {
    beats: [], range: [], head: [], approach: [], repeat: [], leap: [], outside: [], wide: [],
  };

  const body = exercise.measures.slice(0, -1); // 最後は終止の全音符なので別扱い

  body.forEach((measure, i) => {
    if (measure.notes.length !== 4) problems.beats.push(measure.index + 1);

    const sounding = measure.reharm ?? measure.chord;
    const tones = chordToneSet(sounding);
    const guides = guideToneSet(sounding);
    const scale = scaleSet(sounding);

    measure.notes.forEach((note, k) => {
      const pc = ((note.midi % 12) + 12) % 12;
      if (note.midi < range.low || note.midi > range.high) {
        problems.range.push(`${measure.index + 1}小節${k + 1}拍`);
      }
      // 1拍目はガイドトーン（無い場合はコードトーン）
      if (k === 0 && !guides.includes(pc) && !tones.includes(pc)) {
        problems.head.push(`${measure.index + 1}小節`);
      }
      // 2・3拍目はコードトーンかスケール音
      if ((k === 1 || k === 2) && !tones.includes(pc) && !scale.includes(pc)) {
        // アプローチノートとして半音で隣に入るなら許容
        const next = measure.notes[k + 1];
        if (!next || Math.abs(next.midi - note.midi) > 2) {
          problems.head.push(`${measure.index + 1}小節${k + 1}拍`);
        }
      }
    });

    // 4拍目は次の小節の1音目の半音または全音隣
    const next = body[i + 1] ?? exercise.measures[exercise.measures.length - 1];
    if (next) {
      const gap = Math.abs(measure.notes[3].midi - next.notes[0].midi);
      if (gap > 2) problems.approach.push(`${measure.index + 1}→${next.index + 1}小節（${gap}半音）`);
    }

    // 4拍目は、いまのコードに合う音であること。
    // ただし半音で次の音へ入るなら、アプローチノートとして認める（本の3要素のひとつ）
    const fourthPc = ((measure.notes[3].midi % 12) + 12) % 12;
    const isApproach = next && Math.abs(measure.notes[3].midi - next.notes[0].midi) === 1;
    if (!tones.includes(fourthPc) && !scale.includes(fourthPc) && !isApproach) {
      problems.outside.push(`${measure.index + 1}小節`);
    }
  });

  // 同じ音の連続と、跳びすぎ
  const all = exercise.measures.flatMap(m => m.notes.map(n => n.midi));
  for (let i = 1; i < all.length; i++) {
    if (all[i] === all[i - 1]) problems.repeat.push(i);
    const jump = Math.abs(all[i] - all[i - 1]);
    if (jump > 9) problems.leap.push(`${all[i - 1]}→${all[i]}`);
    if (jump > 7) problems.wide.push(`${all[i - 1]}→${all[i]}（${jump}半音）`);
  }

  return problems;
}

// ─────────────────────────────────────────────

section('Cキー・5ポジション・リハモなし');
{
  const ex = generateExercise({ progression, key: 0, position: 5, outness: 0, seed: 1 });
  const p = inspect(ex, { position: 5, outness: 0 });
  check('小節数が25（4小節×6回＋終止）', ex.measures.length === 25, `実際 ${ex.measures.length}`);
  check('全小節が4分音符4つ', p.beats.length === 0, p.beats.join(','));
  check('全音が5ポジションの音域内', p.range.length === 0, p.range.slice(0, 5).join(' '));
  check('1拍目がコードの要の音', p.head.length === 0, p.head.slice(0, 5).join(' '));
  check('4拍目が次の1音目の隣（2半音以内）', p.approach.length === 0, p.approach.slice(0, 5).join(' '));
  check('同じ音が連続しない', p.repeat.length === 0, `${p.repeat.length}箇所`);
  check('4拍目がコードに合う音', p.outside.length === 0, p.outside.slice(0, 5).join(' '));
  check('跳躍が7半音以内', p.wide.length === 0, p.wide.slice(0, 5).join(' '));
  check('リハモなし指定で置き換えが起きない', ex.measures.every(m => m.reharm === null));
}

section('同じ種なら同じフレーズが出る');
{
  const a = generateExercise({ progression, key: 0, position: 5, outness: 2, seed: 42 });
  const b = generateExercise({ progression, key: 0, position: 5, outness: 2, seed: 42 });
  const c = generateExercise({ progression, key: 0, position: 5, outness: 2, seed: 43 });
  const flat = ex => ex.measures.flatMap(m => m.notes.map(n => n.midi)).join(',');
  check('種が同じなら同じ', flat(a) === flat(b));
  check('種が違えば違う', flat(a) !== flat(c));
}

section('リハーモナイズ（1回目は素直、回を追って外す）');
{
  const ex = generateExercise({ progression, key: 0, position: 5, outness: 3, seed: 7 });
  const firstPass = ex.measures.slice(0, 4);
  check('1回目はリハモなし', firstPass.every(m => m.reharm === null));
  const later = ex.measures.slice(4, 24).filter(m => m.reharm !== null).length;
  check('2回目以降に置き換えが入る', later > 0, `${later}小節`);
}

section('繰り返しが、同じフレーズにならない');
{
  let worst = 99;
  let worstWhere = '';
  for (const prog of PROGRESSIONS) {
    const bars = prog.steps.length;
    const line = (ex, pass) =>
      ex.measures.slice(pass * bars, pass * bars + bars)
        .flatMap(m => m.notes.map(n => n.midi)).join(',');
    for (const key of prog.keys) {
      for (const outness of [0, 1, 2, 3]) {
        const ex = generateExercise({ progression: prog, key, position: 5, outness, seed: key * 31 + 7 });
        const passes = [...Array(prog.repeats).keys()];
        const distinct = new Set(passes.map(p => line(ex, p))).size;
        if (distinct < worst) { worst = distinct; worstWhere = `${prog.name}/${key}/外し${outness}`; }
      }
    }
  }
  check('どの条件でも、繰り返しの大半が違うフレーズ', worst >= 3, `最少 ${worst} 種類（${worstWhere}）`);
}

section('全5進行 × 全12キー × 4ポジション × 外し具合0〜3');
{
  let total = 0;
  const bad = { beats: 0, range: 0, head: 0, approach: 0, repeat: 0, leap: 0, outside: 0, wide: 0 };
  for (const prog of PROGRESSIONS) {
    for (const key of prog.keys) {
      for (const position of [1, 5, 7, 9]) {
        for (const outness of [0, 1, 2, 3]) {
          for (let seed = 1; seed <= 3; seed++) {
            const ex = generateExercise({ progression: prog, key, position, outness, seed });
            const expected = prog.steps.length * prog.repeats + 1;
            if (ex.measures.length !== expected) bad.beats++;
            const p = inspect(ex, { position, outness });
            total++;
            Object.keys(bad).forEach(k => { if (p[k].length > 0) bad[k]++; });
          }
        }
      }
    }
  }
  console.log(`  試した組み合わせ：${total}通り`);
  check('全小節が4分音符4つ', bad.beats === 0, `${bad.beats}件`);
  check('全音が音域内', bad.range === 0, `${bad.range}件`);
  check('1拍目がコードの要の音', bad.head === 0, `${bad.head}件`);
  check('4拍目が次の1音目の隣', bad.approach === 0, `${bad.approach}件`);
  check('同じ音が連続しない', bad.repeat === 0, `${bad.repeat}件`);
  check('4拍目がコードに合う音', bad.outside === 0, `${bad.outside}件`);
  check('跳躍が7半音以内', bad.wide === 0, `${bad.wide}件`);
}

section('王道進行 in C の譜面（目で見て確認する用）');
{
  const ex = generateExercise({ progression: PROGRESSIONS[1], key: 0, position: 5, outness: 0, seed: 2026 });
  const NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const name = m => `${NAMES[((m % 12) + 12) % 12]}${Math.floor(m / 12) - 1}`;
  ex.measures.forEach(m => {
    const notes = m.notes.map(n => name(n.midi).padEnd(4)).join(' ');
    console.log(`  ${String(m.index + 1).padStart(2)}  ${m.label.padEnd(18)} ${notes}`);
  });
}

console.log('');
console.log('───────────────────────────────');
console.log(failures === 0 ? `全 ${checks} 項目 合格` : `★ ${failures} 項目 不合格（全 ${checks} 項目）`);
process.exit(failures === 0 ? 0 : 1);
