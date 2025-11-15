/**
 * Company source data transfer object
 */
export interface CompanySource {
  id: string;
  name: string;
  slug?: string;
  categoryId?: string;
  priority?: number;
  logoUrl?: string;
  siteUrl?: string;
  isActive: boolean;
  metadata?: Record<string, unknown>;
}

/**
 * Company source provider interface
 * Abstracts data source (static or database) for company blog sources
 */
export interface CompanySourceProvider {
  /**
   * Get all company sources
   */
  getSources(): Promise<CompanySource[]>;

  /**
   * Get sources by category (optional)
   */
  getSourcesByCategory?(categoryId: string): Promise<CompanySource[]>;

  /**
   * Get sources by tag ID (optional, for tag-based filtering)
   */
  getSourcesByTag?(tagId: string): Promise<CompanySource[]>;
}
