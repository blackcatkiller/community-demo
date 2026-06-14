type WorkPreviewProps = {
  tone: string;
  label: string;
  className?: string;
};

export function WorkPreview({ tone, label, className = "" }: WorkPreviewProps) {
  return (
    <div
      className={`relative overflow-hidden rounded-md border border-white/10 ${className}`}
      style={{ backgroundColor: tone }}
    >
      <div className="absolute inset-0 bg-[linear-gradient(135deg,rgb(0_0_0/0.18)_0%,rgb(255_255_255/0.22)_45%,rgb(0_0_0/0.18)_46%)]" />
      <div className="absolute left-4 top-4 rounded bg-black/25 px-2 py-1 text-xs font-medium text-white">
        {label}
      </div>
      <div className="absolute bottom-5 left-1/2 h-20 w-32 -translate-x-1/2 rounded-md bg-black/35 shadow-2xl" />
      <div className="absolute bottom-20 left-1/2 h-28 w-28 -translate-x-1/2 rotate-45 rounded-md border border-white/30 bg-white/20" />
    </div>
  );
}
