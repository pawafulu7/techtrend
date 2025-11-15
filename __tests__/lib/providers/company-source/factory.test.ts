import { StaticCompanySourceProvider } from '@/lib/providers/company-source/static-provider';
import { DatabaseCompanySourceProvider } from '@/lib/providers/company-source/database-provider';

describe('createCompanySourceProvider', () => {
  // Clear module cache before each test
  let createCompanySourceProvider: () => any;

  beforeEach(() => {
    jest.resetModules();
  });

  it('should return StaticCompanySourceProvider when flag is false', () => {
    // Mock feature flags to return false
    jest.doMock('@/lib/config/feature-flags', () => ({
      FEATURE_FLAGS: {
        USE_DATABASE_PROVIDER: false,
      },
    }));

    // Import factory after mocking
    const factory = require('@/lib/providers/company-source/factory');
    const provider = factory.createCompanySourceProvider();

    // Verify provider type
    expect(provider.constructor.name).toBe('StaticCompanySourceProvider');
  });

  it('should return DatabaseCompanySourceProvider when flag is true', () => {
    // Mock feature flags to return true
    jest.doMock('@/lib/config/feature-flags', () => ({
      FEATURE_FLAGS: {
        USE_DATABASE_PROVIDER: true,
      },
    }));

    // Import factory after mocking
    const factory = require('@/lib/providers/company-source/factory');
    const provider = factory.createCompanySourceProvider();

    // Verify provider type
    expect(provider.constructor.name).toBe('DatabaseCompanySourceProvider');
  });
});
