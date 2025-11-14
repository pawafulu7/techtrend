/**
 * Company source provider module
 *
 * Provides an abstraction layer for company source data,
 * enabling seamless migration from static to database-backed sources.
 */

export type { CompanySource, CompanySourceProvider } from './interface';
export { StaticCompanySourceProvider } from './static-provider';
export { DatabaseCompanySourceProvider } from './database-provider';
export {
  CompanySourceProviderBoundary,
  useCompanySourceProvider,
} from './context';
export { sourceRegistry } from './source-registry';
