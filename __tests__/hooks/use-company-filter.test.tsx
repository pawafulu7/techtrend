import { renderHook, act, waitFor } from '@testing-library/react';
import { useCompanyFilter } from '@/lib/hooks/use-company-filter';
import type { CompanySource } from '@/lib/providers/company-source';

const mockSources: CompanySource[] = [
  { id: 'cyberagent', name: 'CyberAgent', isActive: true },
  { id: 'dena', name: 'DeNA', isActive: true },
  { id: 'layerx', name: 'LayerX', isActive: true },
  { id: 'mercari', name: 'Mercari', isActive: true },
  { id: 'repro', name: 'Repro', isActive: true },
];

describe('useCompanyFilter', () => {
  describe('initialization', () => {
    it('should initialize with provided sources and selected state', () => {
      const { result } = renderHook(() =>
        useCompanyFilter({
          sources: mockSources,
          initialSelected: ['cyberagent', 'dena'],
        })
      );

      expect(result.current.sources).toEqual(mockSources);
      expect(result.current.selected).toEqual(['cyberagent', 'dena']);
      expect(result.current.searchValue).toBe('');
    });

    it('should initialize with empty selection', () => {
      const { result } = renderHook(() =>
        useCompanyFilter({
          sources: mockSources,
          initialSelected: [],
        })
      );

      expect(result.current.selected).toEqual([]);
    });
  });

  describe('search filtering', () => {
    it('should filter sources by name (case-insensitive)', async () => {
      const { result } = renderHook(() =>
        useCompanyFilter({
          sources: mockSources,
          initialSelected: [],
        })
      );

      act(() => {
        result.current.setSearchValue('cyber');
      });

      // Wait for debounce (300ms)
      await waitFor(
        () => {
          expect(result.current.visibleSidebarSources).toHaveLength(1);
        },
        { timeout: 500 }
      );

      expect(result.current.visibleSidebarSources[0].name).toBe('CyberAgent');
    });

    it('should filter sources with partial match', async () => {
      const { result } = renderHook(() =>
        useCompanyFilter({
          sources: mockSources,
          initialSelected: [],
        })
      );

      act(() => {
        result.current.setSearchValue('re');
      });

      await waitFor(
        () => {
          expect(result.current.visibleModalSources.length).toBeGreaterThan(0);
        },
        { timeout: 500 }
      );

      const names = result.current.visibleModalSources.map((s) => s.name);
      expect(names).toContain('Repro');
    });

    it('should handle uppercase search query', async () => {
      const { result } = renderHook(() =>
        useCompanyFilter({
          sources: mockSources,
          initialSelected: [],
        })
      );

      act(() => {
        result.current.setSearchValue('LAYER');
      });

      await waitFor(
        () => {
          expect(result.current.visibleModalSources).toHaveLength(1);
        },
        { timeout: 500 }
      );

      expect(result.current.visibleModalSources[0].name).toBe('LayerX');
    });

    it('should return all sources when search is empty', () => {
      const { result } = renderHook(() =>
        useCompanyFilter({
          sources: mockSources,
          initialSelected: [],
        })
      );

      expect(result.current.visibleModalSources).toEqual(mockSources);
    });
  });

  describe('sidebar vs modal sources', () => {
    it('should limit sidebar sources to 7 items', () => {
      const manySources: CompanySource[] = Array.from({ length: 20 }, (_, i) => ({
        id: `company${i}`,
        name: `Company ${i}`,
        isActive: true,
      }));

      const { result } = renderHook(() =>
        useCompanyFilter({
          sources: manySources,
          initialSelected: [],
        })
      );

      expect(result.current.visibleSidebarSources).toHaveLength(7);
      expect(result.current.visibleModalSources).toHaveLength(20);
    });

    it('should show all filtered results in modal sources', async () => {
      const { result } = renderHook(() =>
        useCompanyFilter({
          sources: mockSources,
          initialSelected: [],
        })
      );

      act(() => {
        result.current.setSearchValue('e');
      });

      await waitFor(
        () => {
          expect(result.current.visibleModalSources.length).toBeGreaterThan(0);
        },
        { timeout: 500 }
      );

      // All sources with 'e' should be shown in modal
      const expected = mockSources.filter((s) =>
        s.name.toLowerCase().includes('e')
      );
      expect(result.current.visibleModalSources).toHaveLength(expected.length);
    });
  });

  describe('sorting', () => {
    it('should sort sources alphabetically', () => {
      const { result } = renderHook(() =>
        useCompanyFilter({
          sources: mockSources,
          initialSelected: [],
        })
      );

      const names = result.current.visibleModalSources.map((s) => s.name);
      const sortedNames = [...names].sort((a, b) => a.localeCompare(b));

      expect(names).toEqual(sortedNames);
    });

    it('should maintain sort order after filtering', async () => {
      const { result } = renderHook(() =>
        useCompanyFilter({
          sources: mockSources,
          initialSelected: [],
        })
      );

      act(() => {
        result.current.setSearchValue('e');
      });

      await waitFor(
        () => {
          expect(result.current.visibleModalSources.length).toBeGreaterThan(0);
        },
        { timeout: 500 }
      );

      const names = result.current.visibleModalSources.map((s) => s.name);
      const sortedNames = [...names].sort((a, b) => a.localeCompare(b));

      expect(names).toEqual(sortedNames);
    });
  });

  describe('selection management', () => {
    it('should toggle source selection', () => {
      const { result } = renderHook(() =>
        useCompanyFilter({
          sources: mockSources,
          initialSelected: [],
        })
      );

      act(() => {
        result.current.toggleSource('cyberagent');
      });

      expect(result.current.selected).toEqual(['cyberagent']);

      act(() => {
        result.current.toggleSource('cyberagent');
      });

      expect(result.current.selected).toEqual([]);
    });

    it('should select multiple sources', () => {
      const { result } = renderHook(() =>
        useCompanyFilter({
          sources: mockSources,
          initialSelected: [],
        })
      );

      act(() => {
        result.current.toggleSource('cyberagent');
      });
      act(() => {
        result.current.toggleSource('dena');
      });

      expect(result.current.selected).toEqual(['cyberagent', 'dena']);
    });

    it('should select all sources', () => {
      const { result } = renderHook(() =>
        useCompanyFilter({
          sources: mockSources,
          initialSelected: [],
        })
      );

      act(() => {
        result.current.selectAll();
      });

      expect(result.current.selected).toEqual(mockSources.map((s) => s.id));
    });

    it('should clear all selections', () => {
      const { result } = renderHook(() =>
        useCompanyFilter({
          sources: mockSources,
          initialSelected: ['cyberagent', 'dena'],
        })
      );

      act(() => {
        result.current.clearAll();
      });

      expect(result.current.selected).toEqual([]);
    });

    it('should allow manual selection update', () => {
      const { result } = renderHook(() =>
        useCompanyFilter({
          sources: mockSources,
          initialSelected: [],
        })
      );

      act(() => {
        result.current.setSelected(['layerx', 'mercari']);
      });

      expect(result.current.selected).toEqual(['layerx', 'mercari']);
    });
  });

  describe('callback stability', () => {
    it('should maintain callback references across re-renders', () => {
      const { result, rerender } = renderHook(
        ({ sources, initialSelected }) =>
          useCompanyFilter({ sources, initialSelected }),
        {
          initialProps: {
            sources: mockSources,
            initialSelected: [],
          },
        }
      );

      const firstToggleSource = result.current.toggleSource;
      const firstSelectAll = result.current.selectAll;
      const firstClearAll = result.current.clearAll;

      rerender({
        sources: mockSources,
        initialSelected: [],
      });

      expect(result.current.toggleSource).toBe(firstToggleSource);
      expect(result.current.selectAll).toBe(firstSelectAll);
      expect(result.current.clearAll).toBe(firstClearAll);
    });
  });

  describe('debounce behavior', () => {
    it('should debounce search value changes', async () => {
      jest.useFakeTimers();

      const { result } = renderHook(() =>
        useCompanyFilter({
          sources: mockSources,
          initialSelected: [],
        })
      );

      // Initial state: all sources visible
      expect(result.current.visibleModalSources).toHaveLength(5);

      // Rapidly change search value
      act(() => {
        result.current.setSearchValue('c');
      });
      act(() => {
        result.current.setSearchValue('cy');
      });
      act(() => {
        result.current.setSearchValue('cyb');
      });

      // Immediately after: still showing all sources (debounce not elapsed)
      expect(result.current.visibleModalSources).toHaveLength(5);

      // Fast-forward 300ms
      act(() => {
        jest.advanceTimersByTime(300);
      });

      // After debounce: filtered results
      await waitFor(() => {
        expect(result.current.visibleModalSources).toHaveLength(1);
      });
      expect(result.current.visibleModalSources[0].name).toBe('CyberAgent');

      jest.useRealTimers();
    });
  });
});
