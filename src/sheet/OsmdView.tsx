import { useCallback, useEffect, useRef, useState } from 'react';
import { OpenSheetMusicDisplay, type IOSMDOptions } from 'opensheetmusicdisplay';
import {
  hideCursor,
  moveCursorToMeasure,
  moveCursorToTick,
  scrollCursorIntoView,
  showCursor,
  type PositionMode,
} from './cursor';

/**
 * OSMD（楽譜描画ライブラリ）と React の橋渡し（設計方針.md §7）
 *
 * OSMD は自分でDOMを書き換えるため、中身を React に管理させると衝突する。
 * そこで、この中の <div> だけは React から中身を触らない「預け先」として扱う。
 */

const OPTIONS: IOSMDOptions = {
  autoResize: true,
  backend: 'svg',

  // 曲名・作曲者はアプリ上部のバーに出すので、楽譜の中には描かない（余白を稼ぐ）
  drawTitle: false,
  drawSubtitle: false,
  drawComposer: false,
  drawLyricist: false,
  drawPartNames: false,
  drawPartAbbreviations: false,

  // 小節番号は毎小節出す。小節ジャンプ・ループ範囲の指定に使うため
  drawMeasureNumbers: true,
  measureNumberInterval: 1,

  drawMetronomeMarks: true,

  // 改行位置は表示譜に書き込んである。それに従わせる（練習内容ごとに段が変わらないように）
  newSystemFromXML: true,
  newPageFromXML: false,

  // 現在位置の帯。ゲーム的な演出はしない（指示書§25）
  // スクロールは自前で行うため、ライブラリ側の追従は切る
  cursorsOptions: [{ type: 0, color: '#1a3463', alpha: 0.22, follow: false }],
};

/**
 * 小節の幅をそろえる。
 * 1行＝1コーラス（4小節）で固定しているので、どの行も同じ見た目になる。
 */
function applyEngraving(
  osmd: OpenSheetMusicDisplay,
  zoom: number,
  stretchLastLine: boolean,
): void {
  const rules = osmd.EngravingRules;

  rules.VoiceSpacingMultiplierVexflow = 0.7;
  rules.VoiceSpacingAddendVexflow = 2;

  // 小節の幅をそろえる。音の多い小節だけ広く、少ない小節だけ狭く、
  // ということが起きなくなり、目で追う位置が安定する
  rules.FixedMeasureWidth = true;

  /*
   * 最後の行を横幅いっぱいに伸ばすかどうか。
   *
   * 途中の行は必ず横幅いっぱいに伸ばされる。そこで、
   *  ・最後の行も小節数が満杯なら伸ばす → どの行も1小節の幅が同じになる
   *  ・端数（3・3・2 など）なら伸ばさない → 最後の行は途中で終わる
   * とする。端数の行を伸ばすと、そこだけ1小節が広くなって目で追う位置が狂うため。
   * 紙の楽譜も最後の行は途中で終わるので、この動きは一般的な組み方から外れない。
   */
  rules.StretchLastSystemLine = stretchLastLine;

  osmd.zoom = zoom;
}

/** 1段目に実際に入った小節数を数える */
function countMeasuresInFirstSystem(osmd: OpenSheetMusicDisplay): number {
  const systems = osmd.GraphicSheet?.MusicPages?.[0]?.MusicSystems;
  return systems?.[0]?.GraphicalMeasures?.length ?? 0;
}

export interface OsmdViewProps {
  /** OSMDに渡すMusicXML。Modeを切り替えると別のXMLが入ってくる（Phase 8） */
  xml: string;
  /** 表示倍率。1.0 = 等倍 */
  zoom: number;
  /** 現在の小節（0起点） */
  measureIndex: number;
  /** 曲頭からの現在位置（tick） */
  currentTick: number;
  /** 現在位置の示し方 */
  positionMode: PositionMode;
  /** 演奏に合わせて楽譜を自動でスクロールするか */
  autoScroll: boolean;
  /** 最後の行も横幅いっぱいに伸ばすか（小節数がちょうど割り切れるときだけ true） */
  stretchLastLine: boolean;
  /** 1段目に実際に入った小節数を知らせる（指定どおりか確認するため） */
  onLayout?: (measuresInFirstSystem: number) => void;
}

export function OsmdView({
  xml,
  zoom,
  measureIndex,
  currentTick,
  positionMode,
  autoScroll,
  stretchLastLine,
  onLayout,
}: OsmdViewProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const osmdRef = useRef<OpenSheetMusicDisplay | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isRendering, setIsRendering] = useState(true);

  // 読み込みの途中でも最新の値を使えるようにしておく
  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;

  const stretchRef = useRef(stretchLastLine);
  stretchRef.current = stretchLastLine;

  const onLayoutRef = useRef(onLayout);
  onLayoutRef.current = onLayout;

  const render = useCallback((osmd: OpenSheetMusicDisplay, value: number) => {
    applyEngraving(osmd, value, stretchRef.current);
    osmd.render();
    onLayoutRef.current?.(countMeasuresInFirstSystem(osmd));
  }, []);

  // ── 楽譜の読み込みと描画 ──────────────────────
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    let cancelled = false;
    const osmd = new OpenSheetMusicDisplay(host, OPTIONS);
    osmdRef.current = osmd;

    setIsRendering(true);
    setError(null);

    osmd
      .load(xml)
      .then(() => {
        if (cancelled) return;
        render(osmd, zoomRef.current);
        setIsRendering(false);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setIsRendering(false);
        setError(
          e instanceof Error
            ? `楽譜を描画できませんでした：${e.message}`
            : '楽譜を描画できませんでした。',
        );
      });

    return () => {
      cancelled = true;
      osmdRef.current = null;
      try {
        osmd.clear();
      } catch {
        // clear が失敗しても、下で中身を空にするので実害はない
      }
      host.replaceChildren();
    };
    // zoom と現在位置は別のeffectで扱う（そのたびに読み込み直さないため）
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [xml, render]);

  // ── 倍率の変更だけを反映する（読み込み直さない） ──
  useEffect(() => {
    const osmd = osmdRef.current;
    if (!osmd || isRendering) return;
    render(osmd, zoom);
  }, [zoom, stretchLastLine, isRendering, render]);

  // ── 現在位置の帯 ─────────────────────────────
  useEffect(() => {
    const osmd = osmdRef.current;
    if (!osmd || isRendering) return;

    if (positionMode === 'off') {
      hideCursor(osmd);
      return;
    }

    showCursor(osmd);
    if (positionMode === 'note') moveCursorToTick(osmd, currentTick);
    else moveCursorToMeasure(osmd, measureIndex);

    if (autoScroll) {
      scrollCursorIntoView(osmd, hostRef.current?.closest('.sheet') ?? null);
    }
  }, [measureIndex, currentTick, positionMode, autoScroll, isRendering, zoom]);

  return (
    <div className="osmd-wrap">
      {isRendering && <p className="osmd-status">楽譜を描いています…</p>}
      {error && <div className="errorbox"><p>{error}</p></div>}
      <div ref={hostRef} className="osmd-host" />
    </div>
  );
}
