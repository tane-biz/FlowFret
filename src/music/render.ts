import { TICKS_PER_QUARTER, type Measure, type NoteEvent, type Score } from '../model/types';
import { applyTimings } from '../model/timing';
import { useFlatsForKey } from './progressions';
import type { GeneratedExercise } from './generate';
import type { ArpeggioExercise } from './arpeggio';
import type { DuoExercise } from './duo';

/**
 * 生成したフレーズを、再生用のデータと五線譜用のMusicXMLに変換する（設計方針.md §8）
 *
 * 描画ライブラリ（OSMD）はMusicXMLを受け取って描くので、
 * 生成結果をその場でMusicXMLに組み立てて渡す。
 */

const BASE_BPM = 170; // 本の指定テンポ
const MEASURE_TICKS = TICKS_PER_QUARTER * 4; // 4/4

// ─────────────────────────────────────────────
// 再生用データ
// ─────────────────────────────────────────────

export function toScore(exercise: GeneratedExercise, title: string): Score {
  const measures: Measure[] = exercise.measures.map((source, index) => {
    const startTick = index * MEASURE_TICKS;
    const isFinal = index === exercise.measures.length - 1;
    const durationTick = isFinal ? MEASURE_TICKS : TICKS_PER_QUARTER;

    const notes: NoteEvent[] = source.notes.map((note, k) => {
      const noteStart = startTick + k * durationTick;
      return {
        id: `m${index}-n${k}`,
        measureIndex: index,
        beat: k + 1,
        startTick: noteStart,
        durationTick,
        endTick: noteStart + durationTick,
        startTime: 0,
        endTime: 0,
        isRest: false,
        midi: note.midi,
      };
    });

    return {
      index,
      number: index + 1,
      startTick,
      endTick: startTick + MEASURE_TICKS,
      notes,
      label: source.label,
    };
  });

  const score: Score = {
    id: `mukyudo-${exercise.options.key}-${exercise.options.seed}`,
    title,
    timeSignatures: [{ measureIndex: 0, beats: 4, beatType: 4 }],
    tempoMap: [{ tick: 0, bpm: BASE_BPM }],
    measures,
  };

  applyTimings(score);
  return score;
}

// ─────────────────────────────────────────────
// 五線譜用のMusicXML
// ─────────────────────────────────────────────

/** キーごとの調号（♯の数。マイナスは♭の数） */
const KEY_FIFTHS: Record<number, number> = {
  0: 0,   // C
  7: 1,   // G
  2: 2,   // D
  9: 3,   // A
  4: 4,   // E
  11: 5,  // B
  5: -1,  // F
  10: -2, // B♭
  3: -3,  // E♭
  8: -4,  // A♭
  1: -5,  // D♭
  6: -6,  // G♭
};

const SHARP_SPELL: [string, number][] = [
  ['C', 0], ['C', 1], ['D', 0], ['D', 1], ['E', 0], ['F', 0],
  ['F', 1], ['G', 0], ['G', 1], ['A', 0], ['A', 1], ['B', 0],
];

const FLAT_SPELL: [string, number][] = [
  ['C', 0], ['D', -1], ['D', 0], ['E', -1], ['E', 0], ['F', 0],
  ['G', -1], ['G', 0], ['A', -1], ['A', 0], ['B', -1], ['B', 0],
];

/** MIDI番号を、音名・変化記号・オクターブに分ける */
function spell(midi: number, useFlats: boolean) {
  const pc = ((midi % 12) + 12) % 12;
  const [step, alter] = (useFlats ? FLAT_SPELL : SHARP_SPELL)[pc];
  let octave = Math.floor(midi / 12) - 1;
  // D♭ や G♭ のように、♭で書くと桁が1つ上がる音がある
  if (useFlats && alter === -1 && pc === 0) octave += 1;
  return { step, alter, octave };
}

