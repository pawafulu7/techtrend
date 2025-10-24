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

describe('SearchBar CTA', () => {
  beforeEach(() => {
    jest.resetModules();
  });

  test('shows AI search CTA when feature flag enabled', () => {
    jest.mock('@/config/features', () => ({
      features: { aiSearch: true },
    }));

    const { features } = require('@/config/features');
    features.aiSearch = true;

    render(<SearchBar />);

    const ctaLink = screen.getByRole('link', { name: /AI検索を試す/ });
    expect(ctaLink).toBeInTheDocument();
    expect(ctaLink).toHaveAttribute('href', '/search/agent');
  });

  test('hides AI search CTA when feature flag disabled', () => {
    jest.mock('@/config/features', () => ({
      features: { aiSearch: false },
    }));

    const { features } = require('@/config/features');
    features.aiSearch = false;

    render(<SearchBar />);

    expect(screen.queryByText('AI検索を試す')).not.toBeInTheDocument();
  });
});
