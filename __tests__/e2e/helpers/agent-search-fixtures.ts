import type { BrowserContext, Page } from '@playwright/test';
import { loginTestUser } from '../utils/e2e-helpers';

/**
 * AI 検索の e2e で共通に使うモックの応答と準備。
 * agent-search.spec.ts（692行）を3ファイルに分けたときに切り出した（Issue #700 の PR）
 */

export const MOCK_SUCCESS_RESPONSE = {
  query: 'test query',
  response: `# テスト回答

以下は、テストクエリに関する情報です:

1. **テスト記事1**
   - テスト内容1
   - 公開日: 2025年10月23日

2. **テスト記事2**
   - テスト内容2
   - 公開日: 2025年10月22日`,
  toolCalls: [
    {
      id: '1',
      name: 'semantic_search',
      input: { query: 'test', topK: 10 },
      dynamic: false,
    },
  ],
  usage: { totalTokens: 1234, promptTokens: 600, completionTokens: 634 },
  cached: false,
  fallback: false,
};

export const MOCK_CACHED_RESPONSE = {
  ...MOCK_SUCCESS_RESPONSE,
  cached: true,
};

export const MOCK_FALLBACK_RESPONSE = {
  ...MOCK_SUCCESS_RESPONSE,
  fallback: true,
};

export const MOCK_EMPTY_RESPONSE = {
  query: 'xyzabc123nonsense',
  response: '',
  toolCalls: [],
  usage: { totalTokens: 0, promptTokens: 0, completionTokens: 0 },
  cached: false,
  fallback: false,
  articles: [],
};

/** テストユーザーでログインし、クリップボードを差し替える（headless・CI でも決まった結果にする） */
export async function setupAgentSearchPage(
  page: Page,
  context: BrowserContext
): Promise<void> {
  // Login with test user to obtain real session cookies
  const loginSuccess = await loginTestUser(page);
  if (!loginSuccess) {
    throw new Error('Failed to login test user');
  }

  // Stub clipboard API for deterministic testing (works in headless/CI)
  await context.addInitScript(() => {
    const writes: string[] = [];
    Object.defineProperty(window.navigator, 'clipboard', {
      value: {
        writeText: async (text: string) => {
          writes.push(text);
          (window as any).__lastCopiedText__ = text;
          return Promise.resolve();
        },
      },
      configurable: true,
    });
  });
}
