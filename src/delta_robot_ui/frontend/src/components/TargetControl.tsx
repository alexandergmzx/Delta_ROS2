import { CheckCircle2, LocateFixed, Play, Square } from 'lucide-react';

import { useDashboardStore } from '../store/dashboardStore';

const AXES = [
  { key: 'x', label: 'X', min: -70, max: 70, step: 1 },
  { key: 'y', label: 'Y', min: -70, max: 70, step: 1 },
  { key: 'z', label: 'Z', min: -140, max: -60, step: 1 },
] as const;

export function TargetControl() {
  const target = useDashboardStore((state) => state.target);
  const snapshot = useDashboardStore((state) => state.snapshot);
  const checkResult = useDashboardStore((state) => state.checkResult);
  const busy = useDashboardStore((state) => state.busy);
  const setTargetField = useDashboardStore((state) => state.setTargetField);
  const applyCurrentPosition = useDashboardStore((state) => state.applyCurrentPosition);
  const checkTarget = useDashboardStore((state) => state.checkTarget);
  const moveTarget = useDashboardStore((state) => state.moveTarget);
  const stopSequence = useDashboardStore((state) => state.stopSequence);

  const current = snapshot?.state.position_mm;
  const sequence = snapshot?.sequence;

  return (
    <section className="tool-panel">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Target</p>
          <h2>Manual Move</h2>
        </div>
        <button type="button" className="icon-button" title="Use current pose" onClick={applyCurrentPosition} disabled={!current}>
          <LocateFixed size={18} />
        </button>
      </div>

      <div className="axis-stack">
        {AXES.map((axis) => (
          <label className="axis-control" key={axis.key}>
            <span>{axis.label}</span>
            <input
              type="range"
              min={axis.min}
              max={axis.max}
              step={axis.step}
              value={target[axis.key]}
              onChange={(event) => setTargetField(axis.key, Number(event.target.value))}
            />
            <input
              className="number-input"
              type="number"
              min={axis.min}
              max={axis.max}
              step={axis.step}
              value={target[axis.key]}
              onChange={(event) => setTargetField(axis.key, Number(event.target.value))}
            />
            <small>mm</small>
          </label>
        ))}
      </div>

      <div className="action-row">
        <button type="button" className="button secondary" onClick={() => void checkTarget()} disabled={busy}>
          <CheckCircle2 size={17} />
          Check
        </button>
        <button type="button" className="button primary" onClick={() => void moveTarget()} disabled={busy || sequence?.running}>
          <Play size={17} />
          Move
        </button>
        <button type="button" className="button danger" onClick={() => void stopSequence()} disabled={busy || !sequence?.running}>
          <Square size={16} />
          Stop
        </button>
      </div>

      <div className="readout-grid">
        <Readout label="Current X" value={current?.x} suffix="mm" />
        <Readout label="Current Y" value={current?.y} suffix="mm" />
        <Readout label="Current Z" value={current?.z} suffix="mm" />
        <Readout label="Age" value={snapshot?.state.age_sec} suffix="s" precision={2} />
      </div>

      {checkResult ? (
        <div className={`result-strip ${checkResult.reachable ? 'ok' : 'warn'}`}>
          <span>{checkResult.message}</span>
          <span>{checkResult.motor_angles_deg.map((angle) => `${angle.toFixed(1)} deg`).join(' / ')}</span>
        </div>
      ) : null}
    </section>
  );
}

type ReadoutProps = {
  label: string;
  value: number | null | undefined;
  suffix: string;
  precision?: number;
};

function Readout({ label, value, suffix, precision = 1 }: ReadoutProps) {
  return (
    <div className="readout">
      <span>{label}</span>
      <strong>{value == null ? '---' : `${value.toFixed(precision)} ${suffix}`}</strong>
    </div>
  );
}
