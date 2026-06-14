import Link from "next/link";

import { BrandLogo } from "@/components/brand-logo";
import { WorkCard } from "@/modules/works/components/work-card";
import { getWorks } from "@/modules/works/queries";
import type { WorkType } from "@/modules/works/types";

type HomePageProps = {
  searchParams?: Promise<{
    type?: WorkType;
  }>;
};

const tabs: Array<{ label: string; href: string; value?: WorkType }> = [
  { label: "All", href: "/" },
  { label: "Models", href: "/?type=model", value: "model" },
  { label: "Materials", href: "/?type=material", value: "material" },
];

export default async function HomePage({ searchParams }: HomePageProps) {
  const params = await searchParams;
  const activeType = params?.type;
  const works = getWorks(activeType);

  return (
    <main className="min-h-screen bg-[#0e1116] text-[#f4f1e8]">
      <header className="sticky top-0 z-20 border-b border-white/10 bg-[#0e1116]/90 backdrop-blur">
        <nav className="mx-auto flex max-w-7xl items-center justify-between px-5 py-4">
          <Link href="/" aria-label="Community Studio">
            <BrandLogo />
          </Link>
          <div className="flex items-center gap-2">
            <Link
              href="/works/chair-001/versions/chair-v3/edit"
              className="rounded-md bg-[#f4f1e8] px-4 py-2 text-sm font-medium text-[#111418] transition hover:bg-[#d8dfc8]"
            >
              Open Editor
            </Link>
          </div>
        </nav>
      </header>

      <section className="mx-auto max-w-7xl px-5 py-8">
        <div className="mb-8 grid gap-6 md:grid-cols-[1fr_360px]">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#b75b43]">
              Models, materials, branches
            </p>
            <h1 className="mt-3 max-w-3xl text-4xl font-bold leading-tight sm:text-5xl">
              Browse remixable 3D works and branch them into new versions.
            </h1>
          </div>
          <div className="rounded-lg border border-white/10 bg-white/[0.06] p-4 shadow-[0_18px_45px_rgb(0_0_0/0.25)]">
            <div className="text-sm font-semibold">Prototype scope</div>
            <p className="mt-2 text-sm leading-6 text-white/60">
              This skeleton keeps the main routes, mock data, branch model, and
              editor entry ready for the upcoming visual design pass.
            </p>
          </div>
        </div>

        <div className="mb-6 flex flex-col gap-4 border-y border-white/10 py-4 md:flex-row md:items-center md:justify-between">
          <div className="flex flex-wrap gap-2">
            {tabs.map((tab) => {
              const active = activeType === tab.value || (!activeType && !tab.value);

              return (
                <Link
                  key={tab.label}
                  href={tab.href}
                  className={`rounded-md px-4 py-2 text-sm font-medium transition ${
                    active
                      ? "bg-[#f4f1e8] text-[#111418]"
                      : "bg-white/[0.07] text-white/65 hover:bg-white/[0.12] hover:text-white"
                  }`}
                >
                  {tab.label}
                </Link>
              );
            })}
          </div>
          <div className="flex gap-2 text-sm text-white/50">
            <span>Popular</span>
            <span>/</span>
            <span>Latest</span>
            <span>/</span>
            <span>Editable</span>
          </div>
        </div>

        <section className="columns-1 gap-4 sm:columns-2 lg:columns-3 xl:columns-4">
          {works.map((work) => (
            <div key={work.id} className="mb-4">
              <WorkCard work={work} />
            </div>
          ))}
        </section>
      </section>
    </main>
  );
}
