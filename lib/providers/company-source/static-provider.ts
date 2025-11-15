import type { CompanySource, CompanySourceProvider } from './interface';
import { sourceRegistry } from './source-registry';

/**
 * Static company source provider (Phase 1)
 * Returns company sources from static registry
 */
export class StaticCompanySourceProvider implements CompanySourceProvider {
  constructor(private readonly sourceIds: string[]) {}

  async getSources(): Promise<CompanySource[]> {
    const results: CompanySource[] = [];

    for (const id of this.sourceIds) {
      const entry = sourceRegistry[id];
      if (!entry) {
        // Phase 2: Consider logging or throwing error for missing IDs
        if (process.env.NODE_ENV === 'development') {
          console.warn(`[StaticCompanySourceProvider] Source ID not found in registry: ${id}`);
        }
        continue;
      }

      results.push({
        id: entry.id,
        name: entry.name,
        slug: entry.slug,
        siteUrl: entry.siteUrl,
        isActive: true,
      });
    }

    return results;
  }

  async getSourcesByCategory(categoryId: string): Promise<CompanySource[]> {
    // Phase 1: All company sources belong to 'company' category
    if (categoryId === 'company') {
      return this.getSources();
    }
    return [];
  }
}
