import type { CheerioAPI } from 'cheerio';

export function extractFromJsonLd($: CheerioAPI): string | null {
  let content = '';

  const jsonLdScripts = $('script[type="application/ld+json"]');
  jsonLdScripts.each((_, element) => {
    try {
      const data = JSON.parse($(element).text() || '{}');
      const nodes = Array.isArray(data)
        ? data
        : Array.isArray(data?.['@graph'])
          ? data['@graph']
          : [data];

      for (const node of nodes) {
        if (node && typeof node === 'object') {
          const record = node as Record<string, unknown>;
          const candidate = record['articleBody'] ?? record['description'];
          if (typeof candidate === 'string' && candidate.trim().length > 0) {
            content = candidate;
            return false;
          }
        }
      }
    } catch {
      // JSON parse error ignored
    }
  });

  return content || null;
}