export function toMusicXml(exercise: GeneratedExercise, title: string): string {
  const useFlats = useFlatsForKey(exercise.options.key);
  const fifths = KEY_FIFTHS[((exercise.options.key % 12) + 12) % 12] ?? 0;
  // 1行＝1周。ただし8小節の進行は長すぎるので4小節ずつに割る
  const steps = exercise.options.progression.steps.length;
  const perLine = steps <= 4 ? steps : steps % 4 === 0 ? 4 : steps;

  let body = '';

  exercise.measures.forEach((measure, index) => {
    body += `    <measure number="${index + 1}">\n`;

    // 1コーラス（4小節）ごとに改行する。繰り返しの区切りが目で分かる
    if (index > 0 && index % perLine === 0) {
      body += '      <print new-system="yes"/>\n';
    }

    if (index === 0) {
      body +=
        '      <attributes>\n' +
        `        <divisions>1</divisions>\n` +
        `        <key><fifths>${fifths}</fifths></key>\n` +
        '        <time><beats>4</beats><beat-type>4</beat-type></time>\n' +
        '        <clef><sign>G</sign><line>2</line>' +
        '<clef-octave-change>-1</clef-octave-change></clef>\n' +
        '      </attributes>\n' +
        '      <direction placement="above">\n' +
        '        <direction-type><metronome><beat-unit>quarter</beat-unit>' +
        `<per-minute>${BASE_BPM}</per-minute></metronome></direction-type>\n` +
        `        <sound tempo="${BASE_BPM}"/>\n` +
        '      </direction>\n';
    }

    // コード名は、和音記号ではなく文字として置く。
    // リハモを括弧書きで並べたいので、文字のほうが自由が利く
    body +=
      '      <direction placement="above">\n' +
      '        <direction-type>' +
      `<words font-size="10" font-weight="bold">${escapeXml(measure.label)}</words>` +
      '</direction-type>\n' +
      '      </direction>\n';

    const isFinal = index === exercise.measures.length - 1;
    measure.notes.forEach(note => {
      const { step, alter, octave } = spell(note.midi, useFlats);
      body +=
        '      <note>\n' +
        '        <pitch>\n' +
        `          <step>${step}</step>\n` +
        (alter !== 0 ? `          <alter>${alter}</alter>\n` : '') +
        `          <octave>${octave}</octave>\n` +
        '        </pitch>\n' +
        `        <duration>${isFinal ? 4 : 1}</duration>\n` +
        '        <voice>1</voice>\n' +
        `        <type>${isFinal ? 'whole' : 'quarter'}</type>\n` +
        '      </note>\n';
    });

    if (isFinal) {
      body += '      <barline location="right"><bar-style>light-heavy</bar-style></barline>\n';
    }
    body += '    </measure>\n';
  });

  return (
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<score-partwise version="4.0">\n' +
    `  <work><work-title>${escapeXml(title)}</work-title></work>\n` +
    '  <part-list>\n' +
    '    <score-part id="P1"><part-name>Guitar</part-name></score-part>\n' +
    '  </part-list>\n' +
    '  <part id="P1">\n' +
    body +
    '  </part>\n' +
    '</score-partwise>\n'
  );
}

function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ─────────────────────────────────────────────
// アルペジオ・モード
// ─────────────────────────────────────────────

/** アルペジオの基準テンポ。無窮動の170は速すぎるので別にする */
export const ARPEGGIO_BPM = 90;

const EIGHTH_TICKS = TICKS_PER_QUARTER / 2;

export function arpeggioToScore(exercise: ArpeggioExercise, title: string): Score {
  const measures: Measure[] = exercise.measures.map((source, index) => {
    const startTick = index * MEASURE_TICKS;
    const isFinal = index === exercise.measures.length - 1;

    const notes: NoteEvent[] = source.notes.map((note, k) => {
      // 最後の小節は、4本の弦を同時に鳴らして終わる
      const offset = isFinal ? 0 : note.slot * EIGHTH_TICKS;
      const duration = isFinal ? MEASURE_TICKS : EIGHTH_TICKS;
      return {
        id: `m${index}-n${k}`,
        measureIndex: index,
        beat: offset / TICKS_PER_QUARTER + 1,
        startTick: startTick + offset,
        durationTick: duration,
        endTick: startTick + offset + duration,
        startTime: 0,
        endTime: 0,
        isRest: false,
        midi: note.midi,
      };
    });

    return {
      index,
      number: index + 1,
      startTick,
      endTick: startTick + MEASURE_TICKS,
      notes,
      label: source.label,
    };
  });

  const score: Score = {
    id: `arpeggio-${exercise.options.key}-${exercise.options.seed}`,
    title,
    timeSignatures: [{ measureIndex: 0, beats: 4, beatType: 4 }],
    tempoMap: [{ tick: 0, bpm: ARPEGGIO_BPM }],
    measures,
  };

  applyTimings(score);
  return score;
}

