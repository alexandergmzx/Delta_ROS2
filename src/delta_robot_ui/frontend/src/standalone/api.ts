import type {
  ApiAccepted,
  DashboardSnapshot,
  Preset,
  SocketLike,
  Target,
  TargetCheckResult,
  TrajectoryConfig,
  Waypoint,
} from '../api/types';
import { standaloneEngine } from './engine';
import { anglesAreCommandable, motorAnglesDeg } from './kinematics';
import { clonePresets } from './presets';

export function getSnapshot(): Promise<DashboardSnapshot> {
  return Promise.resolve({ ...standaloneEngine.snapshot(), presets: clonePresets() });
}

export function getPresets(): Promise<Preset[]> {
  return Promise.resolve(clonePresets());
}

export function getTrajectoryConfig(): Promise<TrajectoryConfig> {
  return Promise.resolve(standaloneEngine.trajectoryConfig());
}

export function setTrajectoryConfig(trajectoryRateHz: number): Promise<TrajectoryConfig> {
  try {
    return Promise.resolve(standaloneEngine.setTrajectoryRateHz(trajectoryRateHz));
  } catch (error) {
    return Promise.reject(error);
  }
}

export function checkTarget(target: Target): Promise<TargetCheckResult> {
  const angles = motorAnglesDeg(target);
  const reachable = anglesAreCommandable(angles);
  return Promise.resolve({
    target: { ...target },
    reachable,
    motor_angles_deg: angles,
    message: reachable ? 'Target is commandable' : 'Target is outside the commandable motor range',
  });
}

export function moveTarget(target: Target): Promise<ApiAccepted> {
  return Promise.resolve(standaloneEngine.startMove({ ...target }));
}

export function runSequence(waypoints: Waypoint[]): Promise<ApiAccepted> {
  return Promise.resolve(standaloneEngine.startSequence(waypoints));
}

export function stopSequence(): Promise<ApiAccepted> {
  return Promise.resolve(standaloneEngine.requestStop());
}

export function openDashboardSocket(onSnapshot: (snapshot: DashboardSnapshot) => void): SocketLike {
  const listeners: Record<string, Array<() => void>> = {};
  let closed = false;

  const unsubscribe = standaloneEngine.subscribe((snapshot) => {
    if (!closed) {
      onSnapshot(snapshot);
    }
  });
  const openTimer = setTimeout(() => fire('open'), 0);

  function fire(type: string): void {
    for (const listener of listeners[type] ?? []) {
      listener();
    }
  }

  return {
    addEventListener(type, listener) {
      (listeners[type] ??= []).push(listener);
    },
    close() {
      if (closed) {
        return;
      }
      closed = true;
      clearTimeout(openTimer);
      unsubscribe();
      setTimeout(() => fire('close'), 0);
    },
  };
}
