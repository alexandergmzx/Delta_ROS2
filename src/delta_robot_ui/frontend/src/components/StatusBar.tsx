import { Activity, CircleAlert, Radio, RadioTower } from 'lucide-react';

import { useDashboardStore } from '../store/dashboardStore';

export function StatusBar() {
  const connection = useDashboardStore((state) => state.connection);
  const health = useDashboardStore((state) => state.snapshot?.health);
  const sequence = useDashboardStore((state) => state.snapshot?.sequence);

  return (
    <div className="status-bar" aria-label="ROS status">
      <StatusPill
        active={connection === 'live'}
        icon={connection === 'live' ? RadioTower : Radio}
        label={connection === 'live' ? 'Live' : connection === 'connecting' ? 'Connecting' : 'Offline'}
      />
      <StatusPill active={Boolean(health?.joint_states)} icon={Activity} label="Joint states" />
      <StatusPill active={Boolean(health?.ikin_service)} icon={RadioTower} label="IK" />
      <StatusPill active={Boolean(health?.trajectory_action)} icon={RadioTower} label="Action" />
      <StatusPill active={Boolean(sequence?.running)} icon={CircleAlert} label={sequence?.phase ?? 'Idle'} tone="amber" />
    </div>
  );
}

type StatusPillProps = {
  active: boolean;
  icon: typeof Activity;
  label: string;
  tone?: 'green' | 'amber';
};

function StatusPill({ active, icon: Icon, label, tone = 'green' }: StatusPillProps) {
  return (
    <span className={`status-pill ${active ? `is-active ${tone}` : ''}`} title={label}>
      <Icon size={15} />
      {label}
    </span>
  );
}
