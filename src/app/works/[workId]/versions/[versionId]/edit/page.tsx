import Link from "next/link";
import { notFound } from "next/navigation";

import { EditorShell } from "@/modules/editor/editor-shell";
import { getWork, getWorkVersion } from "@/modules/works/queries";

type EditorPageProps = {
  params: Promise<{
    workId: string;
    versionId: string;
  }>;
};

export default async function VersionEditorPage({ params }: EditorPageProps) {
  const { workId, versionId } = await params;
  const work = getWork(workId);
  const version = getWorkVersion(workId, versionId);

  if (!work || !version) {
    notFound();
  }

  return (
    <main className="h-screen overflow-hidden bg-[#111111] text-white">
      <header className="flex h-14 items-center justify-between border-b border-white/10 px-4">
        <div className="flex items-center gap-4">
          <Link href={`/works/${work.id}`} className="text-sm font-semibold">
            Community Studio
          </Link>
          <div className="hidden text-xs text-white/45 md:block">
            Editing from {version.id}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="rounded-md border border-white/10 px-3 py-2 text-xs font-medium text-white/70"
          >
            Save draft
          </button>
          <button
            type="button"
            className="rounded-md bg-[#d8dfc8] px-3 py-2 text-xs font-semibold text-[#171717]"
          >
            Submit version
          </button>
        </div>
      </header>
      <EditorShell
        workTitle={work.title}
        versionTitle={version.title}
        assetLabel={version.assetLabel}
      />
    </main>
  );
}
