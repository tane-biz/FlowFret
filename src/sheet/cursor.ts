import type { OpenSheetMusicDisplay } from 'opensheetmusicdisplay';
import { TICKS_PER_QUARTER } from '../model/types';

/**
 * 五線譜上の現在位置（設計方針.md §7 / 指示書§25）
 *
 * 太鼓の達人のような流れる音符は作らない。通常の五線譜の上に、
 * 「いまここ」を示す細い帯を置くだけにする。
 *
 * OSMD のカーソルは1音ずつしか進められないため、目的の位置まで進める。
 * 後ろへ戻るときだけ先頭からやり直す。
 */

const MAX_STEPS = 20000;

/** 現在位置の示し方 */
export type PositionMode = 'note' | 'measure' | 'off';

/** 小節単位で位置を示す */
export function moveCursorToMeasure(osmd: OpenSheetMusicDisplay, measureIndex: number): void {
  const cursor = osmd.cursor;
  if (!cursor?.iterator) return;

  if (cursor.iterator.CurrentMeasureIndex > measureIndex || cursor.iterator.EndReached) {
    cursor.reset();
  }

  let steps = 0;
  while (
    !cursor.iterator.EndReached &&
    cursor.iterator.CurrentMeasureIndex < measureIndex &&
    steps++ < MAX_STEPS
  ) {
    cursor.next();
  }

  cursor.update();
}

/**
 * 音符単位で位置を示す。
 * 楽譜の時間は「全音符をいくつ分か」で表されるので、tick から換算して合わせる。
 */
export function moveCursorToTick(osmd: OpenSheetMusicDisplay, scoreTick: number): void {
  const cursor = osmd.cursor;
  if (!cursor?.iterator) return;

  const target = scoreTick / (TICKS_PER_QUARTER * 4);
  const current = () => cursor.iterator.CurrentSourceTimestamp?.RealValue ?? 0;

  if (current() > target || cursor.iterator.EndReached) {
    cursor.reset();
  }

  let steps = 0;
  while (!cursor.iterator.EndReached && current() < target && steps++ < MAX_STEPS) {
    cursor.next();
  }

  cursor.update();
}

export function showCursor(osmd: OpenSheetMusicDisplay): void {
  osmd.cursor?.show();
}

export function hideCursor(osmd: OpenSheetMusicDisplay): void {
  osmd.cursor?.hide();
}

/**
 * 演奏中に現在位置が見えるよう、楽譜をスクロールする（自動譜めくり）
 *
 * 常に中央へ寄せると細かく揺れて読みにくいので、
 * 画面の上下に余白の帯を設け、そこから外れたときだけ動かす。
 * 動いたときは、次の行がしばらく見える位置へ置く。
 */
export function scrollCursorIntoView(
  osmd: OpenSheetMusicDisplay,
  container: HTMLElement | null,
): void {
  const element = osmd.cursor?.cursorElement;
  if (!element || !container) return;

  const view = container.getBoundingClientRect();
  const cursor = element.getBoundingClientRect();
  if (cursor.height === 0) return;

  // 上から1/4の位置に置く。下は3/4を超えたら動かす
  const restTop = view.height * 0.25;
  const triggerBottom = view.height * 0.75;

  const relativeTop = cursor.top - view.top;
  const relativeBottom = cursor.bottom - view.top;

  if (relativeTop >= 0 && relativeBottom <= triggerBottom) return;

  container.scrollTo({
    top: Math.max(0, container.scrollTop + relativeTop - restTop),
    behavior: 'smooth',
  });
}
