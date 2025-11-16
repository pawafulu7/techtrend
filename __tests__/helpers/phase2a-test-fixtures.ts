/**
 * Phase 2-A Test Fixtures and Helpers
 *
 * Shared test fixtures and utilities for Phase 2-A integration tests.
 * Provides mock data, Feature Flag helpers, and Prisma/Redis mock setup.
 *
 * @see Plan: plan_20251116_103350_791_phase2a-day5-7-tests.md
 */

import type { SourceGroupPlain, GroupedSources } from '@/lib/types/source-grouping';
import type { SourceCategoryId } from '@/lib/constants/source-categories';
import { SOURCE_CATEGORIES } from '@/lib/constants/source-categories';
import type { DeepMockProxy } from 'jest-mock-extended';
import type { PrismaClient } from '@prisma/client';

/**
 * Mock SourceGroup data (Plain Object types, no Prisma dependency)
 *
 * IMPORTANT: Keep this consistent with SOURCE_CATEGORIES when categories evolve.
 * Run `validateFixtureConsistency()` to ensure alignment.
 */
export const mockSourceGroups: SourceGroupPlain[] = [
  { id: 'group_company_japan', name: '国内企業ブログ', type: 'company_blog', ordering: 1 },
  { id: 'group_company_global', name: '海外企業ブログ', type: 'company_blog', ordering: 2 },
  { id: 'group_community', name: 'コミュニティ', type: 'community', ordering: 3 },
  { id: 'group_academic', name: 'アカデミック', type: 'academic', ordering: 4 },
  { id: 'group_curated_domestic', name: '国内キュレーション', type: 'curated_domestic', ordering: 5 },
  { id: 'group_presentation', name: 'プレゼンテーション', type: 'presentation', ordering: 6 },
];

/**
 * Mock Source data (Plain Object types)
 *
 * Maps to SOURCE_CATEGORIES for data consistency.
 */
export const mockSources: Array<{
  id: string;
  name: string;
  groupId: string | null;
  _count?: { articles: number };
}> = [
  // company category -> group_company_japan
  { id: 'cyberagent_tech_blog', name: 'サイバーエージェント', groupId: 'group_company_japan', _count: { articles: 10 } },
  { id: 'mercari_tech_blog', name: 'メルカリ', groupId: 'group_company_japan', _count: { articles: 15 } },

  // foreign category -> group_company_global
  { id: 'cmdq3nww70003tegxm78oydnb', name: 'Dev.to', groupId: 'group_company_global', _count: { articles: 20 } },
  { id: 'hacker_news_202508', name: 'Hacker News', groupId: 'group_company_global', _count: { articles: 25 } },
  { id: 'github_blog_202508', name: 'GitHub Blog', groupId: 'group_company_global', _count: { articles: 18 } },

  // domestic category -> group_community + group_curated_domestic
  { id: 'cmdq440c90000tewuti7ng0un', name: 'Qiita Popular', groupId: 'group_community', _count: { articles: 30 } },
  { id: 'cmdq3nwwp0006tegxz53w9zva', name: 'Zenn', groupId: 'group_community', _count: { articles: 22 } },
  { id: 'cmdq3nww60000tegxi8ruki95', name: 'はてなブックマーク', groupId: 'group_curated_domestic', _count: { articles: 28 } },

  // presentation category -> group_presentation
  { id: 'speakerdeck_8a450c43f9418ff6', name: 'Speaker Deck', groupId: 'group_presentation', _count: { articles: 12 } },

  // ai/llm category -> group_company_global + group_academic + group_curated_domestic
  { id: 'cmfwpq7dc0000te8m6fd12f0x', name: 'OpenAI Blog', groupId: 'group_company_global', _count: { articles: 16 } },
  { id: 'cmfxa7efs0001teo0kjt70c5k', name: 'arXiv CS.AI', groupId: 'group_academic', _count: { articles: 14 } },
];

/**
 * Builder: Create a mock Source with overrides
 */
export function buildSource(overrides?: Partial<typeof mockSources[0]>): typeof mockSources[0] {
  return {
    id: 'test-source',
    name: 'Test Source',
    groupId: 'group_company_japan',
    _count: { articles: 10 },
    ...overrides,
  };
}

/**
 * Builder: Create a mock SourceGroup with overrides
 */
export function buildSourceGroup(overrides?: Partial<SourceGroupPlain>): SourceGroupPlain {
  return {
    id: 'test-group',
    name: 'Test Group',
    type: 'company_blog',
    ordering: 99,
    ...overrides,
  };
}

/**
 * Helper: Seed Prisma mock with fixture data
 *
 * Wires mockSourceGroups and mockSources into prismaMock.sourceGroup.findMany,
 * prismaMock.source.findMany, etc.
 *
 * Note: Currently uses mockResolvedValue (query arguments like where/orderBy are ignored).
 * Future consideration: If tests need argument-dependent behavior (e.g., filtering by category),
 * switch to mockImplementation to inspect args and return filtered results.
 */
export function seedPrismaWithSourceFixtures(prismaMock: DeepMockProxy<PrismaClient>): void {
  // Seed SourceGroup.findMany
  prismaMock.sourceGroup.findMany.mockResolvedValue(
    mockSourceGroups.map((g) => ({
      ...g,
      createdAt: new Date(),
      updatedAt: new Date(),
    })) as any
  );

  // Seed Source.findMany
  prismaMock.source.findMany.mockResolvedValue(
    mockSources.map((s) => ({
      ...s,
      type: 'rss',
      url: `https://example.com/${s.id}`,
      enabled: true,
      createdAt: new Date(),
      updatedAt: new Date(),
      group: s.groupId
        ? mockSourceGroups.find((g) => g.id === s.groupId)
        : null,
    })) as any
  );
}

