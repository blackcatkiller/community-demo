"use client";

import type { LucideIcon } from "lucide-react";
import {
  Box,
  Boxes,
  Camera,
  Copy,
  Eye,
  EyeOff,
  FileUp,
  Grid3X3,
  MousePointer2,
  Move3D,
  RotateCcw,
  Scaling,
  Scan,
} from "lucide-react";

import { EditorViewport } from "@/modules/editor/editor-viewport";
import {
  type CameraPreset,
  type EditorTool,
  useEditorStore,
} from "@/modules/editor/editor-store";

type EditorShellProps = {
  workTitle?: string;
  versionTitle?: string;
  assetLabel?: string;
};

type ToolButtonProps = {
  icon: LucideIcon;
  isActive: boolean;
  label: string;
  onClick: () => void;
};

function ToolButton({ icon: Icon, isActive, label, onClick }: ToolButtonProps) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
      className={`grid size-10 place-items-center rounded-md border transition ${
        isActive
          ? "border-[#d8dfc8] bg-[#d8dfc8] text-[#171717]"
          : "border-white/10 bg-white/5 text-white/75 hover:bg-white/10"
      }`}
    >
      <Icon className="size-5" />
    </button>
  );
}

function PanelSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-md border border-white/10 bg-white/[0.04] p-3">
      <h3 className="mb-3 text-xs font-semibold uppercase tracking-[0.16em] text-white/45">
        {title}
      </h3>
      {children}
    </section>
  );
}

function NumberField({
  label,
  value,
  min,
  step = 1,
  onChange,
}: {
  label: string;
  value: number;
  min?: number;
  step?: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="grid grid-cols-[1fr_82px] items-center gap-2 text-xs text-white/60">
      <span>{label}</span>
      <input
        type="number"
        min={min}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="h-8 rounded border border-white/10 bg-black/30 px-2 text-right text-white outline-none focus:border-[#d8dfc8]"
      />
    </label>
  );
}

const cameraPresets: Array<{ id: CameraPreset; label: string }> = [
  { id: "iso", label: "Iso" },
  { id: "front", label: "Front" },
  { id: "right", label: "Right" },
  { id: "top", label: "Top" },
  { id: "fit", label: "Fit" },
];

