import React from 'react';
import { render, screen } from '@testing-library/react';
import { SearchBar } from '@/app/components/search/SearchBar';

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

// Stable mock functions (prevent infinite useEffect loop)
const mockGetSearchHistory = jest.fn(() => []);
const mockSaveToHistory = jest.fn();
const mockClearHistory = jest.fn();

// Mock useSearchHistory with stable function identities
jest.mock('@/lib/hooks/useSearchHistory', () => ({
  useSearchHistory: () => ({
    getSearchHistory: mockGetSearchHistory,
    saveToHistory: mockSaveToHistory,
    clearHistory: mockClearHistory,
  }),
}));

// Mock useDebounce
jest.mock('@/lib/hooks/useDebounce', () => ({
  useDebounce: jest.fn((value) => value),
}));

// Mock feature flag
jest.mock('@/config/features', () => ({
  features: { aiSearch: true },
}));

describe('SearchBar CTA', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  test('shows AI search CTA when feature flag enabled', () => {
    render(<SearchBar />);

    const ctaLink = screen.getByRole('link', { name: /AI検索を試す/ });
    expect(ctaLink).toBeInTheDocument();
    expect(ctaLink).toHaveAttribute('href', '/search/agent');
  });
});
