"use client";

import {
  Environment,
  Grid,
  OrbitControls,
  TransformControls,
} from "@react-three/drei";
import { Canvas, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import type { Mesh } from "three";
import { Box3, Vector3 } from "three";

import {
  type CameraPreset,
  type EditorNode,
  useEditorStore,
} from "@/modules/editor/editor-store";

function getTransformMode(tool: ReturnType<typeof useEditorStore.getState>["activeTool"]) {
  if (tool === "rotate" || tool === "scale") return tool;
  return "translate";
}

function CameraRig() {
  const cameraPreset = useEditorStore((state) => state.cameraPreset);
  const nodes = useEditorStore((state) => state.nodes);
  const { camera } = useThree();

  useEffect(() => {
    const visibleNodes = nodes.filter((node) => node.visible);
    const center = new Vector3();

    if (visibleNodes.length > 0) {
      const box = new Box3();
      visibleNodes.forEach((node) => {
        box.expandByPoint(new Vector3(...node.position));
      });
      box.getCenter(center);
    }

    const distance = cameraPreset === "fit" ? 7 : 6;
    const presets: Record<CameraPreset, [number, number, number]> = {
      iso: [distance, distance, distance],
      front: [0, 2.5, distance],
      right: [distance, 2.5, 0],
      top: [0, distance, 0.001],
      fit: [distance, distance * 0.8, distance],
    };
    const offset = presets[cameraPreset];

    camera.position.set(
      center.x + offset[0],
      center.y + offset[1],
      center.z + offset[2],
    );
    camera.lookAt(center);
    camera.updateProjectionMatrix();
  }, [camera, cameraPreset, nodes]);

  return null;
}

type EditableNodeProps = {
  node: EditorNode;
};

function EditableNode({ node }: EditableNodeProps) {
  const meshRef = useRef<Mesh>(null);
  const activeTool = useEditorStore((state) => state.activeTool);
  const selectedObjectId = useEditorStore((state) => state.selectedObjectId);
  const selectObject = useEditorStore((state) => state.selectObject);
  const updateNodeTransform = useEditorStore((state) => state.updateNodeTransform);
  const isSelected = selectedObjectId === node.id;
  const transformMode = getTransformMode(activeTool);
  const geometry = useMemo(() => {
    if (node.type === "step") return "box";
    if (node.type === "array-instance") return "sphere";
    return "box";
  }, [node.type]);

  if (!node.visible) return null;

  return (
    <>
      <mesh
        ref={meshRef}
        position={node.position}
        rotation={node.rotation}
        scale={node.scale}
        onClick={(event) => {
          event.stopPropagation();
          selectObject(node.id);
        }}
      >
        {geometry === "sphere" ? (
          <sphereGeometry args={[0.65, 24, 16]} />
        ) : (
          <boxGeometry args={[1.6, 1.6, 1.6]} />
        )}
        <meshStandardMaterial
          color={isSelected ? "#d8dfc8" : node.color}
          wireframe={node.type === "array-instance"}
        />
      </mesh>
      {isSelected && meshRef.current ? (
        <TransformControls
          object={meshRef.current}
          mode={transformMode}
          onObjectChange={() => {
            const object = meshRef.current;
            if (!object) return;
            updateNodeTransform(node.id, {
              position: [object.position.x, object.position.y, object.position.z],
              rotation: [object.rotation.x, object.rotation.y, object.rotation.z],
              scale: [object.scale.x, object.scale.y, object.scale.z],
            });
          }}
        />
      ) : null}
    </>
  );
}

export function EditorViewport() {
  const selectObject = useEditorStore((state) => state.selectObject);
  const nodes = useEditorStore((state) => state.nodes);
  const snap = useEditorStore((state) => state.snap);
  const stepMessage = useEditorStore((state) => state.stepMessage);

  return (
    <section className="relative bg-[#101214]">
      <Canvas
        camera={{ position: [4, 4, 6], fov: 45 }}
        onPointerMissed={() => selectObject(null)}
      >
        <color attach="background" args={["#101214"]} />
        <ambientLight intensity={0.8} />
        <directionalLight position={[4, 8, 3]} intensity={1.8} />
        <CameraRig />
        {nodes.map((node) => (
          <EditableNode key={node.id} node={node} />
        ))}
        <Grid
          args={[16, 16]}
          cellSize={snap.step}
          cellThickness={0.45}
          cellColor="#4b5563"
          sectionSize={snap.step * 4}
          sectionThickness={1}
          sectionColor={snap.enabled && snap.grid ? "#d8dfc8" : "#555555"}
          position={[0, -0.01, 0]}
        />
        <Environment preset="city" />
        <OrbitControls makeDefault />
      </Canvas>
      <div className="pointer-events-none absolute left-4 top-4 rounded-md border border-white/10 bg-black/35 px-3 py-2 text-xs text-white/70">
        Camera controls / STEP / nodes / snaps / transform ready
      </div>
      <div className="pointer-events-none absolute bottom-4 left-4 rounded-md border border-white/10 bg-black/35 px-3 py-2 text-xs text-white/70">
        Snap: {snap.enabled ? "on" : "off"} / grid {snap.step} / {stepMessage}
      </div>
    </section>
  );
}
