'use client';

import { createContext, useContext } from 'react';
import type { CompanySourceProvider } from './interface';

const CompanySourceProviderContext = createContext<CompanySourceProvider | null>(null);

export interface CompanySourceProviderBoundaryProps {
  provider: CompanySourceProvider;
  children: React.ReactNode;
}

/**
 * Company source provider boundary
 * Provides company source data to descendant components
 */
export function CompanySourceProviderBoundary({
  provider,
  children,
}: CompanySourceProviderBoundaryProps) {
  return (
    <CompanySourceProviderContext.Provider value={provider}>
      {children}
    </CompanySourceProviderContext.Provider>
  );
}

/**
 * Hook to access company source provider
 * Must be used within CompanySourceProviderBoundary
 */
export function useCompanySourceProvider(): CompanySourceProvider {
  const ctx = useContext(CompanySourceProviderContext);
  if (!ctx) {
    throw new Error(
      'useCompanySourceProvider must be used within CompanySourceProviderBoundary'
    );
  }
  return ctx;
}
