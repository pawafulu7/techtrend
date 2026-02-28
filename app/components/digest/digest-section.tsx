import type { DigestSection as DigestSectionType } from '@/lib/services/digest-service';
import { DigestArticleCard } from './digest-article-card';

interface DigestSectionProps {
  section: DigestSectionType;
}

export function DigestSection({ section }: DigestSectionProps) {
  if (section.articles.length === 0) {
    return null;
  }

  return (
    <section aria-label={section.title}>
      <h2 className="text-foreground mb-3 text-base font-semibold">
        {section.title}
      </h2>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {section.articles.map((article) => (
          <DigestArticleCard key={article.articleId} article={article} />
        ))}
      </div>
    </section>
  );
}