export function EditorShell({
  workTitle = "Untitled work",
  versionTitle = "Draft base",
  assetLabel = "scene.glb",
}: EditorShellProps) {
  const activeTool = useEditorStore((state) => state.activeTool);
  const setActiveTool = useEditorStore((state) => state.setActiveTool);
  const selectedObjectId = useEditorStore((state) => state.selectedObjectId);
  const nodes = useEditorStore((state) => state.nodes);
  const selectedNode = nodes.find((node) => node.id === selectedObjectId);
  const cameraPreset = useEditorStore((state) => state.cameraPreset);
  const setCameraPreset = useEditorStore((state) => state.setCameraPreset);
  const selectObject = useEditorStore((state) => state.selectObject);
  const toggleNodeVisibility = useEditorStore((state) => state.toggleNodeVisibility);
  const snap = useEditorStore((state) => state.snap);
  const setSnapEnabled = useEditorStore((state) => state.setSnapEnabled);
  const toggleSnapMode = useEditorStore((state) => state.toggleSnapMode);
  const setSnapStep = useEditorStore((state) => state.setSnapStep);
  const arrayCopy = useEditorStore((state) => state.arrayCopy);
  const setArrayCopy = useEditorStore((state) => state.setArrayCopy);
  const executeArrayCopy = useEditorStore((state) => state.executeArrayCopy);
  const loadStepPlaceholder = useEditorStore((state) => state.loadStepPlaceholder);
  const nudgeSelected = useEditorStore((state) => state.nudgeSelected);
  const rotateSelected = useEditorStore((state) => state.rotateSelected);

  const renderTool = (tool: EditorTool, label: string, Icon: LucideIcon) => (
    <ToolButton
      key={tool}
      icon={Icon}
      isActive={activeTool === tool}
      label={label}
      onClick={() => setActiveTool(tool)}
    />
  );

  return (
    <div className="grid h-[calc(100vh-3.5rem)] grid-cols-[280px_1fr_320px]">
      <aside className="overflow-y-auto border-r border-white/10 bg-[#181818] p-3">
        <div className="mb-4 flex gap-2">
          {renderTool("select", "Select", MousePointer2)}
          {renderTool("move", "Move", Move3D)}
          {renderTool("rotate", "Rotate", RotateCcw)}
          {renderTool("scale", "Scale", Scaling)}
        </div>

        <div className="space-y-3">
          <PanelSection title="STEP Loader">
            <button
              type="button"
              onClick={() => loadStepPlaceholder("product_D01.step")}
              className="flex w-full items-center justify-center gap-2 rounded-md bg-[#d8dfc8] px-3 py-2 text-sm font-semibold text-[#171717]"
            >
              <FileUp className="size-4" />
              Load STEP placeholder
            </button>
            <p className="mt-2 text-xs leading-5 text-white/45">
              The reference app uses OCC/Chili wasm. This keeps the workflow
              slot ready until real STEP parsing is wired.
            </p>
          </PanelSection>

          <PanelSection title="Node Tree">
            <div className="space-y-1">
              {nodes.map((node) => {
                const isSelected = node.id === selectedObjectId;
                return (
                  <div
                    key={node.id}
                    className={`grid grid-cols-[24px_1fr_28px] items-center gap-2 rounded-md px-2 py-2 text-sm ${
                      isSelected
                        ? "bg-[#d8dfc8] text-[#171717]"
                        : "bg-white/[0.04] text-white/75"
                    }`}
                  >
                    <Boxes className="size-4" />
                    <button
                      type="button"
                      onClick={() => selectObject(node.id)}
                      className="truncate text-left"
                      title={node.name}
                    >
                      {node.name}
                    </button>
                    <button
                      type="button"
                      aria-label="Toggle visibility"
                      onClick={() => toggleNodeVisibility(node.id)}
                      className="grid size-7 place-items-center rounded hover:bg-black/10"
                    >
                      {node.visible ? (
                        <Eye className="size-4" />
                      ) : (
                        <EyeOff className="size-4" />
                      )}
                    </button>
                  </div>
                );
              })}
            </div>
          </PanelSection>
        </div>
      </aside>

      <EditorViewport />

      <aside className="overflow-y-auto border-l border-white/10 bg-[#181818] p-4">
        <div className="mb-5 flex items-center gap-2">
          <Box className="size-4 text-[#d8dfc8]" />
          <h2 className="text-sm font-semibold">Workbench</h2>
        </div>

        <div className="space-y-4 text-sm">
          <PanelSection title="Document">
            <div className="space-y-2 text-white/70">
              <div className="flex justify-between gap-3">
                <span className="text-white/45">Work</span>
                <span className="truncate">{workTitle}</span>
              </div>
              <div className="flex justify-between gap-3">
                <span className="text-white/45">Base</span>
                <span className="truncate">{versionTitle}</span>
              </div>
              <div className="flex justify-between gap-3">
                <span className="text-white/45">Asset</span>
                <span className="truncate">{assetLabel}</span>
              </div>
            </div>
          </PanelSection>

          <PanelSection title="Camera">
            <div className="grid grid-cols-5 gap-1">
              {cameraPresets.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => setCameraPreset(preset.id)}
                  className={`rounded px-2 py-2 text-xs font-medium ${
                    cameraPreset === preset.id
                      ? "bg-[#d8dfc8] text-[#171717]"
                      : "bg-white/[0.06] text-white/65 hover:bg-white/10"
                  }`}
                >
                  {preset.label}
                </button>
              ))}
            </div>
            <div className="mt-2 flex items-center gap-2 text-xs text-white/45">
              <Camera className="size-3.5" />
              Orbit, fit, front/right/top presets
            </div>
          </PanelSection>

          <PanelSection title="Snap">
            <label className="mb-3 flex items-center justify-between gap-3 text-white/70">
              <span className="flex items-center gap-2">
                <Scan className="size-4" />
                Enable snapping
              </span>
              <input
                type="checkbox"
                checked={snap.enabled}
                onChange={(event) => setSnapEnabled(event.target.checked)}
              />
            </label>
            <div className="grid grid-cols-3 gap-2">
              {(["grid", "object", "vertex"] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => toggleSnapMode(mode)}
                  className={`rounded px-2 py-2 text-xs capitalize ${
                    snap[mode]
                      ? "bg-[#d8dfc8] text-[#171717]"
                      : "bg-white/[0.06] text-white/65"
                  }`}
                >
                  {mode}
                </button>
              ))}
            </div>
            <div className="mt-3">
              <NumberField
                label="Grid step"
                value={snap.step}
                min={0.05}
                step={0.05}
                onChange={setSnapStep}
              />
            </div>
          </PanelSection>

          <PanelSection title="Transform">
            <div className="mb-3 text-xs text-white/50">
              Selected: {selectedNode?.name ?? "None"}
            </div>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => nudgeSelected(0, snap.step)}
                className="rounded bg-white/[0.06] px-2 py-2 text-xs text-white/70"
              >
                +X
              </button>
              <button
                type="button"
                onClick={() => nudgeSelected(1, snap.step)}
                className="rounded bg-white/[0.06] px-2 py-2 text-xs text-white/70"
              >
                +Y
              </button>
              <button
                type="button"
                onClick={() => nudgeSelected(2, snap.step)}
                className="rounded bg-white/[0.06] px-2 py-2 text-xs text-white/70"
              >
                +Z
              </button>
              <button
                type="button"
                onClick={() => rotateSelected(0, Math.PI / 12)}
                className="rounded bg-white/[0.06] px-2 py-2 text-xs text-white/70"
              >
                Rx
              </button>
              <button
                type="button"
                onClick={() => rotateSelected(1, Math.PI / 12)}
                className="rounded bg-white/[0.06] px-2 py-2 text-xs text-white/70"
              >
                Ry
              </button>
              <button
                type="button"
                onClick={() => rotateSelected(2, Math.PI / 12)}
                className="rounded bg-white/[0.06] px-2 py-2 text-xs text-white/70"
              >
                Rz
              </button>
            </div>
          </PanelSection>

          <PanelSection title="Array Copy">
            <div className="mb-3 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setArrayCopy({ mode: "linear" })}
                className={`rounded px-2 py-2 text-xs ${
                  arrayCopy.mode === "linear"
                    ? "bg-[#d8dfc8] text-[#171717]"
                    : "bg-white/[0.06] text-white/65"
                }`}
              >
                Linear
              </button>
              <button
                type="button"
                onClick={() => setArrayCopy({ mode: "rotation" })}
                className={`rounded px-2 py-2 text-xs ${
                  arrayCopy.mode === "rotation"
                    ? "bg-[#d8dfc8] text-[#171717]"
                    : "bg-white/[0.06] text-white/65"
                }`}
              >
                Rotation
              </button>
            </div>

            {arrayCopy.mode === "linear" ? (
              <div className="space-y-2">
                <NumberField
                  label="Count X"
                  value={arrayCopy.countX}
                  min={1}
                  onChange={(countX) => setArrayCopy({ countX })}
                />
                <NumberField
                  label="Count Y"
                  value={arrayCopy.countY}
                  min={1}
                  onChange={(countY) => setArrayCopy({ countY })}
                />
                <NumberField
                  label="Spacing X"
                  value={arrayCopy.spacingX}
                  step={0.1}
                  onChange={(spacingX) => setArrayCopy({ spacingX })}
                />
                <NumberField
                  label="Spacing Y"
                  value={arrayCopy.spacingY}
                  step={0.1}
                  onChange={(spacingY) => setArrayCopy({ spacingY })}
                />
              </div>
            ) : (
              <div className="space-y-2">
                <NumberField
                  label="Count"
                  value={arrayCopy.rotationCount}
                  min={2}
                  onChange={(rotationCount) => setArrayCopy({ rotationCount })}
                />
                <NumberField
                  label="Radius"
                  value={arrayCopy.rotationRadius}
                  min={0.1}
                  step={0.1}
                  onChange={(rotationRadius) => setArrayCopy({ rotationRadius })}
                />
              </div>
            )}

            <button
              type="button"
              onClick={executeArrayCopy}
              disabled={!selectedNode}
              className="mt-3 flex w-full items-center justify-center gap-2 rounded-md bg-[#d8dfc8] px-3 py-2 text-sm font-semibold text-[#171717] disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Copy className="size-4" />
              Execute array copy
            </button>
          </PanelSection>

          <PanelSection title="Status">
            <div className="flex items-center gap-2 text-xs text-white/60">
              <Grid3X3 className="size-4" />
              {nodes.length} nodes / tool {activeTool}
            </div>
          </PanelSection>
        </div>
      </aside>
    </div>
  );
}
