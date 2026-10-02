// メロディ＋ベースの2声モードの検算（設計方針.md C）
//
// 単旋律と違い「同時に押さえられるか」が要点になる。
// メロディが1〜3弦、ベースが4〜6弦の範囲に収まっていれば、
// どちらも同じポジションで押さえられる。

import { build } from 'esbuild';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';

const APP = dirname(dirname(fileURLToPath(import.meta.url)));
const BUNDLE = join(APP, 'node_modules', '.cache-verify-duo.mjs');

await build({
  stdin: {
    contents: `
      export { generateDuo, melodyRangeFor, bassRangeFor } from './src/music/duo';
      export { duoToScore, duoToMusicXml } from './src/music/render';
      export { PROGRESSIONS } from './src/music/progressions';
      export { chordToneSet } from './src/music/chords';
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

const { generateDuo, melodyRangeFor, bassRangeFor, PROGRESSIONS, chordToneSet, duoToScore, duoToMusicXml } =
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

function inspect(exercise, position) {
  const mRange = melodyRangeFor(position);
  const bRange = bassRangeFor(position);
  const problems = { melody: [], bass: [], overlap: [], root: [], move: [], beats: [] };

  exercise.measures.forEach((measure, i) => {
    const isFinal = i === exercise.measures.length - 1;

    if (!isFinal && measure.melody.length !== 4) problems.beats.push(`${i + 1}小節`);

    measure.melody.forEach(midi => {
      if (midi < mRange.low || midi > mRange.high) problems.melody.push(`${i + 1}小節`);
      // メロディがベースより低くなると、声部が入れ替わって聞こえる
      if (midi <= measure.bass) problems.overlap.push(`${i + 1}小節`);
    });

    if (measure.bass < bRange.low || measure.bass > bRange.high) {
      problems.bass.push(`${i + 1}小節`);
    }

    // ベースは根音が基本
    const sounding = measure.reharm ?? measure.chord;
    const rootPc = sounding.root % 12;
    const bassPc = ((measure.bass % 12) + 12) % 12;
    const tones = chordToneSet(sounding);
    if (bassPc !== rootPc && !tones.includes(bassPc)) problems.root.push(`${i + 1}小節`);

    // 低音の動き。
    // ベースに使える音域は1ポジションあたり10〜15半音しかなく、
    // コードによっては根音どうしがそれ以上離れる。
    // 根音を鳴らすほうが土台として重要なので、1オクターブまでは許す。
    const prev = exercise.measures[i - 1];
    if (prev && Math.abs(measure.bass - prev.bass) > 12) {
      problems.move.push(`${i}→${i + 1}小節（${Math.abs(measure.bass - prev.bass)}半音）`);
    }
  });

  return problems;
}

// ─────────────────────────────────────────────

section('王道進行 in C・5ポジション');
{
  const ex = generateDuo({
    progression: PROGRESSIONS[1], key: 0, position: 5, outness: 0, seed: 1,
  });
  const p = inspect(ex, 5);
  check('小節数が25', ex.measures.length === 25, `実際 ${ex.measures.length}`);
  check('メロディが1〜3弦の範囲', p.melody.length === 0, p.melody.slice(0, 5).join(' '));
  check('ベースが4〜6弦の範囲', p.bass.length === 0, p.bass.slice(0, 5).join(' '));
  check('メロディがベースより高い', p.overlap.length === 0, p.overlap.slice(0, 5).join(' '));
  check('ベースがコードの構成音', p.root.length === 0, p.root.slice(0, 5).join(' '));
  check('低音が1オクターブを超えて飛ばない', p.move.length === 0, p.move.slice(0, 5).join(' '));
  check('1小節が4分音符4つ', p.beats.length === 0, p.beats.slice(0, 5).join(' '));
}

section('全5進行 × 全12キー × 4ポジション × 外し具合0〜3');
{
  let total = 0;
  let rootCount = 0;
  let noteCount = 0;
  const bad = { melody: 0, bass: 0, overlap: 0, root: 0, move: 0, beats: 0 };

  for (const prog of PROGRESSIONS) {
    for (const key of prog.keys) {
      for (const position of [1, 5, 7, 9]) {
        for (const outness of [0, 1, 2, 3]) {
          const ex = generateDuo({ progression: prog, key, position, outness, seed: key * 13 + position });
          const p = inspect(ex, position);
          ex.measures.forEach(m => {
            noteCount++;
            const sounding = m.reharm ?? m.chord;
            if (((m.bass % 12) + 12) % 12 === sounding.root % 12) rootCount++;
          });
          total++;
          Object.keys(bad).forEach(k => { if (p[k].length > 0) bad[k]++; });
        }
      }
    }
  }

  console.log(`  試した組み合わせ：${total}通り`);
  console.log(`  ベースが根音だった割合：${Math.round((rootCount / noteCount) * 100)}%`);
  check('メロディが1〜3弦の範囲', bad.melody === 0, `${bad.melody}件`);
  check('ベースが4〜6弦の範囲', bad.bass === 0, `${bad.bass}件`);
  check('メロディがベースより高い', bad.overlap === 0, `${bad.overlap}件`);
  check('ベースがコードの構成音', bad.root === 0, `${bad.root}件`);
  check('低音が1オクターブを超えて飛ばない', bad.move === 0, `${bad.move}件`);
  check('1小節が4分音符4つ', bad.beats === 0, `${bad.beats}件`);
}

section('ベースは1拍目と3拍目（2分音符×2）');
{
  const ex = generateDuo({
    progression: PROGRESSIONS[1], key: 0, position: 5, outness: 0, seed: 1,
  });
  const score = duoToScore(ex, 'test');
  const xml = duoToMusicXml(ex, 'test');

  const body = score.measures.slice(0, -1);
  const bassOk = body.every(m => {
    const bass = m.notes.filter(n => n.id.includes('bass'));
    return (
      bass.length === 2 &&
      bass[0].beat === 1 &&
      bass[1].beat === 3 &&
      bass.every(n => n.durationTick === 960 * 2)
    );
  });
  check('再生：1拍目と3拍目に2分音符', bassOk);

  const halves = (xml.match(/<type>half<\/type>/g) ?? []).length;
  check('譜面：2分音符が小節数×2ある', halves === body.length * 2, `${halves}個`);
  check('譜面：符尾が下向きで書かれている', (xml.match(/<stem>down<\/stem>/g) ?? []).length > 0);
  check('譜面：声部が2つに分かれている', (xml.match(/<backup>/g) ?? []).length === score.measures.length);
}

section('譜面（目で見て確認する用）王道進行 in C・5ポジション');
{
  const ex = generateDuo({
    progression: PROGRESSIONS[1], key: 0, position: 5, outness: 0, seed: 1,
  });
  const NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const name = m => `${NAMES[((m % 12) + 12) % 12]}${Math.floor(m / 12) - 1}`;
  ex.measures.slice(0, 8).forEach(m => {
    const melody = m.melody.map(x => name(x).padEnd(4)).join(' ');
    console.log(`  ${String(m.index + 1).padStart(2)}  ${m.label.padEnd(10)} 上：${melody} 下：${name(m.bass)}`);
  });
}

console.log('');
console.log('───────────────────────────────');
console.log(failures === 0 ? `全 ${checks} 項目 合格` : `★ ${failures} 項目 不合格（全 ${checks} 項目）`);
process.exit(failures === 0 ? 0 : 1);
