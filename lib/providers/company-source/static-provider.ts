import type { CompanySource, CompanySourceProvider } from './interface';
import { sourceRegistry } from './source-registry';

/**
 * Static company source provider (Phase 1)
 * Returns company sources from static registry
 */
export class StaticCompanySourceProvider implements CompanySourceProvider {
  constructor(private readonly sourceIds: string[]) {}

  async getSources(): Promise<CompanySource[]> {
    return this.sourceIds
      .map((id) => {
        const entry = sourceRegistry[id];
        if (!entry) return null;

        return {
          id: entry.id,
          name: entry.name,
          slug: entry.slug,
          siteUrl: entry.siteUrl,
          isActive: true,
        } satisfies CompanySource;
      })
      .filter((source): source is CompanySource => source !== null);
  }

  async getSourcesByCategory(categoryId: string): Promise<CompanySource[]> {
    // Phase 1: All company sources belong to 'company' category
    if (categoryId === 'company') {
      return this.getSources();
    }
    return [];
  }
}
