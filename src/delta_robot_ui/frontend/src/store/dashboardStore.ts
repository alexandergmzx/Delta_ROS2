import { create } from 'zustand';

import {
  activateStandaloneFallback,
  checkTarget,
  getMode,
  getPresets,
  getSnapshot,
  getTrajectoryConfig,
  moveTarget,
  openDashboardSocket,
  runSequence,
  setTrajectoryConfig,
  stopSequence,
} from '../api';
import type { DashboardMode } from '../api';
import type { DashboardSnapshot, Preset, SavedSequence, SocketLike, Target, TargetCheckResult, TrajectoryConfig, Waypoint } from '../api/types';

type ConnectionState = 'connecting' | 'live' | 'offline';
type WaypointField = 'name' | keyof Target | 'dwell_seconds';

type DashboardStore = {
  mode: DashboardMode;
  snapshot: DashboardSnapshot | null;
  presets: Preset[];
  savedSequences: SavedSequence[];
  draftName: string;
  draftWaypoints: Waypoint[];
  trajectoryConfig: TrajectoryConfig | null;
  trajectoryRateHz: number;
  target: Target;
  checkResult: TargetCheckResult | null;
  activePresetName: string | null;
  connection: ConnectionState;
  busy: boolean;
  error: string | null;
  loadInitial: () => Promise<void>;
  connectLive: () => () => void;
  setTargetField: (field: keyof Target, value: number) => void;
  applyCurrentPosition: () => void;
  setDraftName: (name: string) => void;
  setTrajectoryRateInput: (rateHz: number) => void;
  commitTrajectoryRate: () => Promise<void>;
  loadPresetToDraft: (preset: Preset) => void;
  addTargetWaypoint: () => void;
  addCurrentWaypoint: () => void;
  updateDraftWaypoint: (index: number, field: WaypointField, value: string | number) => void;
  moveDraftWaypoint: (index: number, direction: -1 | 1) => void;
  removeDraftWaypoint: (index: number) => void;
  saveDraftSequence: () => void;
  loadSavedSequence: (sequence: SavedSequence) => void;
  deleteSavedSequence: (id: string) => void;
  importDraftWaypoints: (waypoints: Waypoint[], name?: string) => void;
  checkTarget: () => Promise<void>;
  moveTarget: () => Promise<void>;
  runPreset: (preset: Preset) => Promise<void>;
  runDraftSequence: () => Promise<void>;
  stopSequence: () => Promise<void>;
  clearError: () => void;
};

let liveSocket: SocketLike | null = null;

const initialTarget: Target = { x: 0, y: 0, z: -100 };
const savedSequencesKey = 'delta_robot_dashboard_saved_sequences';

