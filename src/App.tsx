import { useEffect } from 'react';
import { ControlBar } from './ui/ControlBar';
import { SheetArea } from './ui/SheetArea';
import { StatusPanel } from './ui/StatusPanel';
import { useAppStore } from './state/store';
import { usePlaybackPosition } from './engine/usePlaybackPosition';

export default function App() {
  usePlaybackPosition();
  useKeyboardShortcuts();
  useFirstExercise();

  const title = useAppStore(s => s.title);

  return (
    <div className="app">
      <header className="topbar">
        <h1>FlowFret</h1>
        <span className="topbar-tagline">止まらずに弾いて、コード進行を体に入れる</span>
        <span className="topbar-sub">{title}</span>
      </header>
      <ControlBar />
      <div className="workspace">
        <SheetArea />
        <StatusPanel />
      </div>
    </div>
  );
}

/** 起動時に最初のフレーズを作る */
function useFirstExercise(): void {
  useEffect(() => {
    const s = useAppStore.getState();
    if (!s.exercise) s.setKey(s.key);
  }, []);
}

/** Space＝再生/一時停止、Esc＝停止、N＝新しいフレーズ */
function useKeyboardShortcuts(): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && ['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON'].includes(target.tagName)) return;

      const s = useAppStore.getState();
      if (e.code === 'Space') { e.preventDefault(); s.togglePlay(); }
      else if (e.code === 'Escape') s.stop();
      else if (e.code === 'KeyN') s.regenerate();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}
