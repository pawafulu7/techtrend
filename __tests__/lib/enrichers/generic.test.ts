import { GenericContentEnricher } from '@/lib/enrichers/generic';

describe('GenericContentEnricher - thumbnail preservation on thin content', () => {
  let enricher: GenericContentEnricher;

  beforeEach(() => {
    enricher = new GenericContentEnricher();
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should return {content: null, thumbnail} when content is thin but og:image exists', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      url: 'https://example.com/thin-with-og',
      text: async () => `
        <html>
          <head>
            <meta property="og:image" content="https://example.com/og-image.jpg" />
          </head>
          <body>
            <p>Short</p>
          </body>
        </html>
      `,
    } as Response);

    const result = await enricher.enrich('https://example.com/thin-with-og');

    expect(result).not.toBeNull();
    expect(result!.content).toBeNull();
    expect(result!.thumbnail).toBe('https://example.com/og-image.jpg');
  }, 15000);

  it('should return {content: null, thumbnail} when content is thin but twitter:image exists', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      url: 'https://example.com/thin-with-twitter',
      text: async () => `
        <html>
          <head>
            <meta name="twitter:image" content="https://example.com/twitter-image.png" />
          </head>
          <body>
            <p>Short</p>
          </body>
        </html>
      `,
    } as Response);

    const result = await enricher.enrich('https://example.com/thin-with-twitter');

    expect(result).not.toBeNull();
    expect(result!.content).toBeNull();
    expect(result!.thumbnail).toBe('https://example.com/twitter-image.png');
  }, 15000);

  it('should return null when content is thin and no og:image/twitter:image exists', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      url: 'https://example.com/thin-no-og',
      text: async () => `
        <html>
          <head><title>Thin Page</title></head>
          <body>
            <p>Short</p>
            <img src="https://example.com/some-random-image.jpg" />
          </body>
        </html>
      `,
    } as Response);

    const result = await enricher.enrich('https://example.com/thin-no-og');

    expect(result).toBeNull();
  }, 15000);

  it('should return null when content is thin and only findFirstImage fallback found an image', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      url: 'https://example.com/thin-fallback-img',
      text: async () => `
        <html>
          <head><title>Thin Page</title></head>
          <body>
            <article>
              <p>Short</p>
              <img src="https://example.com/article-image.jpg" />
            </article>
          </body>
        </html>
      `,
    } as Response);

    const result = await enricher.enrich('https://example.com/thin-fallback-img');

    expect(result).toBeNull();
  }, 15000);
});
