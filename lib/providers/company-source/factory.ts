/**
 * Company Source Provider Factory
 *
 * Creates appropriate provider instance based on feature flags.
 */

import { FEATURE_FLAGS } from '@/lib/config/feature-flags';
import { StaticCompanySourceProvider } from './static-provider';
import { DatabaseCompanySourceProvider } from './database-provider';
import { SOURCE_CATEGORIES } from '@/lib/constants/source-categories';
import type { CompanySourceProvider } from './interface';

/**
 * Create company source provider instance
 *
 * Returns DatabaseCompanySourceProvider when USE_DATABASE_PROVIDER is true,
 * otherwise returns StaticCompanySourceProvider (legacy).
 */
export function createCompanySourceProvider(): CompanySourceProvider {
  if (FEATURE_FLAGS.USE_DATABASE_PROVIDER) {
    return new DatabaseCompanySourceProvider();
  }

  // Legacy: static provider with company category
  return new StaticCompanySourceProvider(SOURCE_CATEGORIES.company.sourceIds);
}
