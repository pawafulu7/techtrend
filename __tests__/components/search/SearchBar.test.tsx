import React from 'react';
import { render, screen } from '@testing-library/react';

// Mock Next.js navigation
jest.mock('next/navigation', () => ({
  useRouter: jest.fn(() => ({
    push: jest.fn(),
  })),
  useSearchParams: jest.fn(() => ({
    get: jest.fn(() => null),
    toString: jest.fn(() => ''),
  })),
}));

// Mock useSearchHistory
jest.mock('@/lib/hooks/useSearchHistory', () => ({
  useSearchHistory: jest.fn(() => ({
    getSearchHistory: jest.fn(() => []),
    saveToHistory: jest.fn(),
    clearHistory: jest.fn(),
  })),
}));

// Mock useDebounce
jest.mock('@/lib/hooks/useDebounce', () => ({
  useDebounce: jest.fn((value) => value),
}));

describe('SearchBar CTA', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  test('shows AI search CTA when feature flag enabled', () => {
    // Mock feature flag as enabled
    jest.doMock('@/config/features', () => ({
      features: { aiSearch: true },
    }));

    // Import components after mock
    const { SearchBar } = require('@/app/components/search/SearchBar');

    render(<SearchBar />);

    const ctaLink = screen.getByRole('link', { name: /AI検索を試す/ });
    expect(ctaLink).toBeInTheDocument();
    expect(ctaLink).toHaveAttribute('href', '/search/agent');
  });

  test('hides AI search CTA when feature flag disabled', () => {
    // Mock feature flag as disabled
    jest.doMock('@/config/features', () => ({
      features: { aiSearch: false },
    }));

    // Import components after mock
    const { SearchBar } = require('@/app/components/search/SearchBar');

    render(<SearchBar />);

    expect(screen.queryByText('AI検索を試す')).not.toBeInTheDocument();
  });
});
