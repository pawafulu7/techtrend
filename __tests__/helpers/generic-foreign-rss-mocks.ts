/**
 * GenericForeignRssFetcher テスト共通モックヘルパー
 *
 * jest.mock('rss-parser', ...) はJestのホイスティング制約により、
 * 使用側の各テストファイルに宣言を残すこと（このヘルパーへは移動しない）。
 */
import { Source } from '@/lib/prisma-exports';
import Parser from 'rss-parser';

export const createMockSource = (overrides: Partial<Source> = {}): Source => ({
  id: 'test_source',
  name: 'Test Source',
  url: 'https://example.com',
  type: 'RSS',
  enabled: true,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

export const mockFeed = (
  MockedParser: jest.MockedClass<typeof Parser>,
  items: unknown[]
) => {
  const mockParseURL = jest.fn().mockResolvedValue({ items });
  MockedParser.mockImplementation(
    () => ({ parseURL: mockParseURL }) as unknown as Parser
  );
};
