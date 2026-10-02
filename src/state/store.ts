import { create } from 'zustand';
import {
  PROGRESSIONS,
  progressionById,
  useFlatsForKey,
  type Progression,
} from '../music/progressions';
import { pitchClassName } from '../music/chords';
import { generateExercise, type GeneratedExercise } from '../music/generate';
import {
  ARPEGGIO_PATTERNS,
  generateArpeggio,
  type ArpeggioExercise,
} from '../music/arpeggio';
import { generateDuo, type DuoExercise } from '../music/duo';
import {
  ARPEGGIO_BPM,
  DUO_BPM,
  arpeggioToMusicXml,
  arpeggioToScore,
  duoToMusicXml,
  duoToScore,
  toMusicXml,
  toScore,
} from '../music/render';
import { playbackEngine } from '../engine/playback';

/**
 * アプリ全体の状態を1か所に集める（設計方針.md §7）
 */

export const TEMPO_PRESETS = [30, 40, 50, 60, 70, 80, 90, 100] as const;
export const POSITIONS = [1, 5, 7, 9] as const;
export const OUTNESS_LABELS = ['そのまま', '少し外す', '外す', 'かなり外す'] as const;

/** 練習の種類 */
export type PracticeMode = 'line' | 'arpeggio' | 'duo';

export const MODE_LABELS: Record<PracticeMode, string> = {
  line: '単旋律（無窮動）',
  arpeggio: 'アルペジオ',
  duo: 'メロディ＋ベース',
};

export const MODE_HINTS: Record<PracticeMode, string> = {
  line: '4分音符を止めずに弾き続ける。指と耳を鍛える',
  arpeggio: 'コードを押さえたまま右手を回す。弾き語りの練習',
  duo: 'メロディと低音を同時に鳴らす。ソロギターの土台',
};

/** 本の指定テンポ */
export const BASE_BPM = 170;

/** 種類ごとの基準テンポ */
export function baseBpmFor(mode: PracticeMode): number {
  if (mode === 'arpeggio') return ARPEGGIO_BPM;
  if (mode === 'duo') return DUO_BPM;
  return BASE_BPM;
}

interface AppState {
  mode: PracticeMode;
  patternId: string;
  progressionId: string;
  key: number;
  position: number;
  outness: number;
  seed: number;

  exercise: GeneratedExercise | null;
  arpeggio: ArpeggioExercise | null;
  duo: DuoExercise | null;
  xml: string | null;
  title: string;

  tempoPercent: number;
  isPlaying: boolean;
  isCountingIn: boolean;
  countInBeat: number;
  countInOn: boolean;
  metronomeOn: boolean;

  loopEnabled: boolean;
  currentMeasure: number;
  currentBeat: number;
  currentTick: number;
  totalMeasures: number;

  zoom: number;
  showPosition: boolean;

  setMode: (mode: PracticeMode) => void;
  setPattern: (id: string) => void;
  setProgression: (id: string) => void;
  setKey: (key: number) => void;
  setPosition: (position: number) => void;
  setOutness: (outness: number) => void;
  regenerate: () => void;

  setTempoPercent: (percent: number) => void;
  play: () => Promise<void>;
  pause: () => void;
  stop: () => void;
  togglePlay: () => void;
  toggleCountIn: () => void;
  toggleMetronome: () => void;
  toggleLoop: () => void;
  toggleShowPosition: () => void;
  setZoom: (zoom: number) => void;

  reportPosition: (
    measure: number,
    beat: number,
    tick: number,
    countingIn: boolean,
    countInBeat: number,
  ) => void;
}

function titleFor(progression: Progression, key: number): string {
  return `${progression.name} in ${pitchClassName(key, useFlatsForKey(key))}`;
}

function buildExercise(state: {
  mode: PracticeMode;
  patternId: string;
  progressionId: string;
  key: number;
  position: number;
  outness: number;
  seed: number;
}) {
  const progression = progressionById(state.progressionId);
  const title = titleFor(progression, state.key);
  const common = {
    progression,
    key: state.key,
    position: state.position,
    outness: state.outness,
    seed: state.seed,
  };

  if (state.mode === 'duo') {
    const duo = generateDuo(common);
    return {
      exercise: null,
      arpeggio: null,
      duo,
      title,
      score: duoToScore(duo, title),
      xml: duoToMusicXml(duo, title),
    };
  }

  if (state.mode === 'arpeggio') {
    const arpeggio = generateArpeggio({ ...common, patternId: state.patternId });
    return {
      exercise: null,
      duo: null,
      arpeggio,
      title,
      score: arpeggioToScore(arpeggio, title),
      xml: arpeggioToMusicXml(arpeggio, title),
    };
  }

  const exercise = generateExercise(common);
  return {
    exercise,
    arpeggio: null,
    duo: null,
    title,
    score: toScore(exercise, title),
    xml: toMusicXml(exercise, title),
  };
}

