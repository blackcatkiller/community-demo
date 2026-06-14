"use client";

import { BoxSelect, Maximize2 } from "lucide-react";
import { useEffect, useMemo, useRef } from "react";

import { ModelAIReactHost } from "@/modules/editor/modelai-react-host";
import { useModelAIHostStore } from "@/modules/editor/modelai-host-store";
import {
  ObjectSnapType,
  ObjectSnapTypeUtils,
  useEditorStore,
} from "@/modules/editor/editor-store";

export function ModelAIViewport() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const host = useMemo(() => new ModelAIReactHost(), []);
  const setHost = useModelAIHostStore((state) => state.setHost);
  const setHostNodes = useModelAIHostStore((state) => state.setNodes);
  const snap = useEditorStore((state) => state.snap);
  const setSnapEnabled = useEditorStore((state) => state.setSnapEnabled);
  const setFaceSnapEnabled = useEditorStore((state) => state.setFaceSnapEnabled);
  const setTrackingEnabled = useEditorStore((state) => state.setTrackingEnabled);
  const toggleObjectSnapType = useEditorStore((state) => state.toggleObjectSnapType);

  useEffect(() => {
    const container = containerRef.current;
    const viewport = viewportRef.current;
    if (!container || !viewport) return;

    host.mount(container, viewport);
    setHost(host);
    const unsubscribe = host.onNodeListChanged(setHostNodes);
    return () => {
      unsubscribe();
      setHost(null);
      host.dispose();
    };
  }, [host, setHost, setHostNodes]);

  useEffect(() => {
    const target = host.getSnapConfigRef();
    target.enableSnap = snap.enableSnap;
    target.enableFaceSnap = snap.enableFaceSnap;
    target.enableTracking = snap.enableTracking;
    target.snapTypes = snap.snapTypes;
  }, [host, snap]);

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
    <section ref={containerRef} className="relative min-h-0 bg-[#101214]">
      <div ref={viewportRef} className="absolute inset-0" />
      <div className="absolute left-3 top-3 z-10 flex flex-col gap-2">
        <button
          type="button"
          title="Fit content"
          aria-label="Fit content"
          onClick={() => host.fitContent()}
          className="grid size-8 place-items-center rounded border border-white/15 bg-[#171921] text-white/75 transition hover:bg-white/10 hover:text-white"
        >
          <Maximize2 className="size-4" />
        </button>
        <button
          type="button"
          title="Box select"
          aria-label="Box select"
          className="grid size-8 place-items-center rounded border border-white/15 bg-[#171921] text-white/75 transition hover:bg-white/10 hover:text-white"
        >
          <BoxSelect className="size-4" />
        </button>
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
    </section>
  );
}
