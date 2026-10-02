import { lazy, Suspense } from 'react';
import { useAppStore } from '../state/store';
import { positionRange } from '../music/generate';

const OsmdView = lazy(() =>
  import('../sheet/OsmdView').then(m => ({ default: m.OsmdView })),
);

const NOTE_NAMES = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];
const midiName = (midi: number) =>
  `${NOTE_NAMES[((midi % 12) + 12) % 12]}${Math.floor(midi / 12) - 1}`;

export function SheetArea() {
  const xml = useAppStore(s => s.xml);
  const zoom = useAppStore(s => s.zoom);
  const setZoom = useAppStore(s => s.setZoom);
  const currentMeasure = useAppStore(s => s.currentMeasure);
  const currentTick = useAppStore(s => s.currentTick);
  const showPosition = useAppStore(s => s.showPosition);
  const toggleShowPosition = useAppStore(s => s.toggleShowPosition);
  const position = useAppStore(s => s.position);

  if (!xml) {
    return (
      <main className="sheet sheet-empty">
        <p>フレーズを作っています…</p>
      </main>
    );
  }

  const range = positionRange(position);

  return (
    <main className="sheet">
      <div className="sheet-tools">
        <span className="sheet-note">
          {position}ポジション（{midiName(range.low)}〜{midiName(range.high)}）の音だけを使っています
        </span>
        <div className="sheet-tools-right">
          <button
            className={`toggle ${showPosition ? 'toggle-on' : ''}`}
            onClick={toggleShowPosition}
            aria-pressed={showPosition}
          >
            <span className="toggle-dot" />
            現在位置
          </button>
          <div className="zoom">
            <button className="btn btn-icon" onClick={() => setZoom(zoom - 0.1)} title="小さく">−</button>
            <span className="zoom-value">{Math.round(zoom * 100)}%</span>
            <button className="btn btn-icon" onClick={() => setZoom(zoom + 0.1)} title="大きく">＋</button>
          </div>
        </div>
      </div>

      <Suspense fallback={<p className="osmd-status">楽譜の描画を準備しています…</p>}>
        <OsmdView
          xml={xml}
          zoom={zoom}
          measureIndex={currentMeasure - 1}
          currentTick={currentTick}
          positionMode={showPosition ? 'note' : 'off'}
          autoScroll
          stretchLastLine={false}
        />
      </Suspense>
    </main>
  );
}
