import { useRef } from 'react';
import { ArrowDown, ArrowUp, Download, FolderOpen, Gauge, LocateFixed, Play, Plus, Save, Square, Trash2, Upload } from 'lucide-react';

import type { Preset, SavedSequence, Waypoint } from '../api/types';
import { useDashboardStore } from '../store/dashboardStore';
import { csvToWaypoints, waypointsToCsv } from '../utils/csv';

export function SequencePanel() {
  const importInputRef = useRef<HTMLInputElement>(null);
  const presets = useDashboardStore((state) => state.presets);
  const savedSequences = useDashboardStore((state) => state.savedSequences);
  const draftName = useDashboardStore((state) => state.draftName);
  const draftWaypoints = useDashboardStore((state) => state.draftWaypoints);
  const sequence = useDashboardStore((state) => state.snapshot?.sequence);
  const busy = useDashboardStore((state) => state.busy);
  const activePresetName = useDashboardStore((state) => state.activePresetName);
  const trajectoryRateHz = useDashboardStore((state) => state.trajectoryRateHz);
  const trajectoryConfig = useDashboardStore((state) => state.trajectoryConfig);
  const setDraftName = useDashboardStore((state) => state.setDraftName);
  const setTrajectoryRateInput = useDashboardStore((state) => state.setTrajectoryRateInput);
  const commitTrajectoryRate = useDashboardStore((state) => state.commitTrajectoryRate);
  const loadPresetToDraft = useDashboardStore((state) => state.loadPresetToDraft);
  const addTargetWaypoint = useDashboardStore((state) => state.addTargetWaypoint);
  const addCurrentWaypoint = useDashboardStore((state) => state.addCurrentWaypoint);
  const updateDraftWaypoint = useDashboardStore((state) => state.updateDraftWaypoint);
  const moveDraftWaypoint = useDashboardStore((state) => state.moveDraftWaypoint);
  const removeDraftWaypoint = useDashboardStore((state) => state.removeDraftWaypoint);
  const saveDraftSequence = useDashboardStore((state) => state.saveDraftSequence);
  const loadSavedSequence = useDashboardStore((state) => state.loadSavedSequence);
  const deleteSavedSequence = useDashboardStore((state) => state.deleteSavedSequence);
  const importDraftWaypoints = useDashboardStore((state) => state.importDraftWaypoints);
  const runPreset = useDashboardStore((state) => state.runPreset);
  const runDraftSequence = useDashboardStore((state) => state.runDraftSequence);
  const stopSequence = useDashboardStore((state) => state.stopSequence);

  const running = Boolean(sequence?.running);

  const exportDraft = () => {
    const csv = waypointsToCsv(draftWaypoints);
    const href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    const link = document.createElement('a');
    link.href = href;
    link.download = `${safeFileName(draftName)}.csv`;
    link.click();
    URL.revokeObjectURL(href);
  };

  const importDraft = async (file: File | undefined) => {
    if (!file) {
      return;
    }
    const text = await file.text();
    importDraftWaypoints(csvToWaypoints(text), file.name.replace(/\.csv$/i, ''));
    if (importInputRef.current) {
      importInputRef.current.value = '';
    }
  };

  return (
    <section className="tool-panel sequence-panel">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Automation</p>
          <h2>Sequences</h2>
        </div>
        <span className="phase-chip">{sequence?.message ?? 'Ready'}</span>
      </div>

      <div className="speed-control">
        <Gauge size={18} />
        <input
          type="range"
          min="1"
          max="30"
          step="1"
          value={trajectoryRateHz}
          onChange={(event) => setTrajectoryRateInput(Number(event.target.value))}
        />
        <strong>{trajectoryRateHz.toFixed(0)} Hz</strong>
        <button type="button" className="button secondary compact-button" onClick={() => void commitTrajectoryRate()} disabled={busy}>
          Apply
        </button>
      </div>
      <p className="inline-meta">{trajectoryConfig?.trajectory_node ?? 'trajectory server'}</p>

      <div className="preset-list compact-list">
        {presets.map((preset) => (
          <PresetItem
            key={preset.name}
            preset={preset}
            active={activePresetName === preset.name}
            disabled={busy || running}
            onRun={() => void runPreset(preset)}
            onLoad={() => loadPresetToDraft(preset)}
          />
        ))}
      </div>

      <div className="sequence-editor">
        <input className="sequence-name-input" value={draftName} onChange={(event) => setDraftName(event.target.value)} />
        <div className="action-row wrap-row">
          <button type="button" className="button secondary" onClick={addTargetWaypoint} disabled={running}>
            <Plus size={16} />
            Target
          </button>
          <button type="button" className="button secondary" onClick={addCurrentWaypoint} disabled={running}>
            <LocateFixed size={16} />
            Current
          </button>
          <button type="button" className="button secondary" onClick={saveDraftSequence} disabled={running || draftWaypoints.length === 0}>
            <Save size={16} />
            Save
          </button>
          <button type="button" className="button secondary" onClick={() => importInputRef.current?.click()} disabled={running}>
            <Upload size={16} />
            Import
          </button>
          <button type="button" className="button secondary" onClick={exportDraft} disabled={draftWaypoints.length === 0}>
            <Download size={16} />
            Export
          </button>
        </div>
        <input
          ref={importInputRef}
          className="hidden-input"
          type="file"
          accept=".csv,text/csv"
          onChange={(event) => void importDraft(event.target.files?.[0])}
        />

        <div className="waypoint-list">
          {draftWaypoints.length === 0 ? <p className="empty-state">No waypoints</p> : null}
          {draftWaypoints.map((waypoint, index) => (
            <WaypointRow
              key={`${waypoint.name}-${index}`}
              waypoint={waypoint}
              index={index}
              disabled={running}
              onUpdate={updateDraftWaypoint}
              onMove={moveDraftWaypoint}
              onRemove={removeDraftWaypoint}
            />
          ))}
        </div>
      </div>

      {savedSequences.length > 0 ? (
        <div className="saved-sequences">
          {savedSequences.map((sequenceItem) => (
            <SavedSequenceItem
              key={sequenceItem.id}
              sequence={sequenceItem}
              disabled={busy || running}
              onLoad={() => loadSavedSequence(sequenceItem)}
              onRun={() => void runPreset(sequenceItem)}
              onDelete={() => deleteSavedSequence(sequenceItem.id)}
            />
          ))}
        </div>
      ) : null}

      <div className="sequence-footer">
        <Progress value={sequence?.active_index ?? null} total={sequence?.total ?? 0} running={running} />
        <button type="button" className="button primary" onClick={() => void runDraftSequence()} disabled={busy || running || draftWaypoints.length === 0}>
          <Play size={16} />
          Run Draft
        </button>
        <button type="button" className="button danger" onClick={() => void stopSequence()} disabled={busy || !running}>
          <Square size={16} />
          Stop
        </button>
      </div>
    </section>
  );
}

