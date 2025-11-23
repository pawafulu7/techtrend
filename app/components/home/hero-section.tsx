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
    <section className="w-full border-b border-gray-200 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-900/50">
      <div className="mx-auto w-full max-w-6xl px-4 py-4 sm:px-6 lg:px-10">
        {/* Search bar */}
        <div className="mb-3">
          <SearchBox className="w-full max-w-2xl" />
        </div>

        {/* Quick tags - horizontal scroll on mobile */}
        <div className="flex items-center gap-2 overflow-x-auto [-webkit-overflow-scrolling:touch] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {popularTags.slice(0, 7).map((tag) => (
            <Link
              key={tag.id}
              href={`/?tags=${encodeURIComponent(tag.name)}&tagMode=OR`}
              className="flex-shrink-0"
            >
              <BadgeV2 variant="outline" className="whitespace-nowrap cursor-pointer hover:bg-(--tt-color-surface-hover) transition-colors text-xs">
                #{tag.name}
              </BadgeV2>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
