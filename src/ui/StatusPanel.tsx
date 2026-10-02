import { useAppStore } from '../state/store';

/** 現在位置とコードの進み具合を出す */
export function StatusPanel() {
  const line = useAppStore(s => s.exercise);
  const arpeggio = useAppStore(s => s.arpeggio);
  const duo = useAppStore(s => s.duo);
  const exercise = line ?? arpeggio ?? duo;
  const currentMeasure = useAppStore(s => s.currentMeasure);
  const currentBeat = useAppStore(s => s.currentBeat);
  const totalMeasures = useAppStore(s => s.totalMeasures);
  const isCountingIn = useAppStore(s => s.isCountingIn);
  const countInBeat = useAppStore(s => s.countInBeat);
  const isPlaying = useAppStore(s => s.isPlaying);

  if (!exercise) return null;

  const measure = exercise.measures[currentMeasure - 1];
  const next = exercise.measures[currentMeasure];
  const chorus = Math.min(
    exercise.options.progression.repeats,
    Math.floor((currentMeasure - 1) / exercise.options.progression.steps.length) + 1,
  );

  return (
    <aside className="sidepanel">
      <section>
        <h2>現在位置</h2>
        {isCountingIn ? (
          <div className="countin">
            <span className="countin-number">{countInBeat}</span>
            <span className="countin-label">カウントイン</span>
          </div>
        ) : (
          <div className="position">
            <span className="position-measure">{currentMeasure}</span>
            <span className="position-unit">/ {totalMeasures} 小節</span>
            {isPlaying && <span className="position-beat">拍 {currentBeat}</span>}
          </div>
        )}
        <p className="hint">{chorus} 周目 / 全 {exercise.options.progression.repeats} 周</p>
      </section>

      <section>
        <h2>いま鳴っているコード</h2>
        <p className="chord-now">{measure?.label ?? '—'}</p>
        <p className="hint">次：{next?.label ?? '（終わり）'}</p>
      </section>

      <section>
        <h2>コード進行</h2>
        <ol className="chord-list">
          {exercise.measures.slice(0, exercise.options.progression.steps.length).map(m => (
            <li key={m.index}>{m.chord.root === m.chord.root ? m.label.split('(')[0] : ''}</li>
          ))}
        </ol>
        <p className="hint">
          この4小節を{exercise.options.progression.repeats}回。
          繰り返すたびに、括弧の中のコードへ置き換わります
        </p>
      </section>
    </aside>
  );
}
