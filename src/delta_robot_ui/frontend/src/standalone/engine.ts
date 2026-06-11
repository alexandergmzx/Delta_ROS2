import type {
  ApiAccepted,
  DashboardSnapshot,
  SequenceStatus,
  Target,
  TrajectoryConfig,
  Waypoint,
} from '../api/types';
import { anglesAreCommandable, motorAnglesDeg } from './kinematics';

// Matches server.py WEBSOCKET_INTERVAL_SEC so the demo streams at the live cadence.
const SNAPSHOT_INTERVAL_MS = 100;
// Matches trajPlan_actionServer.cpp defaults.
const TRAJECTORY_STEPS = 10;
const DWELL_POLL_MS = 50;
const INITIAL_POSITION: Target = { x: 0, y: 0, z: -100 };

// Mirrors deltaLinkNames in delta_joint_pub.cpp so snapshots look identical to the live bridge.
const JOINT_NAMES = [
  'platform_base_x', 'platform_base_y', 'platform_base_z',
  'proximal_base1', 'distal_proximal_1_y', 'distal_proximal_1_x',
  'proximal_base2', 'distal_proximal_3_y', 'distal_proximal_3_x',
  'proximal_base3', 'distal_proximal_5_y', 'distal_proximal_5_x',
];

type SnapshotListener = (snapshot: DashboardSnapshot) => void;

class StandaloneEngine {
  private position: Target = { ...INITIAL_POSITION };
  private motorAngles = motorAnglesDeg(INITIAL_POSITION);
  private trajectoryRateHz = 10;
  private status: SequenceStatus = idleStatus();
  private stopRequested = false;
  private runId = 0;
  private listeners = new Set<SnapshotListener>();
  private timer: ReturnType<typeof setInterval> | null = null;

  subscribe(listener: SnapshotListener): () => void {
    this.listeners.add(listener);
    listener(this.snapshot());
    if (this.timer === null) {
      this.timer = setInterval(() => this.broadcast(), SNAPSHOT_INTERVAL_MS);
    }
    return () => {
      this.listeners.delete(listener);
      if (this.listeners.size === 0 && this.timer !== null) {
        clearInterval(this.timer);
        this.timer = null;
      }
    };
  }

  snapshot(): DashboardSnapshot {
    return {
      state: {
        connected: true,
        age_sec: 0.0,
        position_mm: { ...this.position },
        motor_angles_deg: [...this.motorAngles],
        joint_names: [...JOINT_NAMES],
      },
      health: { joint_states: true, ikin_service: true, trajectory_action: true },
      sequence: {
        ...this.status,
        feedback: this.status.feedback ? { ...this.status.feedback } : null,
      },
    };
  }

  trajectoryConfig(): TrajectoryConfig {
    return {
      available: true,
      trajectory_rate_hz: this.trajectoryRateHz,
      trajectory_steps: TRAJECTORY_STEPS,
      trajectory_node: 'standalone simulator',
    };
  }

  setTrajectoryRateHz(rateHz: number): TrajectoryConfig {
    if (!Number.isFinite(rateHz) || rateHz < 1.0 || rateHz > 60.0) {
      throw new Error('trajectory_rate_hz must be between 1 and 60');
    }
    this.trajectoryRateHz = rateHz;
    return this.trajectoryConfig();
  }

  startMove(target: Target): ApiAccepted {
    return this.startSequence([{ name: 'Manual move', target, dwell_seconds: 0 }]);
  }

  startSequence(waypoints: Waypoint[]): ApiAccepted {
    if (waypoints.length === 0) {
      throw new Error('At least one waypoint is required');
    }
    if (this.status.running) {
      return { accepted: false, message: 'A sequence is already running' };
    }
    this.stopRequested = false;
    this.status = {
      running: true,
      phase: 'queued',
      active_index: null,
      total: waypoints.length,
      message: 'Sequence queued',
      feedback: null,
      last_result: null,
      stop_requested: false,
    };
    void this.runSequence(waypoints.map(cloneWaypoint), ++this.runId);
    return { accepted: true, message: 'Sequence started' };
  }

  requestStop(): ApiAccepted {
    if (!this.status.running) {
      return { accepted: false, message: 'No sequence is running' };
    }
    this.stopRequested = true;
    this.setStatus({ stop_requested: true, message: 'Stop requested after current waypoint' });
    return { accepted: true, message: 'Stop requested after current waypoint' };
  }

