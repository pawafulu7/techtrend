import { SearchBox } from '@/app/components/common/search-box';
import { BadgeV2 } from '@/components/ui-v2';
import Link from 'next/link';

interface Tag {
  id: string;
  name: string;
  count?: number;
}

interface HeroSectionProps {
  popularTags: Tag[];
}

export function HeroSection({ popularTags }: HeroSectionProps) {
  return (
    <section
      className="relative isolate w-full overflow-hidden"
      style={{ minHeight: 'clamp(220px, 34vw, 420px)' }}
    >
      {/* Gradient background layer */}
      <div
        className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(56,189,248,0.18),transparent_35%),radial-gradient(circle_at_80%_0%,rgba(99,102,241,0.24),transparent_30%)]"
        aria-hidden="true"
      />

      {/* Glassmorphic overlay */}
      <div
        className="absolute inset-0 bg-white/75 dark:bg-slate-950/65 backdrop-blur-xl ring-1 ring-black/5"
        aria-hidden="true"
      />

      {/* Content */}
      <div className="relative mx-auto flex h-full w-full max-w-6xl flex-col items-start gap-4 px-4 py-8 sm:px-6 lg:px-10 lg:py-10">
        <p className="text-sm font-medium text-blue-600 dark:text-blue-300">
          TechTrend / 39メディア横断
        </p>

        <h1 className="text-3xl font-bold leading-tight sm:text-4xl lg:text-5xl bg-gradient-to-r from-sky-400 via-blue-500 to-indigo-500 bg-clip-text text-transparent">
          最新の技術情報を一箇所で
        </h1>

        <p className="max-w-3xl text-base text-slate-600 dark:text-slate-300">
          39の技術メディアから、あなたに最適な記事をお届けします。検索や人気タグからすぐに深掘りできます。
        </p>

        {/* Search bar */}
        <div className="w-full max-w-3xl">
          <SearchBox />
        </div>

        {/* Quick tags - horizontal scroll on mobile */}
        <div className="flex w-full items-center gap-2 overflow-x-auto pb-1 pt-1 [-webkit-overflow-scrolling:touch] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {popularTags.slice(0, 7).map((tag) => (
            <Link
              key={tag.id}
              href={`/?tags=${encodeURIComponent(tag.name)}&tagMode=OR`}
              className="flex-shrink-0"
            >
              <BadgeV2 variant="outline" className="whitespace-nowrap cursor-pointer hover:bg-(--tt-color-surface-hover) transition-colors">
                #{tag.name}
              </BadgeV2>
            </Link>
          ))}
        </div>

        {/* CTAs */}
        <div className="flex flex-wrap gap-3">
          <Link href="/?sortBy=publishedAt&sortOrder=desc">
            <button className="rounded-full bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-blue-500/25 transition hover:bg-blue-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500">
              新着記事をチェック
            </button>
          </Link>
          <Link href="/search/agent">
            <button className="rounded-full px-4 py-2 text-sm font-semibold text-blue-700 dark:text-blue-200 underline-offset-4 hover:underline">
              AIでおすすめを作成
            </button>
          </Link>
        </div>
      </div>
    </section>
  );
}
