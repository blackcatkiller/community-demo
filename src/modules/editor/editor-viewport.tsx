"use client";

import {
  Environment,
  Grid,
  OrbitControls,
  TransformControls,
} from "@react-three/drei";
import { Canvas, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import { BoxSelect, Crosshair, Maximize2 } from "lucide-react";
import type { Mesh } from "three";

import { getCameraPose } from "@/modules/editor/kernel/camera";
import {
  type EditorNode,
  ObjectSnapType,
  ObjectSnapTypeUtils,
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
    const pose = getCameraPose(nodes, cameraPreset);
    camera.position.copy(pose.position);
    camera.lookAt(pose.center);
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
  const setCameraPreset = useEditorStore((state) => state.setCameraPreset);
  const setSnapEnabled = useEditorStore((state) => state.setSnapEnabled);
  const setFaceSnapEnabled = useEditorStore((state) => state.setFaceSnapEnabled);
  const setTrackingEnabled = useEditorStore((state) => state.setTrackingEnabled);
  const toggleObjectSnapType = useEditorStore((state) => state.toggleObjectSnapType);
  const stepMessage = useEditorStore((state) => state.stepMessage);

  const snapItems = [
    {
      label: "启用捕捉",
      checked: snap.enableSnap,
      onChange: () => setSnapEnabled(!snap.enableSnap),
    },
    {
      label: "端点",
      checked: ObjectSnapTypeUtils.hasType(snap.snapTypes, ObjectSnapType.endPoint),
      onChange: () => toggleObjectSnapType(ObjectSnapType.endPoint),
    },
    {
      label: "中点",
      checked: ObjectSnapTypeUtils.hasType(snap.snapTypes, ObjectSnapType.midPoint),
      onChange: () => toggleObjectSnapType(ObjectSnapType.midPoint),
    },
    {
      label: "圆心",
      checked: ObjectSnapTypeUtils.hasType(snap.snapTypes, ObjectSnapType.center),
      onChange: () => toggleObjectSnapType(ObjectSnapType.center),
    },
    {
      label: "垂足",
      checked: ObjectSnapTypeUtils.hasType(snap.snapTypes, ObjectSnapType.perpendicular),
      onChange: () => toggleObjectSnapType(ObjectSnapType.perpendicular),
    },
    {
      label: "交点",
      checked: ObjectSnapTypeUtils.hasType(snap.snapTypes, ObjectSnapType.intersection),
      onChange: () => toggleObjectSnapType(ObjectSnapType.intersection),
    },
    {
      label: "面",
      checked: snap.enableFaceSnap,
      onChange: () => setFaceSnapEnabled(!snap.enableFaceSnap),
    },
    {
      label: "追踪",
      checked: snap.enableTracking,
      onChange: () => setTrackingEnabled(!snap.enableTracking),
    },
  ];

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
          cellSize={snap.grid}
          cellThickness={0.45}
          cellColor="#4b5563"
          sectionSize={snap.grid * 4}
          sectionThickness={1}
          sectionColor={snap.enableSnap ? "#d8dfc8" : "#555555"}
          position={[0, -0.01, 0]}
        />
        <Environment preset="city" />
        <OrbitControls makeDefault />
      </Canvas>
      <div className="absolute left-3 top-3 z-10 flex flex-col gap-2">
        <button
          type="button"
          title="Fit content"
          aria-label="Fit content"
          onClick={() => setCameraPreset("fit")}
          className="grid size-8 place-items-center rounded border border-white/15 bg-[#171921] text-white/75 transition hover:bg-white/10 hover:text-white"
        >
          <Maximize2 className="size-4" />
        </button>
        <button
          type="button"
          title="Box select"
          aria-label="Box select"
          onClick={() => selectObject(null)}
          className="grid size-8 place-items-center rounded border border-white/15 bg-[#171921] text-white/75 transition hover:bg-white/10 hover:text-white"
        >
          <BoxSelect className="size-4" />
        </button>
      </div>
      <div className="pointer-events-none absolute inset-0 grid place-items-center">
        <Crosshair className="size-7 text-white/35" strokeWidth={1.4} />
      </div>
      <div className="absolute bottom-4 left-1/2 z-10 flex -translate-x-1/2 items-center gap-2 rounded border border-white/10 bg-[#161820]/95 px-3 py-1.5 text-xs text-white/80 shadow-[0_10px_30px_rgb(0_0_0/0.35)]">
        {snapItems.map((item) => (
          <label key={item.label} className="flex items-center gap-1 whitespace-nowrap">
            <input
              type="checkbox"
              checked={item.checked}
              onChange={item.onChange}
              className="size-3 accent-[#4d7cff]"
            />
            {item.label}
          </label>
        ))}
      </div>
      <div className="pointer-events-none absolute bottom-4 left-4 rounded-md border border-white/10 bg-black/35 px-3 py-2 text-xs text-white/70">
        STEP / nodes / camera ready · grid {snap.grid} · {stepMessage}
      </div>
    </section>
  );
}
