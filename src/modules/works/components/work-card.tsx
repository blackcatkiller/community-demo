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
      className="group block break-inside-avoid rounded-lg border border-white/10 bg-white/[0.06] p-3 transition hover:-translate-y-0.5 hover:border-white/20 hover:bg-white/[0.09] hover:shadow-[0_18px_45px_rgb(0_0_0/0.28)]"
    >
      <WorkPreview
        tone={work.coverTone}
        label={work.type}
        className={work.type === "model" ? "aspect-[4/5]" : "aspect-[4/3]"}
      />
      <div className="mt-3">
        <div className="flex items-start justify-between gap-3">
          <h2 className="font-semibold leading-snug text-[#f4f1e8] group-hover:text-[#d8dfc8]">
            {work.title}
          </h2>
          <span className="rounded bg-white/[0.08] px-2 py-1 text-xs font-medium capitalize text-white/65">
            {work.type}
          </span>
        </div>
        <p className="mt-1 text-sm text-white/55">{work.owner.name}</p>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {work.tags.map((tag) => (
            <span
              key={tag}
              className="rounded border border-white/10 px-2 py-1 text-xs text-white/55"
            >
              {tag}
            </span>
          ))}
        </div>
        <div className="mt-3 flex items-center gap-3 text-xs text-white/45">
          <span>{work.likeCount} likes</span>
          <span>{work.favoriteCount} saves</span>
          <span>{work.branchCount} branches</span>
        </div>
      </div>
    </Link>
  );
}
