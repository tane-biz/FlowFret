import { useEffect, useMemo } from 'react';
import { useAppStore } from '../state/store';
import { playbackEngine } from './playback';
import { TICKS_PER_QUARTER } from '../model/types';

/**
 * 画面の現在位置を更新する（設計方針.md §8）
 *
 * requestAnimationFrame は画面を描くためだけに使い、時計は読むだけにする。
 * 4分音符なので、音符が変わるたび＝拍が変わるたびに動かせばよい。
 */
export function usePlaybackPosition(): void {
  const isPlaying = useAppStore(s => s.isPlaying);
  const totalMeasures = useAppStore(s => s.totalMeasures);

  const lastTick = useMemo(() => totalMeasures * TICKS_PER_QUARTER * 4, [totalMeasures]);

  useEffect(() => {
    if (!isPlaying) return;

    let frame = 0;
    let lastMeasure = -1;
    let lastBeat = -1;
    let lastCountIn = -1;

    const step = () => {
      const store = useAppStore.getState();
      const state = playbackEngine.read();

      const measure = state.measureIndex + 1;
      const beat = Math.max(1, Math.floor(state.beat));

      // いま鳴っている音符の頭に合わせる。
      // 時計の値をそのまま使うと、わずかな誤差で隣の音符を指すことがある
      const onset = Math.max(0, Math.floor(state.scoreTick / TICKS_PER_QUARTER)) * TICKS_PER_QUARTER;

      if (measure !== lastMeasure || beat !== lastBeat || state.countInBeat !== lastCountIn) {
        lastMeasure = measure;
        lastBeat = beat;
        lastCountIn = state.countInBeat;
        store.reportPosition(measure, beat, onset, state.isCountingIn, state.countInBeat);
      }

      if (!store.loopEnabled && state.scoreTick >= lastTick) {
        store.stop();
        return;
      }

      frame = requestAnimationFrame(step);
    };

    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [isPlaying, lastTick]);
}
