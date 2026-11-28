/**
 * SpeakerDeckEnricher tests
 *
 * Issue #608 (signal 伝播) のリグレッション防止:
 * externalSignal が enrich → fetchWithRetry（発表ページの HTML）と
 * fetchOEmbed (private) の両方の経路に伝播することを検証する。
 */

import { SpeakerDeckEnricher } from '../speakerdeck';

describe('SpeakerDeckEnricher - signal propagation (Issue #608)', () => {
  const targetUrl = 'https://speakerdeck.com/example/talk';
  let originalFetch: typeof global.fetch;

  const buildOEmbedPayload = () => ({
    type: 'rich',
    version: '1.0',
    title: 'Test Talk',
    author_name: 'Speaker',
    author_url: 'https://speakerdeck.com/example',
    provider_name: 'Speaker Deck',
    provider_url: 'https://speakerdeck.com',
    html: '<iframe></iframe>',
    width: 800,
    height: 600,
    ratio: 1.33,
    thumbnail_url: 'https://speakerd.s3.amazonaws.com/test.jpg',
  });

  beforeEach(() => {
    originalFetch = global.fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it('should pass composed signal to both the deck page and oEmbed fetches when externalSignal is provided', async () => {
    const controller = new AbortController();
    const signalsSeen: (AbortSignal | undefined)[] = [];

    global.fetch = jest.fn(async (_url, init?: RequestInit) => {
      signalsSeen.push(init?.signal ?? undefined);
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify(buildOEmbedPayload()),
      };
    }) as unknown as typeof global.fetch;

    const enricher = new SpeakerDeckEnricher();
    await enricher.enrich(targetUrl, controller.signal);

    // 発表ページ（JSON を返すので文字起こしが無い）→ oEmbed の順に問い合わせる
    expect(signalsSeen.length).toBe(2);
    // composeSignal は AbortSignal.any() で external + timeout を合成したものを返す
    for (const signal of signalsSeen) {
      expect(signal).toBeInstanceOf(AbortSignal);
    }
  });

  it('should abort fetchOEmbed when externalSignal is already aborted', async () => {
    const controller = new AbortController();
    controller.abort();

    global.fetch = jest.fn(async (_url, init?: RequestInit) => {
      expect(init?.signal?.aborted).toBe(true);
      throw new DOMException('aborted', 'AbortError');
    }) as unknown as typeof global.fetch;

    const enricher = new SpeakerDeckEnricher();
    const result = await enricher.enrich(targetUrl, controller.signal);

    // abort 済みの signal では、HTML の取得（fetchWithRetry）も oEmbed も問い合わせずに抜ける
    // （fetchWithValidatedRedirects が名前解決の前に throwIfAborted する。fetchWithRetry は
    //  externalSignal?.aborted ガードで再試行しない）
    expect(global.fetch).toHaveBeenCalledTimes(0);
    // 発表ページの取得が失敗 → oEmbed も abort 済 signal で失敗 → null
    expect(result).toBeNull();
  });

  it('should work without externalSignal (backward compatibility)', async () => {
    const signalsSeen: (AbortSignal | undefined)[] = [];

    global.fetch = jest.fn(async (_url, init?: RequestInit) => {
      signalsSeen.push(init?.signal ?? undefined);
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify(buildOEmbedPayload()),
      };
    }) as unknown as typeof global.fetch;

    const enricher = new SpeakerDeckEnricher();
    const result = await enricher.enrich(targetUrl);

    // signal 引数なしでも timeout signal は付与される
    expect(signalsSeen[0]).toBeInstanceOf(AbortSignal);
    expect(result).not.toBeNull();
    expect(result?.thumbnail).toBe(
      'https://speakerd.s3.amazonaws.com/test.jpg'
    );
  });
});