type PresetItemProps = {
  preset: Preset;
  active: boolean;
  disabled: boolean;
  onRun: () => void;
  onLoad: () => void;
};

function PresetItem({ preset, active, disabled, onRun, onLoad }: PresetItemProps) {
  return (
    <article className="preset-item">
      <div>
        <h3>{preset.name}</h3>
        <p>{preset.waypoints.length} waypoints</p>
      </div>
      <div className="mini-actions">
        <button type="button" className="icon-button" title={`Load ${preset.name}`} disabled={disabled} onClick={onLoad}>
          <FolderOpen size={17} />
        </button>
        <button type="button" className="icon-button strong" title={`Run ${preset.name}`} disabled={disabled} onClick={onRun}>
          <Play size={17} />
        </button>
      </div>
      {active ? <span className="active-dot" /> : null}
    </article>
  );
}

type SavedSequenceItemProps = {
  sequence: SavedSequence;
  disabled: boolean;
  onLoad: () => void;
  onRun: () => void;
  onDelete: () => void;
};

function SavedSequenceItem({ sequence, disabled, onLoad, onRun, onDelete }: SavedSequenceItemProps) {
  return (
    <article className="saved-sequence-item">
      <div>
        <h3>{sequence.name}</h3>
        <p>{sequence.waypoints.length} waypoints</p>
      </div>
      <div className="mini-actions">
        <button type="button" className="icon-button" title={`Load ${sequence.name}`} disabled={disabled} onClick={onLoad}>
          <FolderOpen size={17} />
        </button>
        <button type="button" className="icon-button strong" title={`Run ${sequence.name}`} disabled={disabled} onClick={onRun}>
          <Play size={17} />
        </button>
        <button type="button" className="icon-button danger-icon" title={`Delete ${sequence.name}`} disabled={disabled} onClick={onDelete}>
          <Trash2 size={17} />
        </button>
      </div>
    </article>
  );
}

type WaypointRowProps = {
  waypoint: Waypoint;
  index: number;
  disabled: boolean;
  onUpdate: (index: number, field: 'name' | 'x' | 'y' | 'z' | 'dwell_seconds', value: string | number) => void;
  onMove: (index: number, direction: -1 | 1) => void;
  onRemove: (index: number) => void;
};

function WaypointRow({ waypoint, index, disabled, onUpdate, onMove, onRemove }: WaypointRowProps) {
  return (
    <div className="waypoint-row">
      <input value={waypoint.name} onChange={(event) => onUpdate(index, 'name', event.target.value)} disabled={disabled} aria-label="Waypoint name" />
      <input type="number" value={waypoint.target.x} onChange={(event) => onUpdate(index, 'x', event.target.value)} disabled={disabled} aria-label="Waypoint X" />
      <input type="number" value={waypoint.target.y} onChange={(event) => onUpdate(index, 'y', event.target.value)} disabled={disabled} aria-label="Waypoint Y" />
      <input type="number" value={waypoint.target.z} onChange={(event) => onUpdate(index, 'z', event.target.value)} disabled={disabled} aria-label="Waypoint Z" />
      <input
        type="number"
        min="0"
        step="0.05"
        value={waypoint.dwell_seconds}
        onChange={(event) => onUpdate(index, 'dwell_seconds', event.target.value)}
        disabled={disabled}
        aria-label="Waypoint dwell"
      />
      <div className="mini-actions">
        <button type="button" className="icon-button" title="Move up" disabled={disabled || index === 0} onClick={() => onMove(index, -1)}>
          <ArrowUp size={15} />
        </button>
        <button type="button" className="icon-button" title="Move down" disabled={disabled} onClick={() => onMove(index, 1)}>
          <ArrowDown size={15} />
        </button>
        <button type="button" className="icon-button danger-icon" title="Delete" disabled={disabled} onClick={() => onRemove(index)}>
          <Trash2 size={15} />
        </button>
      </div>
    </div>
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

function safeFileName(name: string): string {
  return (name.trim() || 'delta-waypoints').replace(/[^a-z0-9-_]+/gi, '-').replace(/^-|-$/g, '').toLowerCase();
}
