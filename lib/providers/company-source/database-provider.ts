import { getSourceCache } from '@/lib/cache/source-cache';
import type { CompanySource, CompanySourceProvider } from './interface';

/**
 * Database company source provider (Phase 2-A)
 * Returns company sources from database using Source.groupId with Redis cache
 */
export class DatabaseCompanySourceProvider implements CompanySourceProvider {
  async getSources(): Promise<CompanySource[]> {
    const cache = getSourceCache();
    return cache.getCompanySources();
  }

  async getSourcesByCategory(categoryId: string): Promise<CompanySource[]> {
    if (!categoryId) return [];

    const cache = getSourceCache();
    return cache.getCompanySourcesByGroup(categoryId);
  }

  async getSourcesByTag(tagId: string): Promise<CompanySource[]> {
    if (!tagId) return [];

    const cache = getSourceCache();
    return cache.getCompanySourcesByTag(tagId);
  }
}
