import { lazy, Suspense, useEffect } from 'react';
import { RotateCw, X } from 'lucide-react';

import { SequencePanel } from './components/SequencePanel';
import { StatusBar } from './components/StatusBar';
import { TargetControl } from './components/TargetControl';
import { useDashboardStore } from './store/dashboardStore';

const RobotScene = lazy(() => import('./components/RobotScene').then((module) => ({ default: module.RobotScene })));

export function App() {
  const loadInitial = useDashboardStore((state) => state.loadInitial);
  const connectLive = useDashboardStore((state) => state.connectLive);
  const error = useDashboardStore((state) => state.error);
  const clearError = useDashboardStore((state) => state.clearError);

  useEffect(() => {
    void loadInitial();
    return connectLive();
  }, [connectLive, loadInitial]);

  return (
    <div className="app-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">Delta ROS2</p>
          <h1>Dashboard</h1>
        </div>
        <StatusBar />
      </header>

      {error ? (
        <div className="alert" role="alert">
          <span>{error}</span>
          <button type="button" className="icon-button" title="Retry" onClick={() => void loadInitial()}>
            <RotateCw size={18} />
          </button>
          <button type="button" className="icon-button" title="Dismiss" onClick={clearError}>
            <X size={18} />
          </button>
        </div>
      ) : null}

      <main className="workspace-grid">
        <section className="scene-panel" aria-label="Robot view">
          <Suspense fallback={<div className="scene-loading">Preparing view</div>}>
            <RobotScene />
          </Suspense>
        </section>
        <aside className="control-stack" aria-label="Robot controls">
          <TargetControl />
          <SequencePanel />
        </aside>
      </main>
    </div>
  );
}
