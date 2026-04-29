/**
 * SpeakerDeckEnricher tests
 *
 * Issue #608 (signal 伝播) のリグレッション防止:
 * externalSignal が enrich → fetchOEmbed (private) と
 * fetchWithRetry (HTML scraping fallback / thumbnail サブ経路) の
 * 両方の経路に伝播することを検証する。
 */

import { SpeakerDeckEnricher } from '../speakerdeck';

describe('SpeakerDeckEnricher - signal propagation (Issue #608)', () => {
  const targetUrl = 'https://speakerdeck.com/example/talk';
  let originalFetch: typeof global.fetch;

  beforeEach(() => {
    originalFetch = global.fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it('should pass composed signal to fetchOEmbed fetch when externalSignal is provided', async () => {
    const controller = new AbortController();
    const signalsSeen: (AbortSignal | undefined)[] = [];

    global.fetch = jest.fn(async (_url, init?: RequestInit) => {
      signalsSeen.push(init?.signal ?? undefined);
      return {
        ok: true,
        status: 200,
        json: async () => ({
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
        }),
      };
    }) as unknown as typeof global.fetch;

    const enricher = new SpeakerDeckEnricher();
    await enricher.enrich(targetUrl, controller.signal);

    expect(signalsSeen.length).toBe(1);
    // composeSignal は AbortSignal.any() で external + timeout を合成したものを返す
    expect(signalsSeen[0]).toBeInstanceOf(AbortSignal);
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

    // oEmbed fetch + fetchWithRetry (HTML fallback) の両方が試行されることを確認
    // (fetchWithRetry は base.ts で maxRetries=3 だが、abort 済 signal の場合は
    //  externalSignal?.aborted ガードで即時 throw されるため 1 回で終了する)
    expect(global.fetch).toHaveBeenCalledTimes(2);
    // oEmbed が失敗 → HTML scraping fallback も abort 済 signal で失敗 → null
    expect(result).toBeNull();
  });

  it('should work without externalSignal (backward compatibility)', async () => {
    const signalsSeen: (AbortSignal | undefined)[] = [];

    global.fetch = jest.fn(async (_url, init?: RequestInit) => {
      signalsSeen.push(init?.signal ?? undefined);
      return {
        ok: true,
        status: 200,
        json: async () => ({
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
        }),
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
