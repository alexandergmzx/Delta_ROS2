import presetsYaml from '../../../config/presets.yaml';

import type { Preset, Waypoint } from '../api/types';

type RawWaypoint = {
  name?: unknown;
  x?: unknown;
  y?: unknown;
  z?: unknown;
  dwell_seconds?: unknown;
};

type RawPreset = {
  name?: unknown;
  description?: unknown;
  waypoints?: RawWaypoint[];
};

// Mirrors config.py:load_presets so the bundled presets match what the backend serves.
export const standalonePresets: Preset[] = (
  (presetsYaml as { presets?: RawPreset[] }).presets ?? []
).map((preset) => ({
  name: String(preset.name ?? 'Preset').trim(),
  description: String(preset.description ?? '').trim(),
  waypoints: (preset.waypoints ?? []).map(toWaypoint),
}));

export function clonePresets(): Preset[] {
  return standalonePresets.map((preset) => ({
    ...preset,
    waypoints: preset.waypoints.map((waypoint) => ({
      ...waypoint,
      target: { ...waypoint.target },
    })),
  }));
}

function toWaypoint(raw: RawWaypoint, index: number): Waypoint {
  return {
    name: String(raw.name ?? `Waypoint ${index + 1}`).trim().slice(0, 80) || `Waypoint ${index + 1}`,
    target: { x: toNumber(raw.x), y: toNumber(raw.y), z: toNumber(raw.z) },
    dwell_seconds: Math.max(0, toNumber(raw.dwell_seconds)),
  };
}

function toNumber(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}
