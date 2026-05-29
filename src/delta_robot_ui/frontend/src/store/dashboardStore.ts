import { create } from 'zustand';

import { checkTarget, getPresets, getSnapshot, moveTarget, openDashboardSocket, runSequence, stopSequence } from '../api/client';
import type { DashboardSnapshot, Preset, Target, TargetCheckResult } from '../api/types';

type ConnectionState = 'connecting' | 'live' | 'offline';

type DashboardStore = {
  snapshot: DashboardSnapshot | null;
  presets: Preset[];
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
  checkTarget: () => Promise<void>;
  moveTarget: () => Promise<void>;
  runPreset: (preset: Preset) => Promise<void>;
  stopSequence: () => Promise<void>;
  clearError: () => void;
};

let liveSocket: WebSocket | null = null;

const initialTarget: Target = { x: 0, y: 0, z: -100 };

export const useDashboardStore = create<DashboardStore>((set, get) => ({
  snapshot: null,
  presets: [],
  target: initialTarget,
  checkResult: null,
  activePresetName: null,
  connection: 'connecting',
  busy: false,
  error: null,

  async loadInitial() {
    try {
      const [snapshot, presets] = await Promise.all([getSnapshot(), getPresets()]);
      set({ snapshot, presets, error: null });
    } catch (error) {
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
