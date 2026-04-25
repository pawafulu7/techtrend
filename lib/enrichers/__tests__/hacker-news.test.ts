/**
 * HackerNewsEnricher tests
 *
 * Issue #599 (body drain 横展開) のリグレッション防止:
 * 非OK応答時に body.cancel → genericEnricher.enrich(url) の順で呼ばれ、
 * body.cancel が reject しても generic フォールバックが維持されること。
 */

import { HackerNewsEnricher } from '../hacker-news';
import { GenericContentEnricher } from '../generic';

describe('HackerNewsEnricher - body drain on non-OK fetch (Issue #599)', () => {
  const targetUrl = 'https://github.com/foo/bar';
  let originalFetch: typeof global.fetch;

  beforeEach(() => {
    originalFetch = global.fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it('should call body.cancel before falling back to GenericEnricher on non-OK response', async () => {
    const callOrder: string[] = [];
    const cancelMock = jest.fn(async () => {
      callOrder.push('cancel');
    });

    global.fetch = jest.fn(async () => ({
      ok: false,
      status: 503,
      body: { cancel: cancelMock },
    })) as unknown as typeof global.fetch;

    const genericEnrichSpy = jest
      .spyOn(GenericContentEnricher.prototype, 'enrich')
      .mockImplementation(async () => {
        callOrder.push('generic.enrich');
        return { content: 'fallback content', thumbnail: null };
      });

    const enricher = new HackerNewsEnricher();
    const result = await enricher.enrich(targetUrl);

    expect(cancelMock).toHaveBeenCalledTimes(1);
    expect(genericEnrichSpy).toHaveBeenCalledTimes(1);
    expect(genericEnrichSpy).toHaveBeenCalledWith(targetUrl);
    expect(callOrder).toEqual(['cancel', 'generic.enrich']);
    expect(result).toEqual({ content: 'fallback content', thumbnail: null });
  });

  it('should still fall back to GenericEnricher when body.cancel rejects', async () => {
    const cancelMock = jest
      .fn<Promise<void>, []>()
      .mockRejectedValue(new Error('stream already consumed'));

    global.fetch = jest.fn(async () => ({
      ok: false,
      status: 500,
      body: { cancel: cancelMock },
    })) as unknown as typeof global.fetch;

    const genericEnrichSpy = jest
      .spyOn(GenericContentEnricher.prototype, 'enrich')
      .mockResolvedValue({ content: 'fallback content', thumbnail: null });

    const enricher = new HackerNewsEnricher();
    const result = await enricher.enrich(targetUrl);

    expect(cancelMock).toHaveBeenCalledTimes(1);
    expect(genericEnrichSpy).toHaveBeenCalledTimes(1);
    expect(genericEnrichSpy).toHaveBeenCalledWith(targetUrl);
    expect(result).toEqual({ content: 'fallback content', thumbnail: null });
  });

  it('should tolerate missing response.body (no throw, still fall back)', async () => {
    global.fetch = jest.fn(async () => ({
      ok: false,
      status: 404,
      body: null,
    })) as unknown as typeof global.fetch;

    const genericEnrichSpy = jest
      .spyOn(GenericContentEnricher.prototype, 'enrich')
      .mockResolvedValue(null);

    const enricher = new HackerNewsEnricher();
    const result = await enricher.enrich(targetUrl);

    expect(genericEnrichSpy).toHaveBeenCalledTimes(1);
    expect(result).toBeNull();
  });

  it('should drain body of repo root fetch when og:image fallback returns non-OK', async () => {
    const blobUrl = 'https://github.com/foo/bar/blob/main/README.md';
    const blobHtml = `
      <html>
        <head><meta name="description" content="ignored when readme present"></head>
        <body>
          <article itemprop="text" class="markdown-body">
            ${'<p>Long enough README body content to bypass the short-content fallback path that triggers GenericEnricher again.</p>'.repeat(5)}
          </article>
        </body>
      </html>
    `;
    const repoRootCancelMock = jest.fn(async () => {});

    global.fetch = jest
      .fn()
      .mockImplementationOnce(async () => ({
        ok: true,
        status: 200,
        text: async () => blobHtml,
      }))
      .mockImplementationOnce(async () => ({
        ok: false,
        status: 500,
        body: { cancel: repoRootCancelMock },
      })) as unknown as typeof global.fetch;

    const enricher = new HackerNewsEnricher();
    const result = await enricher.enrich(blobUrl);

    expect(global.fetch).toHaveBeenCalledTimes(2);
    expect(repoRootCancelMock).toHaveBeenCalledTimes(1);
    expect(result).not.toBeNull();
    expect(result?.content).toContain('README body content');
    expect(result?.thumbnail).toBeUndefined();
  });
});