/**
 * Helper: Mock RedisCache (in-memory map, no timers)
 *
 * Returns a simple in-memory map so SourceCache in lib/cache/source-cache.ts
 * never touches setTimeout/setInterval.
 */
export function mockRedisCache(): Map<string, any> {
  return new Map();
}

/**
 * Helper: Create in-memory CompanyProvider payload for assertions
 *
 * Produces a deterministic DB provider payload (GroupedSources[]) for tests.
 */
export function createInMemoryCompanyProvider(options?: {
  groupedSourcesOverride?: GroupedSources[];
}): GroupedSources[] {
  if (options?.groupedSourcesOverride) {
    return options.groupedSourcesOverride;
  }

  // Default: Build GroupedSources from mockSourceGroups and mockSources
  const grouped = new Map<string, Array<{ id: string; name: string }>>();

  mockSources.forEach((source) => {
    if (source.groupId) {
      const groupSources = grouped.get(source.groupId) || [];
      groupSources.push({ id: source.id, name: source.name });
      grouped.set(source.groupId, groupSources);
    }
  });

  return mockSourceGroups
    .map((group) => ({
      group,
      sources: grouped.get(group.id) || [],
    }))
    .filter((gs) => gs.sources.length > 0);
}

/**
 * Helper: Feature Flag toggle with module reset
 *
 * (1) Captures current process.env.USE_DATABASE_PROVIDER
 * (2) Sets new value
 * (3) Calls jest.resetModules() so lib/config/feature-flags.ts re-evaluates
 * (4) Runs fn (async-aware)
 * (5) Restores env and clears modules in finally
 *
 * Usage:
 *   await withFeatureFlag(true, async () => {
 *     const { getSourceIdsForPreset } = await import('@/lib/constants/source-presets');
 *     const result = getSourceIdsForPreset('company');
 *     expect(result).toBe(...);
 *   });
 *
 * Note: jest.resetModules() is called in multiple places (withFeatureFlag, cleanupPhase2ATests,
 * test beforeEach/afterEach). This redundancy is intentional for safety but could be consolidated
 * to cleanupPhase2ATests() in future refactoring for easier maintenance.
 */
export async function withFeatureFlag<T>(
  flag: boolean,
  fn: () => T | Promise<T>
): Promise<T> {
  const original = process.env.USE_DATABASE_PROVIDER;

  try {
    process.env.USE_DATABASE_PROVIDER = flag ? 'true' : 'false';
    jest.resetModules();
    return await fn();
  } finally {
    if (original === undefined) {
      delete process.env.USE_DATABASE_PROVIDER;
    } else {
      process.env.USE_DATABASE_PROVIDER = original;
    }
    jest.resetModules();
  }
}

/**
 * Helper: Make Legacy Preset Fixture (expected IDs from SOURCE_CATEGORIES)
 *
 * Derives expected source IDs from SOURCE_CATEGORIES so test failures
 * highlight exactly which group diverged.
 */
export function makeLegacyPresetFixture(presetId: string): string[] {
  const presetCategoryMap: Record<string, SourceCategoryId[]> = {
    company: ['company'],
    foreign: ['foreign'],
    domestic: ['domestic'],
    presentation: ['presentation'],
    'ai-ml': ['ai', 'llm'],
  };

  const categories = presetCategoryMap[presetId];
  if (!categories) {
    throw new Error(`Unknown preset ID: ${presetId}`);
  }

  const sourceIds = categories.flatMap((categoryId) => {
    const category = SOURCE_CATEGORIES[categoryId];
    return category ? category.sourceIds : [];
  });

  // Deduplicate
  return Array.from(new Set(sourceIds));
}

/**
 * Utility: Validate fixture consistency with SOURCE_CATEGORIES
 *
 * Throws if a fixture group/category is missing from the legacy table.
 * Run this in a test to ensure fixtures remain aligned when categories evolve.
 */
export function validateFixtureConsistency(): void {
  // Check that all mockSources have valid groupIds
  const validGroupIds = new Set(mockSourceGroups.map((g) => g.id));
  mockSources.forEach((source) => {
    if (source.groupId && !validGroupIds.has(source.groupId)) {
      throw new Error(
        `[Fixture Consistency] Source "${source.id}" has invalid groupId "${source.groupId}"`
      );
    }
  });

  // Check that all SOURCE_CATEGORIES source IDs are represented in mockSources (optional)
  const allCategorySourceIds = new Set<string>();
  Object.values(SOURCE_CATEGORIES).forEach((category) => {
    category.sourceIds.forEach((id) => allCategorySourceIds.add(id));
  });

  const mockSourceIds = new Set(mockSources.map((s) => s.id));
  const missingSourceIds = Array.from(allCategorySourceIds).filter(
    (id) => !mockSourceIds.has(id)
  );

  if (missingSourceIds.length > 0) {
    console.warn(
      `[Fixture Consistency Warning] The following SOURCE_CATEGORIES source IDs are missing from mockSources:\n` +
        missingSourceIds.join('\n')
    );
  }
}

/**
 * Test Cleanup Helper
 *
 * Call in afterEach() to reset mocks and modules.
 */
export function cleanupPhase2ATests(): void {
  jest.clearAllMocks();
  jest.resetModules();
  // Restore env (if modified)
  delete process.env.USE_DATABASE_PROVIDER;
}
