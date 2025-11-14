import type { CompanySource, CompanySourceProvider } from './interface';

/**
 * Database company source provider (Phase 2)
 * Returns company sources from database (SourceGroup + SourceGroupMembership)
 *
 * NOTE: This is a skeleton implementation for Phase 2.
 * Will be implemented when SourceGroup tables are added.
 */
export class DatabaseCompanySourceProvider implements CompanySourceProvider {
  async getSources(): Promise<CompanySource[]> {
    throw new Error('DatabaseCompanySourceProvider not implemented yet (Phase 2)');

    // Phase 2 implementation:
    // const sources = await prisma.source.findMany({
    //   where: {
    //     memberships: {
    //       some: {
    //         group: {
    //           type: 'company_blog'
    //         }
    //       }
    //     }
    //   },
    //   include: {
    //     memberships: {
    //       include: {
    //         group: true
    //       }
    //     }
    //   }
    // });
    //
    // return sources.map(s => ({
    //   id: s.id,
    //   name: s.name,
    //   siteUrl: s.url,
    //   isActive: s.enabled,
    //   // ... other fields
    // }));
  }

  async getSourcesByCategory(categoryId: string): Promise<CompanySource[]> {
    throw new Error('DatabaseCompanySourceProvider not implemented yet (Phase 2)');
  }
}