  // Mirrors SequenceRunner._run_sequence: validate, move, dwell per waypoint;
  // stop is honored between waypoints only.
  private async runSequence(waypoints: Waypoint[], runId: number): Promise<void> {
    let finalPhase = 'complete';
    let finalMessage = 'Sequence complete';

    for (let index = 0; index < waypoints.length; index += 1) {
      const waypoint = waypoints[index];
      if (this.stopRequested) {
        finalPhase = 'stopped';
        finalMessage = 'Sequence stopped before next waypoint';
        break;
      }

      this.setStatus({
        phase: 'validating',
        active_index: index,
        message: `Validating ${waypoint.name}`,
        feedback: null,
      });
      const angles = motorAnglesDeg(waypoint.target);
      if (!anglesAreCommandable(angles)) {
        finalPhase = 'failed';
        finalMessage = `${waypoint.name} is not commandable`;
        this.setStatus({
          last_result: {
            target: { ...waypoint.target },
            reachable: false,
            motor_angles_deg: angles,
            message: 'Target is outside the commandable motor range',
          },
        });
        break;
      }

      this.setStatus({ phase: 'moving', message: `Moving to ${waypoint.name}` });
      const moved = await this.animateMove(waypoint.target, runId);
      if (runId !== this.runId) {
        return;
      }
      if (!moved) {
        finalPhase = 'failed';
        finalMessage = `${waypoint.name} aborted`;
        break;
      }

      if (waypoint.dwell_seconds > 0 && !this.stopRequested) {
        this.setStatus({ phase: 'dwell', message: `Dwelling at ${waypoint.name}` });
        await this.dwell(waypoint.dwell_seconds, runId);
        if (runId !== this.runId) {
          return;
        }
      }
    }

    if (this.stopRequested && finalPhase === 'complete') {
      finalPhase = 'stopped';
      finalMessage = 'Sequence stopped after current waypoint';
    }
    this.setStatus({
      running: false,
      phase: finalPhase,
      active_index: null,
      message: finalMessage,
      stop_requested: this.stopRequested,
    });
  }

  // Mirrors generate_trajectory in trajPlan_actionServer.cpp: trajectory_steps points
  // from just past the start to the goal, one per 1/rate s, aborting at the first
  // uncommandable intermediate point.
  private async animateMove(target: Target, runId: number): Promise<boolean> {
    const start = { ...this.position };
    for (let step = 1; step <= TRAJECTORY_STEPS; step += 1) {
      const point: Target = {
        x: start.x + ((target.x - start.x) * step) / TRAJECTORY_STEPS,
        y: start.y + ((target.y - start.y) * step) / TRAJECTORY_STEPS,
        z: start.z + ((target.z - start.z) * step) / TRAJECTORY_STEPS,
      };
      const angles = motorAnglesDeg(point);
      if (!anglesAreCommandable(angles)) {
        this.setStatus({
          last_result: { accepted: true, status: 6, status_text: 'aborted', result: { ...point } },
        });
        return false;
      }
      await sleep(1000 / this.trajectoryRateHz);
      if (runId !== this.runId) {
        return false;
      }
      this.position = point;
      this.motorAngles = angles;
      this.setStatus({ feedback: { ...point } });
    }
    this.setStatus({
      last_result: { accepted: true, status: 4, status_text: 'succeeded', result: { ...this.position } },
    });
    return true;
  }

  private async dwell(seconds: number, runId: number): Promise<void> {
    const dwellUntil = performance.now() + seconds * 1000;
    while (performance.now() < dwellUntil && !this.stopRequested) {
      await sleep(DWELL_POLL_MS);
      if (runId !== this.runId) {
        return;
      }
    }
  }

  private setStatus(updates: Partial<SequenceStatus>): void {
    this.status = { ...this.status, ...updates };
  }

  private broadcast(): void {
    const snapshot = this.snapshot();
    for (const listener of this.listeners) {
      listener(snapshot);
    }
  }
}

function idleStatus(): SequenceStatus {
  return {
    running: false,
    phase: 'idle',
    active_index: null,
    total: 0,
    message: 'Ready',
    feedback: null,
    last_result: null,
    stop_requested: false,
  };
}

function cloneWaypoint(waypoint: Waypoint): Waypoint {
  return {
    name: waypoint.name,
    target: { ...waypoint.target },
    dwell_seconds: waypoint.dwell_seconds,
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export const standaloneEngine = new StandaloneEngine();
