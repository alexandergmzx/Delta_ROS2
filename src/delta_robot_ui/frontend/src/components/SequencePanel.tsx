import { Play, Square } from 'lucide-react';

import { useDashboardStore } from '../store/dashboardStore';

export function SequencePanel() {
  const presets = useDashboardStore((state) => state.presets);
  const sequence = useDashboardStore((state) => state.snapshot?.sequence);
  const busy = useDashboardStore((state) => state.busy);
  const activePresetName = useDashboardStore((state) => state.activePresetName);
  const runPreset = useDashboardStore((state) => state.runPreset);
  const stopSequence = useDashboardStore((state) => state.stopSequence);

  return (
    <section className="tool-panel sequence-panel">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Automation</p>
          <h2>Presets</h2>
        </div>
        <span className="phase-chip">{sequence?.message ?? 'Ready'}</span>
      </div>

      <div className="preset-list">
        {presets.map((preset) => {
          const active = activePresetName === preset.name || (sequence?.running && sequence.active_index != null);
          return (
            <article className="preset-item" key={preset.name}>
              <div>
                <h3>{preset.name}</h3>
                <p>{preset.waypoints.length} waypoints</p>
              </div>
              <button
                type="button"
                className="icon-button strong"
                title={`Run ${preset.name}`}
                disabled={busy || sequence?.running}
                onClick={() => void runPreset(preset)}
              >
                <Play size={18} />
              </button>
              {active ? <span className="active-dot" /> : null}
            </article>
          );
        })}
      </div>

      <div className="sequence-footer">
        <Progress value={sequence?.active_index ?? null} total={sequence?.total ?? 0} running={Boolean(sequence?.running)} />
        <button type="button" className="button danger" onClick={() => void stopSequence()} disabled={busy || !sequence?.running}>
          <Square size={16} />
          Stop Routine
        </button>
      </div>
    </section>
  );
}

type ProgressProps = {
  value: number | null;
  total: number;
  running: boolean;
};

function Progress({ value, total, running }: ProgressProps) {
  const completed = running && value != null ? value + 1 : 0;
  const percent = total > 0 ? Math.min(100, (completed / total) * 100) : 0;

  return (
    <div className="progress-block">
      <div className="progress-label">
        <span>{running ? `${completed} / ${total}` : 'Idle'}</span>
        <span>{total > 0 ? `${Math.round(percent)}%` : '0%'}</span>
      </div>
      <div className="progress-track">
        <span style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}