export function arpeggioToMusicXml(exercise: ArpeggioExercise, title: string): string {
  const useFlats = useFlatsForKey(exercise.options.key);
  const fifths = KEY_FIFTHS[((exercise.options.key % 12) + 12) % 12] ?? 0;
  const steps = exercise.options.progression.steps.length;
  const perLine = steps <= 4 ? steps : steps % 4 === 0 ? 4 : steps;

  let body = '';

  exercise.measures.forEach((measure, index) => {
    const isFinal = index === exercise.measures.length - 1;
    body += `    <measure number="${index + 1}">\n`;

    if (index > 0 && index % perLine === 0) {
      body += '      <print new-system="yes"/>\n';
    }

    if (index === 0) {
      body +=
        '      <attributes>\n' +
        '        <divisions>2</divisions>\n' +
        `        <key><fifths>${fifths}</fifths></key>\n` +
        '        <time><beats>4</beats><beat-type>4</beat-type></time>\n' +
        '        <clef><sign>G</sign><line>2</line>' +
        '<clef-octave-change>-1</clef-octave-change></clef>\n' +
        '      </attributes>\n' +
        '      <direction placement="above">\n' +
        '        <direction-type><metronome><beat-unit>quarter</beat-unit>' +
        `<per-minute>${ARPEGGIO_BPM}</per-minute></metronome></direction-type>\n` +
        `        <sound tempo="${ARPEGGIO_BPM}"/>\n` +
        '      </direction>\n';
    }

    body +=
      '      <direction placement="above">\n' +
      '        <direction-type>' +
      `<words font-size="10" font-weight="bold">${escapeXml(measure.label)}</words>` +
      '</direction-type>\n' +
      '      </direction>\n';

    // 右手の指（p i m a）は譜面に出さない。どの弦を弾くかは形で分かるため
    measure.notes.forEach((note, k) => {
      const { step, alter, octave } = spell(note.midi, useFlats);
      const isChordMember = isFinal && k > 0;
      body +=
        '      <note>\n' +
        (isChordMember ? '        <chord/>\n' : '') +
        '        <pitch>\n' +
        `          <step>${step}</step>\n` +
        (alter !== 0 ? `          <alter>${alter}</alter>\n` : '') +
        `          <octave>${octave}</octave>\n` +
        '        </pitch>\n' +
        `        <duration>${isFinal ? 8 : 1}</duration>\n` +
        '        <voice>1</voice>\n' +
        `        <type>${isFinal ? 'whole' : 'eighth'}</type>\n` +
        '        <notations><technical>' +
        `<pluck>${note.finger}</pluck>` +
        '</technical></notations>\n' +
        '      </note>\n';
    });

    if (isFinal) {
      body += '      <barline location="right"><bar-style>light-heavy</bar-style></barline>\n';
    }
    body += '    </measure>\n';
  });

  return (
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<score-partwise version="4.0">\n' +
    `  <work><work-title>${escapeXml(title)}</work-title></work>\n` +
    '  <part-list>\n' +
    '    <score-part id="P1"><part-name>Guitar</part-name></score-part>\n' +
    '  </part-list>\n' +
    '  <part id="P1">\n' +
    body +
    '  </part>\n' +
    '</score-partwise>\n'
  );
}

// ─────────────────────────────────────────────
// メロディ＋ベースの2声モード
// ─────────────────────────────────────────────

/** 2声の基準テンポ。両手を同時に動かすので、単旋律より遅くする */
export const DUO_BPM = 100;

export function duoToScore(exercise: DuoExercise, title: string): Score {
  const measures: Measure[] = exercise.measures.map((source, index) => {
    const startTick = index * MEASURE_TICKS;
    const isFinal = index === exercise.measures.length - 1;

    const notes: NoteEvent[] = [];

    // 上声部（メロディ）
    source.melody.forEach((midi, k) => {
      const duration = isFinal ? MEASURE_TICKS : TICKS_PER_QUARTER;
      const offset = isFinal ? 0 : k * TICKS_PER_QUARTER;
      notes.push({
        id: `m${index}-mel${k}`,
        measureIndex: index,
        beat: offset / TICKS_PER_QUARTER + 1,
        startTick: startTick + offset,
        durationTick: duration,
        endTick: startTick + offset + duration,
        startTime: 0,
        endTime: 0,
        isRest: false,
        midi,
      });
    });

    // 下声部（ベース）。1拍目と3拍目に鳴らす。
    // 最後の小節だけは、伸ばして終わる
    const bassHits = isFinal ? [0] : [0, TICKS_PER_QUARTER * 2];
    bassHits.forEach((offset, k) => {
      const duration = isFinal ? MEASURE_TICKS : TICKS_PER_QUARTER * 2;
      notes.push({
        id: `m${index}-bass${k}`,
        measureIndex: index,
        beat: offset / TICKS_PER_QUARTER + 1,
        startTick: startTick + offset,
        durationTick: duration,
        endTick: startTick + offset + duration,
        startTime: 0,
        endTime: 0,
        isRest: false,
        midi: source.bass,
      });
    });

    return {
      index,
      number: index + 1,
      startTick,
      endTick: startTick + MEASURE_TICKS,
      notes,
      label: source.label,
    };
  });

  const score: Score = {
    id: `duo-${exercise.options.key}-${exercise.options.seed}`,
    title,
    timeSignatures: [{ measureIndex: 0, beats: 4, beatType: 4 }],
    tempoMap: [{ tick: 0, bpm: DUO_BPM }],
    measures,
  };

  applyTimings(score);
  return score;
}

