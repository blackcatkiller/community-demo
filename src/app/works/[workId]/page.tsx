import Link from "next/link";
import { notFound } from "next/navigation";

import { WorkViewer } from "@/modules/works/components/work-viewer";
import {
  getDefaultVersion,
  getWork,
  getWorkBranches,
  getWorkComments,
  getWorkVersions,
} from "@/modules/works/queries";

type WorkDetailPageProps = {
  params: Promise<{
    workId: string;
  }>;
};

export default async function WorkDetailPage({ params }: WorkDetailPageProps) {
  const { workId } = await params;
  const work = getWork(workId);

  if (!work) {
    notFound();
  }

  const defaultVersion = getDefaultVersion(work.id);
  const versions = getWorkVersions(work.id);
  const branches = getWorkBranches(work.id);
  const comments = getWorkComments(work.id);
  const currentVersion = defaultVersion ?? versions[0];

  if (!currentVersion) {
    notFound();
  }

  return (
    <main className="min-h-screen bg-[#f6f2e8] text-[#171717]">
      <header className="border-b border-black/10 bg-[#f6f2e8]">
        <nav className="mx-auto flex max-w-7xl items-center justify-between px-5 py-4">
          <Link href="/" className="text-lg font-semibold">
            Community Studio
          </Link>
          <Link
            href={`/works/${work.id}/versions/${currentVersion.id}/edit`}
            className="rounded-md bg-[#171717] px-4 py-2 text-sm font-medium text-white transition hover:bg-[#3b6f8f]"
          >
            Edit this version
          </Link>
        </nav>
      </header>

      <section className="mx-auto grid max-w-7xl gap-6 px-5 py-6 lg:grid-cols-[1fr_360px]">
        <div className="space-y-6">
          <div>
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <span className="rounded bg-white px-2 py-1 text-xs font-medium capitalize text-black/60">
                {work.type}
              </span>
              {work.tags.map((tag) => (
                <span
                  key={tag}
                  className="rounded border border-black/10 px-2 py-1 text-xs text-black/55"
                >
                  {tag}
                </span>
              ))}
            </div>
            <h1 className="text-4xl font-bold">{work.title}</h1>
            <p className="mt-3 max-w-3xl leading-7 text-black/65">
              {work.description}
            </p>
          </div>

          <WorkViewer tone={currentVersion.thumbnailTone} label={currentVersion.assetLabel} />

          <section className="rounded-lg border border-black/10 bg-white p-5">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold">Discussion</h2>
              <span className="text-sm text-black/50">
                {work.commentCount} comments
              </span>
            </div>
            <div className="space-y-3">
              {comments.map((comment) => (
                <article
                  key={comment.id}
                  className="rounded-md border border-black/10 bg-[#f6f2e8] p-4"
                >
                  <div className="flex items-center justify-between text-sm">
                    <strong>{comment.author.name}</strong>
                    <span className="text-black/45">{comment.createdAt}</span>
                  </div>
                  <p className="mt-2 text-sm leading-6 text-black/65">
                    {comment.content}
                  </p>
                </article>
              ))}
            </div>
          </section>
        </div>

        <aside className="space-y-4">
          <section className="rounded-lg border border-black/10 bg-white p-5">
            <h2 className="text-sm font-semibold uppercase tracking-[0.16em] text-black/45">
              Current version
            </h2>
            <div className="mt-3">
              <div className="text-lg font-semibold">{currentVersion.title}</div>
              <p className="mt-2 text-sm leading-6 text-black/60">
                {currentVersion.description}
              </p>
              <div className="mt-4 text-sm text-black/55">
                by {currentVersion.author.name} on {currentVersion.createdAt}
              </div>
            </div>
          </section>

          <section className="rounded-lg border border-black/10 bg-white p-5">
            <h2 className="mb-4 text-sm font-semibold uppercase tracking-[0.16em] text-black/45">
              Branches
            </h2>
            <div className="space-y-3">
              {branches.map((branch) => (
                <div
                  key={branch.id}
                  className="rounded-md border border-black/10 bg-[#f6f2e8] p-3"
                >
                  <div className="font-medium">{branch.name}</div>
                  <div className="mt-1 text-xs text-black/50">
                    head: {branch.headVersionId}
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-lg border border-black/10 bg-white p-5">
            <h2 className="mb-4 text-sm font-semibold uppercase tracking-[0.16em] text-black/45">
              Versions
            </h2>
            <div className="space-y-3">
              {versions.map((version) => (
                <Link
                  key={version.id}
                  href={`/works/${work.id}/versions/${version.id}/edit`}
                  className="block rounded-md border border-black/10 p-3 transition hover:border-[#3b6f8f] hover:bg-[#f6f2e8]"
                >
                  <div className="font-medium">{version.title}</div>
                  <div className="mt-1 text-xs text-black/50">
                    {version.id} / parent: {version.parentVersionId ?? "root"}
                  </div>
                </Link>
              ))}
            </div>
          </section>

          <section className="grid grid-cols-3 gap-2 rounded-lg border border-black/10 bg-white p-4 text-center text-sm">
            <div>
              <strong className="block">{work.likeCount}</strong>
              <span className="text-black/50">likes</span>
            </div>
            <div>
              <strong className="block">{work.favoriteCount}</strong>
              <span className="text-black/50">saves</span>
            </div>
            <div>
              <strong className="block">{work.branchCount}</strong>
              <span className="text-black/50">branches</span>
            </div>
          </section>
        </aside>
      </section>
    </main>
  );
}
