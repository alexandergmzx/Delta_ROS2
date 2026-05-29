export type Target = {
  x: number;
  y: number;
  z: number;
};

export type Waypoint = {
  name: string;
  target: Target;
  dwell_seconds: number;
};

export type Preset = {
  name: string;
  description?: string;
  waypoints: Waypoint[];
};

export type JointStateSnapshot = {
  connected: boolean;
  age_sec: number | null;
  position_mm: Target | null;
  motor_angles_deg: number[] | null;
  joint_names: string[];
};

export type HealthSnapshot = {
  joint_states: boolean;
  ikin_service: boolean;
  trajectory_action: boolean;
};

export type SequenceStatus = {
  running: boolean;
  phase: string;
  active_index: number | null;
  total: number;
  message: string;
  feedback: Target | null;
  last_result: unknown;
  stop_requested: boolean;
};

export type DashboardSnapshot = {
  state: JointStateSnapshot;
  health: HealthSnapshot;
  sequence: SequenceStatus;
  presets?: Preset[];
};

export type TargetCheckResult = {
  target: Target;
  reachable: boolean;
  motor_angles_deg: number[];
  message: string;
};

export type ApiAccepted = {
  accepted: boolean;
  message: string;
};

export type SnapshotEvent =
  | DashboardSnapshot
  | {
      type: 'snapshot';
      payload: DashboardSnapshot;
    };
