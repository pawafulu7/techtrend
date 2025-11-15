import { createCompanySourceProvider } from '@/lib/providers/company-source/factory';
import { StaticCompanySourceProvider } from '@/lib/providers/company-source/static-provider';
import { DatabaseCompanySourceProvider } from '@/lib/providers/company-source/database-provider';

// Mock feature flags
jest.mock('@/lib/config/feature-flags', () => ({
  FEATURE_FLAGS: {
    USE_DATABASE_PROVIDER: false,
  },
}));

describe('createCompanySourceProvider', () => {
  beforeEach(() => {
    jest.resetModules();
  });

  it('should return StaticCompanySourceProvider when flag is false', () => {
    jest.doMock('@/lib/config/feature-flags', () => ({
      FEATURE_FLAGS: {
        USE_DATABASE_PROVIDER: false,
      },
    }));

    const { createCompanySourceProvider } = require('@/lib/providers/company-source/factory');
    const provider = createCompanySourceProvider();

    expect(provider).toBeInstanceOf(StaticCompanySourceProvider);
  });

  it('should return DatabaseCompanySourceProvider when flag is true', () => {
    jest.doMock('@/lib/config/feature-flags', () => ({
      FEATURE_FLAGS: {
        USE_DATABASE_PROVIDER: true,
      },
    }));

    const { createCompanySourceProvider } = require('@/lib/providers/company-source/factory');
    const provider = createCompanySourceProvider();

    expect(provider).toBeInstanceOf(DatabaseCompanySourceProvider);
  });
});