export const useAppStore = create<AppState>((set, get) => {
  /** 作り直して、再生エンジンにも読み込ませる */
  const rebuild = (
    next: Partial<
      Pick<AppState, 'mode' | 'patternId' | 'progressionId' | 'key' | 'position' | 'outness' | 'seed'>
    >,
  ) => {
    const s = get();
    const params = {
      mode: next.mode ?? s.mode,
      patternId: next.patternId ?? s.patternId,
      progressionId: next.progressionId ?? s.progressionId,
      key: next.key ?? s.key,
      position: next.position ?? s.position,
      outness: next.outness ?? s.outness,
      seed: next.seed ?? s.seed,
    };
    const built = buildExercise(params);

    playbackEngine.stop();
    playbackEngine.load(built.score);
    playbackEngine.setBpm(playbackBpm(s.tempoPercent, params.mode));
    playbackEngine.setMetronome(s.metronomeOn);
    playbackEngine.setLoop(s.loopEnabled, 1, built.score.measures.length);

    set({
      ...params,
      exercise: built.exercise,
      arpeggio: built.arpeggio,
      duo: built.duo,
      xml: built.xml,
      title: built.title,
      totalMeasures: built.score.measures.length,
      currentMeasure: 1,
      currentBeat: 1,
      currentTick: 0,
      isPlaying: false,
      isCountingIn: false,
      countInBeat: 0,
    });
  };

  return {
    mode: 'line' as PracticeMode,
    patternId: ARPEGGIO_PATTERNS[0].id,
    progressionId: PROGRESSIONS[0].id,
    key: 0,
    position: 5,
    outness: 0,
    seed: Math.floor(Math.random() * 100000) + 1,

    exercise: null,
    arpeggio: null,
    duo: null,
    xml: null,
    title: titleFor(PROGRESSIONS[0], 0),

    tempoPercent: 40,
    isPlaying: false,
    isCountingIn: false,
    countInBeat: 0,
    countInOn: true,
    metronomeOn: true,

    loopEnabled: false,
    currentMeasure: 1,
    currentBeat: 1,
    currentTick: 0,
    totalMeasures: 0,

    zoom: 1,
    showPosition: true,

    setMode: mode => rebuild({ mode }),
    setPattern: id => rebuild({ patternId: id }),
    setProgression: id => {
      // 進行を変えると使うキーの並びも変わるので、選んでいるキーが無ければ先頭に戻す
      const next = progressionById(id);
      const key = next.keys.includes(get().key) ? get().key : next.keys[0];
      rebuild({ progressionId: id, key });
    },
    setKey: key => rebuild({ key }),
    setPosition: position => rebuild({ position }),
    setOutness: outness => rebuild({ outness }),
    regenerate: () => rebuild({ seed: Math.floor(Math.random() * 100000) + 1 }),

    setTempoPercent: percent => {
      const value = Math.max(20, Math.min(120, Math.round(percent)));
      set({ tempoPercent: value });
      playbackEngine.setBpm(playbackBpm(value, get().mode));
    },

    play: async () => {
      const s = get();
      if (!s.xml) return;
      await playbackEngine.play({ fromScoreTick: 0, countIn: s.countInOn });
      set({ isPlaying: true });
    },

    pause: () => {
      playbackEngine.pause();
      set({ isPlaying: false, isCountingIn: false, countInBeat: 0 });
    },

    stop: () => {
      playbackEngine.stop();
      playbackEngine.seekToMeasure(1);
      set({
        isPlaying: false,
        isCountingIn: false,
        countInBeat: 0,
        currentMeasure: 1,
        currentBeat: 1,
        currentTick: 0,
      });
    },

    togglePlay: () => {
      const s = get();
      if (s.isPlaying) s.pause();
      else void s.play();
    },

    toggleCountIn: () => set(s => ({ countInOn: !s.countInOn })),

    toggleMetronome: () => {
      const on = !get().metronomeOn;
      set({ metronomeOn: on });
      playbackEngine.setMetronome(on);
    },

    toggleLoop: () => {
      const on = !get().loopEnabled;
      set({ loopEnabled: on });
      playbackEngine.setLoop(on, 1, get().totalMeasures);
    },

    toggleShowPosition: () => set(s => ({ showPosition: !s.showPosition })),

    setZoom: zoom => set({ zoom: Math.max(0.5, Math.min(2.5, Math.round(zoom * 20) / 20)) }),

    reportPosition: (measure, beat, tick, countingIn, countInBeat) =>
      set({
        currentMeasure: measure,
        currentBeat: beat,
        currentTick: tick,
        isCountingIn: countingIn,
        countInBeat,
      }),
  };
});

/** 実際に再生するBPM */
export function playbackBpm(tempoPercent: number, mode: PracticeMode = 'line'): number {
  return Math.round((baseBpmFor(mode) * tempoPercent) / 100);
}

export { PROGRESSIONS, ARPEGGIO_PATTERNS };