export function duoToMusicXml(exercise: DuoExercise, title: string): string {
  const useFlats = useFlatsForKey(exercise.options.key);
  const fifths = KEY_FIFTHS[((exercise.options.key % 12) + 12) % 12] ?? 0;
  const steps = exercise.options.progression.steps.length;
  const perLine = steps <= 4 ? steps : steps % 4 === 0 ? 4 : steps;

  const noteXml = (
    midi: number,
    duration: number,
    type: string,
    voice: number,
    stem: 'up' | 'down',
  ) => {
    const { step, alter, octave } = spell(midi, useFlats);
    return (
      '      <note>\n' +
      '        <pitch>\n' +
      `          <step>${step}</step>\n` +
      (alter !== 0 ? `          <alter>${alter}</alter>\n` : '') +
      `          <octave>${octave}</octave>\n` +
      '        </pitch>\n' +
      `        <duration>${duration}</duration>\n` +
      `        <voice>${voice}</voice>\n` +
      `        <type>${type}</type>\n` +
      `        <stem>${stem}</stem>\n` +
      '      </note>\n'
    );
  };

  let body = '';

  exercise.measures.forEach((measure, index) => {
    const isFinal = index === exercise.measures.length - 1;
    body += `    <measure number="${index + 1}">\n`;

    if (index > 0 && index % perLine === 0) {
      body += '      <print new-system="yes"/>\n';
    }

    if (index === 0) {
      body +=
        '      <attributes>\n' +
        '        <divisions>1</divisions>\n' +
        `        <key><fifths>${fifths}</fifths></key>\n` +
        '        <time><beats>4</beats><beat-type>4</beat-type></time>\n' +
        '        <clef><sign>G</sign><line>2</line>' +
        '<clef-octave-change>-1</clef-octave-change></clef>\n' +
        '      </attributes>\n' +
        '      <direction placement="above">\n' +
        '        <direction-type><metronome><beat-unit>quarter</beat-unit>' +
        `<per-minute>${DUO_BPM}</per-minute></metronome></direction-type>\n` +
        `        <sound tempo="${DUO_BPM}"/>\n` +
        '      </direction>\n';
    }

    body +=
      '      <direction placement="above">\n' +
      '        <direction-type>' +
      `<words font-size="10" font-weight="bold">${escapeXml(measure.label)}</words>` +
      '</direction-type>\n' +
      '      </direction>\n';

    // 上声部：メロディ（符尾は上向き）
    if (isFinal) {
      body += noteXml(measure.melody[0], 4, 'whole', 1, 'up');
    } else {
      measure.melody.forEach(midi => {
        body += noteXml(midi, 1, 'quarter', 1, 'up');
      });
    }

    // 声部を書き分けるため、カーソルを小節の頭へ戻す
    body += '      <backup><duration>4</duration></backup>\n';

    // 下声部：ベース（符尾は下向き）。1拍目と3拍目に2分音符で鳴らす。
    // 全音符にすると符尾が付かず、上下2つの声部が見分けにくくなる
    if (isFinal) {
      body += noteXml(measure.bass, 4, 'whole', 2, 'down');
    } else {
      body += noteXml(measure.bass, 2, 'half', 2, 'down');
      body += noteXml(measure.bass, 2, 'half', 2, 'down');
    }

    if (isFinal) {
      body += '      <barline location="right"><bar-style>light-heavy</bar-style></barline>\n';
    }
    body += '    </measure>\n';
  });

  return (
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<score-partwise version="4.0">\n' +
    `  <work><work-title>${escapeXml(title)}</work-title></work>\n` +
    '  <part-list>\n' +
    '    <score-part id="P1"><part-name>Guitar</part-name></score-part>\n' +
    '  </part-list>\n' +
    '  <part id="P1">\n' +
    body +
    '  </part>\n' +
    '</score-partwise>\n'
  );
}
