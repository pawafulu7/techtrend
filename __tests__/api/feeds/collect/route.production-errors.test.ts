/**
 * /api/feeds/collect: 本番では例外の文言を応答に入れない（issue #687）
 *
 * route の import は SWC の変換で相対パスになるので、route と同じ実ファイルを相対パスで
 * 差し替える（`@/...` で jest.mock すると moduleNameMapper の置き換え先に登録され、route に届かない）。
 * 認証・レート制限は素通しにし、収集の処理（分散ロック）が例外を投げる場合だけを見る。
 */
type CollectPost = (typeof import('@/app/api/feeds/collect/route'))['POST'];

const loadPost = async (executeWithLock: jest.Mock): Promise<CollectPost> => {
  let post: CollectPost | undefined;
  await jest.isolateModulesAsync(async () => {
    jest.doMock(
      '../../../../app/api/feeds/collect/with-feed-collect-auth',
      () => ({
        withFeedCollectAuth: (handler: unknown) => handler,
        withFeedCollectTokenAuth: (handler: unknown) => handler,
      })
    );
    jest.doMock('../../../../lib/middleware/with-rate-limit', () => ({
      withRateLimit: (_key: string, handler: unknown) => handler,
    }));
    jest.doMock('../../../../lib/cache/distributed-lock', () => ({
      distributedLock: { executeWithLock },
    }));
    jest.doMock('../../../../lib/services/feed-collect-service', () => ({
      collectFeeds: jest.fn(),
    }));
    post = (await import('@/app/api/feeds/collect/route')).POST;
  });
  if (!post) throw new Error('failed to load route');
  return post;
};

const callPost = async (post: CollectPost): Promise<Response> => {
  const { NextRequest } = await import('next/server');
  const request = new NextRequest('http://localhost:3000/api/feeds/collect', {
    method: 'POST',
  });
  return (post as unknown as (req: typeof request) => Promise<Response>)(
    request
  );
};

describe('/api/feeds/collect のエラー文言（issue #687）', () => {
  const originalEnv = process.env.NODE_ENV;

  afterEach(() => {
    process.env.NODE_ENV = originalEnv;
    jest.resetModules();
  });

  const failingLock = (): jest.Mock =>
    jest
      .fn()
      .mockRejectedValue(
        new Error(
          'Invalid `prisma.article.create()` invocation: P2010 at 10.0.0.5'
        )
      );

  it('本番では、例外の文言を details に入れない', async () => {
    process.env.NODE_ENV = 'production';
    const executeWithLock = failingLock();
    const POST = await loadPost(executeWithLock);

    const response = await callPost(POST);
    const data = await response.json();

    // 差し替えた処理の例外が route に届いたことを確かめる
    expect(executeWithLock).toHaveBeenCalledTimes(1);
    expect(response.status).toBe(500);
    expect(data.error).toBe('Failed to collect feeds');
    expect(data.details).toBeUndefined();
    expect(JSON.stringify(data)).not.toContain('10.0.0.5');
  });

  it('本番以外では、調査のために文言を返す', async () => {
    process.env.NODE_ENV = 'development';
    const executeWithLock = failingLock();
    const POST = await loadPost(executeWithLock);

    const data = await (await callPost(POST)).json();

    expect(executeWithLock).toHaveBeenCalledTimes(1);
    expect(data.details).toContain('P2010');
  });
});