export const useDashboardStore = create<DashboardStore>((set, get) => ({
  mode: getMode(),
  snapshot: null,
  presets: [],
  savedSequences: loadSavedSequences(),
  draftName: 'Untitled sequence',
  draftWaypoints: [],
  trajectoryConfig: null,
  trajectoryRateHz: 10,
  target: initialTarget,
  checkResult: null,
  activePresetName: null,
  connection: 'connecting',
  busy: false,
  error: null,

  async loadInitial() {
    try {
      const [snapshot, presets, trajectoryConfig] = await Promise.all([
        getSnapshot(),
        getPresets(),
        getTrajectoryConfig().catch(() => null),
      ]);
      set({
        snapshot,
        presets,
        trajectoryConfig,
        trajectoryRateHz: trajectoryConfig?.trajectory_rate_hz ?? get().trajectoryRateHz,
        savedSequences: loadSavedSequences(),
        error: null,
      });
    } catch (error) {
      // fetch throws TypeError only when no backend answered at all; HTTP errors
      // mean the server is up (maybe with ROS down) and must keep live mode.
      if (get().mode === 'ros' && error instanceof TypeError && activateStandaloneFallback()) {
        set({ mode: 'standalone' });
        get().connectLive();
        await get().loadInitial();
        return;
      }
      set({ error: errorMessage(error) });
    }
  },

  connectLive() {
    liveSocket?.close();
    set({ connection: 'connecting' });

    const socket = openDashboardSocket((snapshot) => {
      set((state) => ({
        snapshot,
        presets: snapshot.presets ?? state.presets,
        connection: 'live',
        error: null,
      }));
    });

    liveSocket = socket;
    socket.addEventListener('open', () => set({ connection: 'live' }));
    socket.addEventListener('close', () => set({ connection: 'offline' }));
    socket.addEventListener('error', () => set({ connection: 'offline' }));

    return () => {
      if (liveSocket === socket) {
        liveSocket = null;
      }
      socket.close();
    };
  },

  setTargetField(field, value) {
    set((state) => ({
      target: { ...state.target, [field]: value },
      checkResult: null,
    }));
  },

  applyCurrentPosition() {
    const position = get().snapshot?.state.position_mm;
    if (position) {
      set({ target: position, checkResult: null });
    }
  },

  setDraftName(name) {
    set({ draftName: name });
  },

  setTrajectoryRateInput(rateHz) {
    set({ trajectoryRateHz: clamp(rateHz, 1, 60) });
  },

  async commitTrajectoryRate() {
    set({ busy: true, error: null });
    try {
      const trajectoryConfig = await setTrajectoryConfig(get().trajectoryRateHz);
      set({ trajectoryConfig, trajectoryRateHz: trajectoryConfig.trajectory_rate_hz ?? get().trajectoryRateHz });
    } catch (error) {
      set({ error: errorMessage(error) });
    } finally {
      set({ busy: false });
    }
  },

  loadPresetToDraft(preset) {
    set({
      draftName: preset.name,
      draftWaypoints: cloneWaypoints(preset.waypoints),
      activePresetName: null,
    });
  },

  addTargetWaypoint() {
    const { draftWaypoints, target } = get();
    set({
      draftWaypoints: [
        ...draftWaypoints,
        { name: `Waypoint ${draftWaypoints.length + 1}`, target: { ...target }, dwell_seconds: 0.05 },
      ],
    });
  },

  addCurrentWaypoint() {
    const position = get().snapshot?.state.position_mm;
    if (!position) {
      set({ error: 'No live robot position is available' });
      return;
    }
    const { draftWaypoints } = get();
    set({
      draftWaypoints: [
        ...draftWaypoints,
        { name: `Waypoint ${draftWaypoints.length + 1}`, target: { ...position }, dwell_seconds: 0.05 },
      ],
      error: null,
    });
  },

  updateDraftWaypoint(index, field, value) {
    set((state) => ({
      draftWaypoints: state.draftWaypoints.map((waypoint, waypointIndex) => {
        if (waypointIndex !== index) {
          return waypoint;
        }
        if (field === 'name') {
          return { ...waypoint, name: String(value).trim() || `Waypoint ${index + 1}` };
        }
        if (field === 'dwell_seconds') {
          return { ...waypoint, dwell_seconds: Math.max(0, numberValue(value, waypoint.dwell_seconds)) };
        }
        return {
          ...waypoint,
          target: { ...waypoint.target, [field]: numberValue(value, waypoint.target[field]) },
        };
      }),
    }));
  },

  moveDraftWaypoint(index, direction) {
    set((state) => {
      const nextIndex = index + direction;
      if (nextIndex < 0 || nextIndex >= state.draftWaypoints.length) {
        return state;
      }
      const draftWaypoints = [...state.draftWaypoints];
      [draftWaypoints[index], draftWaypoints[nextIndex]] = [draftWaypoints[nextIndex], draftWaypoints[index]];
      return { draftWaypoints };
    });
  },

  removeDraftWaypoint(index) {
    set((state) => ({ draftWaypoints: state.draftWaypoints.filter((_, waypointIndex) => waypointIndex !== index) }));
  },

  saveDraftSequence() {
    const { draftName, draftWaypoints, savedSequences } = get();
    if (draftWaypoints.length === 0) {
      set({ error: 'Add at least one waypoint before saving' });
      return;
    }
    const name = draftName.trim() || `Sequence ${savedSequences.length + 1}`;
    const existing = savedSequences.find((sequence) => sequence.name === name);
    const savedSequence: SavedSequence = {
      id: existing?.id ?? crypto.randomUUID(),
      name,
      waypoints: cloneWaypoints(draftWaypoints),
      updated_at: new Date().toISOString(),
    };
    const nextSequences = [savedSequence, ...savedSequences.filter((sequence) => sequence.id !== savedSequence.id)];
    persistSavedSequences(nextSequences);
    set({ savedSequences: nextSequences, draftName: name, error: null });
  },

  loadSavedSequence(sequence) {
    set({ draftName: sequence.name, draftWaypoints: cloneWaypoints(sequence.waypoints), activePresetName: null });
  },

  deleteSavedSequence(id) {
    const nextSequences = get().savedSequences.filter((sequence) => sequence.id !== id);
    persistSavedSequences(nextSequences);
    set({ savedSequences: nextSequences });
  },

  importDraftWaypoints(waypoints, name = 'Imported sequence') {
    set({ draftName: name, draftWaypoints: cloneWaypoints(waypoints), activePresetName: null, error: null });
  },

  async checkTarget() {
    set({ busy: true, error: null });
    try {
      const result = await checkTarget(get().target);
      set({ checkResult: result });
    } catch (error) {
      set({ error: errorMessage(error), checkResult: null });
    } finally {
      set({ busy: false });
    }
  },

  async moveTarget() {
    set({ busy: true, error: null, activePresetName: null });
    try {
      await moveTarget(get().target);
    } catch (error) {
      set({ error: errorMessage(error) });
    } finally {
      set({ busy: false });
    }
  },

  async runPreset(preset) {
    set({ busy: true, error: null, activePresetName: preset.name });
    try {
      await runSequence(preset.waypoints);
    } catch (error) {
      set({ error: errorMessage(error), activePresetName: null });
    } finally {
      set({ busy: false });
    }
  },

  async runDraftSequence() {
    const { draftWaypoints, draftName } = get();
    if (draftWaypoints.length === 0) {
      set({ error: 'Add at least one waypoint before running' });
      return;
    }
    set({ busy: true, error: null, activePresetName: draftName });
    try {
      await runSequence(draftWaypoints);
    } catch (error) {
      set({ error: errorMessage(error), activePresetName: null });
    } finally {
      set({ busy: false });
    }
  },

  async stopSequence() {
    set({ busy: true, error: null });
    try {
      await stopSequence();
    } catch (error) {
      set({ error: errorMessage(error) });
    } finally {
      set({ busy: false, activePresetName: null });
    }
  },

  clearError() {
    set({ error: null });
  },
}));

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unexpected dashboard error';
}

function cloneWaypoints(waypoints: Waypoint[]): Waypoint[] {
  return waypoints.map((waypoint) => ({
    name: waypoint.name,
    target: { ...waypoint.target },
    dwell_seconds: waypoint.dwell_seconds,
  }));
}

function numberValue(value: string | number, fallback: number): number {
  const parsed = typeof value === 'number' ? value : Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function loadSavedSequences(): SavedSequence[] {
  try {
    const raw = localStorage.getItem(savedSequencesKey);
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw) as SavedSequence[];
    return Array.isArray(parsed) ? parsed.filter(isSavedSequence) : [];
  } catch {
    return [];
  }
}

function persistSavedSequences(sequences: SavedSequence[]): void {
  localStorage.setItem(savedSequencesKey, JSON.stringify(sequences));
}

function isSavedSequence(value: SavedSequence): value is SavedSequence {
  return Boolean(value?.id && value?.name && Array.isArray(value.waypoints));
}
