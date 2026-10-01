import { render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { QueryProvider } from '@/app/providers/query-provider';
import { SourceArticleSections } from '@/app/sources/[id]/_components/source-article-sections';
import { createMockArticleWithRelations } from '@/test/utils/mock-factories';

/**
 * ソース詳細の記事一覧のお気に入り状態（issue #653）
 *
 * カードごとの GET /api/favorites/{id} をやめ、POST /api/favorites/batch 1 回に
 * まとめる。バッチが失敗したらカード側の個別取得に戻す（未取得を「未登録」と
 * 表示しない）。
 */

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn() }),
  usePathname: () => '/sources/source-1',
  useSearchParams: () => new URLSearchParams(),
}));

jest.mock('@/lib/auth/auth-client', () => ({
  authClient: {
    useSession: () => ({ data: { user: { id: 'user-1' } }, isPending: false }),
    signIn: { email: jest.fn(), social: jest.fn() },
    signOut: jest.fn(),
    signUp: { email: jest.fn() },
  },
}));

jest.mock('@/app/components/common/optimized-image', () => {
  const MockImage = ({ src, alt }: { src: string; alt: string }) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt={alt} />
  );
  return {
    __esModule: true,
    OptimizedImage: MockImage,
    ArticleThumbnail: MockImage,
    ProfileImage: MockImage,
  };
});

const article = (id: string) =>
  createMockArticleWithRelations({
    article: { id, title: `Article ${id}`, thumbnail: null },
  });

// 最新記事と人気記事で a2 が重複する（実際の画面でも起こる）
const recentArticles = [article('a1'), article('a2')];
const topArticles = [article('a2'), article('a3')];

const fetchMock = jest.fn();

function jsonResponse(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  };
}

function callsTo(predicate: (url: string) => boolean) {
  return fetchMock.mock.calls.filter(([url]) => predicate(String(url)));
}
const isBatch = (url: string) => url === '/api/favorites/batch';
const isSingleGet = (url: string) => /^\/api\/favorites\/a\d$/.test(url);

function renderSections() {
  return render(
    <QueryProvider>
      <SourceArticleSections
        recentArticles={recentArticles}
        topArticles={topArticles}
      />
    </QueryProvider>
  );
}

beforeEach(() => {
  fetchMock.mockReset();
  global.fetch = fetchMock;
});

describe('SourceArticleSections のお気に入り状態', () => {
  it('batch API 1 回で取得し、カードごとの GET は呼ばない', async () => {
    fetchMock.mockImplementation(async (url: string) =>
      isBatch(url)
        ? jsonResponse({ favorites: { a1: false, a2: true, a3: false } })
        : jsonResponse({})
    );

    renderSections();

    // a2 は 2 枚のカードに出る。どちらも登録済みの表示になる
    await waitFor(() =>
      expect(
        screen.getAllByRole('button', { name: 'お気に入りから削除' })
      ).toHaveLength(2)
    );
    expect(
      screen.getAllByRole('button', { name: 'お気に入りに追加' })
    ).toHaveLength(2);
    for (const button of screen.getAllByTestId('favorite-button')) {
      expect(button).toBeEnabled();
    }

    expect(callsTo(isBatch)).toHaveLength(1);
    const body = JSON.parse(String(callsTo(isBatch)[0][1].body));
    expect(body.articleIds).toEqual(['a1', 'a2', 'a3']);
    expect(callsTo(isSingleGet)).toHaveLength(0);
  });

  it('batch API が失敗したら、カードごとの GET に戻して状態を表示する', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (isBatch(url)) return jsonResponse({ error: 'Forbidden' }, 403);
      if (isSingleGet(url)) {
        return jsonResponse({ isFavorited: url.endsWith('/a3') });
      }
      return jsonResponse({});
    });

    renderSections();

    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'お気に入りから削除' })
      ).toBeEnabled()
    );
    // 4 枚のカードがそれぞれ個別に取得する（重複した a2 も各カードで取得する）
    expect(callsTo(isSingleGet)).toHaveLength(4);
    expect(callsTo(isBatch)).toHaveLength(1);
  });
});
