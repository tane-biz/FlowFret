import {
  useAppStore,
  playbackBpm,
  TEMPO_PRESETS,
  POSITIONS,
  OUTNESS_LABELS,
  PROGRESSIONS,
  ARPEGGIO_PATTERNS,
  MODE_LABELS,
  MODE_HINTS,
  baseBpmFor,
  type PracticeMode,
} from '../state/store';
import { pitchClassName } from '../music/chords';
import { progressionById, useFlatsForKey } from '../music/progressions';

/**
 * 練習中に使う操作をすべて出す。設定画面の奥に隠さない。
 */
export function ControlBar() {
  const {
    mode, setMode,
    patternId, setPattern,
    progressionId, setProgression,
    key, setKey,
    position, setPosition,
    outness, setOutness,
    tempoPercent, setTempoPercent,
    isPlaying, togglePlay, stop,
    countInOn, toggleCountIn,
    metronomeOn, toggleMetronome,
    loopEnabled, toggleLoop,
    regenerate,
  } = useAppStore();

  const bpm = playbackBpm(tempoPercent, mode);
  const progression = progressionById(progressionId);

  return (
    <div className="controlbar">
      <div className="group">
        <span className="group-label">練習の種類</span>
        <div className="segmented">
          {(Object.keys(MODE_LABELS) as PracticeMode[]).map(m => (
            <button
              key={m}
              className={`seg ${mode === m ? 'seg-on' : ''}`}
              onClick={() => setMode(m)}
              title={MODE_HINTS[m]}
            >
              {MODE_LABELS[m]}
            </button>
          ))}
        </div>
      </div>

      <div className="group group-wide">
        <span className="group-label">コード進行</span>
        <div className="segmented">
          {PROGRESSIONS.map(p => (
            <button
              key={p.id}
              className={`seg ${progressionId === p.id ? 'seg-on' : ''}`}
              onClick={() => setProgression(p.id)}
              title={p.description}
            >
              {p.name}
            </button>
          ))}
        </div>
      </div>

      <div className="group group-wide">
        <span className="group-label">キー</span>
        <div className="segmented">
          {progression.keys.map(k => (
            <button
              key={k}
              className={`seg ${key === k ? 'seg-on' : ''}`}
              onClick={() => setKey(k)}
            >
              {pitchClassName(k, useFlatsForKey(k))}
            </button>
          ))}
        </div>
      </div>

      <div className="group">
        <span className="group-label">ポジション</span>
        <div className="segmented">
          {POSITIONS.map(p => (
            <button
              key={p}
              className={`seg ${position === p ? 'seg-on' : ''}`}
              onClick={() => setPosition(p)}
              title={`人差し指が${p}フレットに来る位置で弾ける音だけを使います`}
            >
              {p}
            </button>
          ))}
        </div>
      </div>

      {mode === 'arpeggio' && (
        <div className="group">
          <span className="group-label">右手のパターン</span>
          <div className="segmented">
            {ARPEGGIO_PATTERNS.map(p => (
              <button
                key={p.id}
                className={`seg ${patternId === p.id ? 'seg-on' : ''}`}
                onClick={() => setPattern(p.id)}
                title={p.description}
              >
                {p.name}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="group">
        <span className="group-label">外し具合</span>
        <div className="segmented">
          {OUTNESS_LABELS.map((label, i) => (
            <button
              key={label}
              className={`seg ${outness === i ? 'seg-on' : ''}`}
              onClick={() => setOutness(i)}
              title={
                i === 0
                  ? '6回とも素直なコードのまま'
                  : '繰り返すたびに、少しずつ別のコードへ置き換えます'
              }
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="group">
        <span className="group-label">再生</span>
        <div className="row">
          <button className="btn btn-primary" onClick={togglePlay}>
            {isPlaying ? '一時停止' : '再生'}
          </button>
          <button className="btn" onClick={stop}>停止</button>
        </div>
      </div>

      <div className="group group-wide">
        <span className="group-label">テンポ（基準 ♩={baseBpmFor(mode)}）</span>
        <div className="row">
          <div className="segmented segmented-sm">
            {TEMPO_PRESETS.map(p => (
              <button
                key={p}
                className={`seg ${tempoPercent === p ? 'seg-on' : ''}`}
                onClick={() => setTempoPercent(p)}
              >
                {p}%
              </button>
            ))}
          </div>
          <span className="readout">♩= {bpm}</span>
        </div>
      </div>

      <div className="group">
        <span className="group-label">その他</span>
        <div className="row">
          <Toggle on={metronomeOn} onClick={toggleMetronome} label="メトロノーム" />
          <Toggle on={countInOn} onClick={toggleCountIn} label="カウントイン" />
          <Toggle on={loopEnabled} onClick={toggleLoop} label="ループ" />
          <button className="btn" onClick={regenerate} title="同じ条件で、別のフレーズを作り直します">
            新しいフレーズ
          </button>
        </div>
      </div>
    </div>
  );
}

function Toggle({ on, onClick, label }: { on: boolean; onClick: () => void; label: string }) {
  return (
    <button className={`toggle ${on ? 'toggle-on' : ''}`} onClick={onClick} aria-pressed={on}>
      <span className="toggle-dot" />
      {label}
    </button>
  );
}
