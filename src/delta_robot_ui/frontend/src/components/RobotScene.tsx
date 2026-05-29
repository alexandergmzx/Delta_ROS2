import { useMemo } from 'react';
import { Canvas } from '@react-three/fiber';
import { Line, OrbitControls } from '@react-three/drei';
import type { Vector3Tuple } from 'three';

import { useDashboardStore } from '../store/dashboardStore';
import type { Target } from '../api/types';

const SCALE = 0.024;
const BASE_RADIUS = 1.75;
const PLATFORM_RADIUS = 0.55;

export function RobotScene() {
  const position = useDashboardStore((state) => state.snapshot?.state.position_mm ?? null);
  const target = useDashboardStore((state) => state.target);
  const sequenceFeedback = useDashboardStore((state) => state.snapshot?.sequence.feedback ?? null);
  const pose = sequenceFeedback ?? position ?? target;

  return (
    <div className="scene-wrap">
      <Canvas camera={{ position: [3.8, 2.4, 4.6], fov: 42 }} dpr={[1, 2]}>
        <color attach="background" args={["#f8fafc"]} />
        <ambientLight intensity={0.7} />
        <directionalLight position={[3, 6, 4]} intensity={1.1} />
        <gridHelper args={[5, 10, '#d4dce7', '#e8edf3']} position={[0, -3.1, 0]} />
        <RobotGeometry pose={pose} target={target} hasLivePose={Boolean(position)} />
        <OrbitControls makeDefault enableDamping dampingFactor={0.08} maxDistance={8} minDistance={2.2} />
      </Canvas>
      <div className="scene-overlay">
        <span>Live View</span>
        <strong>{position ? `${position.x.toFixed(1)}, ${position.y.toFixed(1)}, ${position.z.toFixed(1)} mm` : 'Awaiting ROS state'}</strong>
      </div>
    </div>
  );
}

type RobotGeometryProps = {
  pose: Target;
  target: Target;
  hasLivePose: boolean;
};

function RobotGeometry({ pose, target, hasLivePose }: RobotGeometryProps) {
  const baseAnchors = useAnchors(BASE_RADIUS, 0);
  const platformAnchors = useAnchors(PLATFORM_RADIUS, 0);
  const platformCenter = toScenePoint(pose);
  const targetCenter = toScenePoint(target);
  const translatedPlatform = platformAnchors.map(([x, y, z]) => [x + platformCenter[0], y + platformCenter[1], z + platformCenter[2]] as Vector3Tuple);

  return (
    <group>
      <Line points={[...baseAnchors, baseAnchors[0]]} color="#1f2937" lineWidth={2} />
      <Line points={[...translatedPlatform, translatedPlatform[0]]} color="#0f766e" lineWidth={3} />
      {baseAnchors.map((anchor, index) => (
        <Line key={index} points={[anchor, translatedPlatform[index]]} color="#2563eb" lineWidth={2} />
      ))}
      {baseAnchors.map((anchor, index) => (
        <JointMarker key={`base-${index}`} position={anchor} color="#334155" />
      ))}
      {translatedPlatform.map((anchor, index) => (
        <JointMarker key={`platform-${index}`} position={anchor} color="#0f766e" />
      ))}
      <mesh position={platformCenter}>
        <sphereGeometry args={[0.105, 24, 24]} />
        <meshStandardMaterial color={hasLivePose ? '#0f766e' : '#f59e0b'} roughness={0.45} metalness={0.08} />
      </mesh>
      <mesh position={targetCenter}>
        <boxGeometry args={[0.14, 0.14, 0.14]} />
        <meshStandardMaterial color="#dc2626" roughness={0.5} />
      </mesh>
      <Line points={[[0, 0, 0], platformCenter]} color="#94a3b8" lineWidth={1} dashed dashSize={0.12} gapSize={0.08} />
    </group>
  );
}

function JointMarker({ position, color }: { position: Vector3Tuple; color: string }) {
  return (
    <mesh position={position}>
      <sphereGeometry args={[0.055, 16, 16]} />
      <meshStandardMaterial color={color} />
    </mesh>
  );
}

function useAnchors(radius: number, y: number): Vector3Tuple[] {
  return useMemo(
    () =>
      [0, 1, 2].map((index) => {
        const angle = -Math.PI / 2 + index * (Math.PI * 2 / 3);
        return [Math.cos(angle) * radius, y, Math.sin(angle) * radius] as Vector3Tuple;
      }),
    [radius, y],
  );
}

function toScenePoint(target: Target): Vector3Tuple {
  return [target.x * SCALE, target.z * SCALE, target.y * SCALE];
}
