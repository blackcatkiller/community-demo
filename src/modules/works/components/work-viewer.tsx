"use client";

import { Environment, Grid, OrbitControls } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";

type WorkViewerProps = {
  tone: string;
  label: string;
};

export function WorkViewer({ tone, label }: WorkViewerProps) {
  return (
    <div className="relative h-[520px] max-h-[70vh] min-h-[420px] overflow-hidden rounded-lg bg-[#101214]">
      <Canvas camera={{ position: [4, 3, 6], fov: 45 }}>
        <color attach="background" args={["#101214"]} />
        <ambientLight intensity={0.8} />
        <directionalLight position={[4, 8, 3]} intensity={1.5} />
        <mesh position={[0, 1, 0]}>
          <boxGeometry args={[1.8, 1.8, 1.8]} />
          <meshStandardMaterial color={tone} />
        </mesh>
        <Grid
          args={[12, 12]}
          cellSize={0.5}
          cellThickness={0.6}
          cellColor="#4b5563"
          sectionSize={2}
          sectionThickness={1}
          sectionColor="#d8dfc8"
          position={[0, -0.01, 0]}
        />
        <Environment preset="city" />
        <OrbitControls makeDefault />
      </Canvas>
      <div className="pointer-events-none absolute left-4 top-4 rounded-md border border-white/10 bg-black/35 px-3 py-2 text-xs text-white/70">
        3D preview: {label}
      </div>
    </div>
  );
}
