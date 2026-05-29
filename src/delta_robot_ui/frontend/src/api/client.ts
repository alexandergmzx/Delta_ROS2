import type { ApiAccepted, DashboardSnapshot, Preset, SnapshotEvent, Target, TargetCheckResult, Waypoint } from './types';

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    headers: {
      'Content-Type': 'application/json',
      ...init?.headers,
    },
    ...init,
  });

  if (!response.ok) {
    let detail = response.statusText;
    try {
      const body = (await response.json()) as { detail?: string };
      detail = body.detail ?? detail;
    } catch {
      detail = await response.text();
    }
    throw new Error(detail || `Request failed with ${response.status}`);
  }

  return (await response.json()) as T;
}

export function getSnapshot(): Promise<DashboardSnapshot> {
  return requestJson<DashboardSnapshot>('/api/state');
}

export async function getPresets(): Promise<Preset[]> {
  const response = await requestJson<{ presets: Preset[] }>('/api/presets');
  return response.presets;
}

export function checkTarget(target: Target): Promise<TargetCheckResult> {
  return requestJson<TargetCheckResult>('/api/target/check', {
    method: 'POST',
    body: JSON.stringify({ target }),
  });
}

export function moveTarget(target: Target): Promise<ApiAccepted> {
  return requestJson<ApiAccepted>('/api/move', {
    method: 'POST',
    body: JSON.stringify({ target }),
  });
}

export function runSequence(waypoints: Waypoint[]): Promise<ApiAccepted> {
  return requestJson<ApiAccepted>('/api/sequence', {
    method: 'POST',
    body: JSON.stringify({ waypoints }),
  });
}

export function stopSequence(): Promise<ApiAccepted> {
  return requestJson<ApiAccepted>('/api/sequence/stop', {
    method: 'POST',
    body: JSON.stringify({}),
  });
}

export function openDashboardSocket(onSnapshot: (snapshot: DashboardSnapshot) => void): WebSocket {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const socket = new WebSocket(`${protocol}//${window.location.host}/ws`);

  socket.addEventListener('message', (event) => {
    const data = JSON.parse(event.data as string) as SnapshotEvent;
    onSnapshot(normalizeSnapshotEvent(data));
  });

  return socket;
}

function normalizeSnapshotEvent(data: SnapshotEvent): DashboardSnapshot {
  if (isWrappedSnapshot(data)) {
    return data.payload;
  }
  return data;
}

function isWrappedSnapshot(data: SnapshotEvent): data is { type: 'snapshot'; payload: DashboardSnapshot } {
  return 'type' in data && data.type === 'snapshot';
}
