import Link from "next/link";

import { WorkPreview } from "@/modules/works/components/work-preview";
import type { Work } from "@/modules/works/types";

type WorkCardProps = {
  work: Work;
};

export function WorkCard({ work }: WorkCardProps) {
  return (
    <Link
      href={`/works/${work.id}`}
      className="group block break-inside-avoid rounded-lg border border-black/10 bg-white p-3 transition hover:-translate-y-0.5 hover:shadow-[0_16px_40px_rgb(23_23_23/0.12)]"
    >
      <WorkPreview
        tone={work.coverTone}
        label={work.type}
        className={work.type === "model" ? "aspect-[4/5]" : "aspect-[4/3]"}
      />
      <div className="mt-3">
        <div className="flex items-start justify-between gap-3">
          <h2 className="font-semibold leading-snug group-hover:text-[#3b6f8f]">
            {work.title}
          </h2>
          <span className="rounded bg-[#f6f2e8] px-2 py-1 text-xs font-medium capitalize text-black/60">
            {work.type}
          </span>
        </div>
        <p className="mt-1 text-sm text-black/55">{work.owner.name}</p>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {work.tags.map((tag) => (
            <span
              key={tag}
              className="rounded border border-black/10 px-2 py-1 text-xs text-black/55"
            >
              {tag}
            </span>
          ))}
        </div>
        <div className="mt-3 flex items-center gap-3 text-xs text-black/50">
          <span>{work.likeCount} likes</span>
          <span>{work.favoriteCount} saves</span>
          <span>{work.branchCount} branches</span>
        </div>
      </div>
    </Link>
  );
}
