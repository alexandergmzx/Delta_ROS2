import * as client from './client';
import * as standalone from '../standalone/api';
import type {
  ApiAccepted,
  DashboardApi,
  DashboardSnapshot,
  Preset,
  SocketLike,
  Target,
  TargetCheckResult,
  TrajectoryConfig,
  Waypoint,
} from './types';

export type DashboardMode = 'ros' | 'standalone';

// VITE_STANDALONE=true (set by --mode standalone) hard-selects the in-browser
// simulator; otherwise the live backend is used until a network failure
// triggers activateStandaloneFallback().
let impl: DashboardApi = import.meta.env.VITE_STANDALONE === 'true' ? standalone : client;

export function getMode(): DashboardMode {
  return impl === client ? 'ros' : 'standalone';
}

export function activateStandaloneFallback(): boolean {
  if (impl === standalone) {
    return false;
  }
  impl = standalone;
  return true;
}

export function getSnapshot(): Promise<DashboardSnapshot> {
  return impl.getSnapshot();
}

export function getPresets(): Promise<Preset[]> {
  return impl.getPresets();
}

export function getTrajectoryConfig(): Promise<TrajectoryConfig> {
  return impl.getTrajectoryConfig();
}

export function setTrajectoryConfig(trajectoryRateHz: number): Promise<TrajectoryConfig> {
  return impl.setTrajectoryConfig(trajectoryRateHz);
}

export function checkTarget(target: Target): Promise<TargetCheckResult> {
  return impl.checkTarget(target);
}

export function moveTarget(target: Target): Promise<ApiAccepted> {
  return impl.moveTarget(target);
}

export function runSequence(waypoints: Waypoint[]): Promise<ApiAccepted> {
  return impl.runSequence(waypoints);
}

export function stopSequence(): Promise<ApiAccepted> {
  return impl.stopSequence();
}

export function openDashboardSocket(onSnapshot: (snapshot: DashboardSnapshot) => void): SocketLike {
  return impl.openDashboardSocket(onSnapshot);
}
