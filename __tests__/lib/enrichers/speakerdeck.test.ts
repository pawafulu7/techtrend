/**
 * Tests for SpeakerDeckEnricher
 *
 * 発表ページの HTML を先に取り、Transcript 欄（スライドごとの文字）があれば本文にする。
 * 無ければ oEmbed、それも無ければページのメタ情報で作る。
 * 発表ページと oEmbed の問い合わせは URL で振り分ける（HTML の取得は失敗すると再試行するため、
 * 呼び出しの順番に応答を並べると再試行が後ろの応答を消費する）
 */

import { SpeakerDeckEnricher } from '@/lib/enrichers/speakerdeck';

// Mock fetch globally
const mockFetch = jest.fn();
global.fetch = mockFetch;

// Mock logger
jest.mock('@/lib/logger', () => ({
  __esModule: true,
  default: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

type FakeResponse = {
  ok: boolean;
  status: number;
  text?: () => Promise<string>;
};

const okText = (body: string): FakeResponse => ({
  ok: true,
  status: 200,
  text: async () => body,
});

const failed = (status: number): FakeResponse => ({ ok: false, status });

/** 発表ページと oEmbed への問い合わせに、それぞれの応答（または例外）を返す */
function routeFetch(routes: {
  page: FakeResponse | Error;
  oEmbed: FakeResponse | Error;
}) {
  mockFetch.mockImplementation(async (input: unknown) => {
    const route = String(input).includes('/oembed.json')
      ? routes.oEmbed
      : routes.page;
    if (route instanceof Error) throw route;
    return route;
  });
}

const oEmbedCalls = () =>
  mockFetch.mock.calls.filter(([input]) =>
    String(input).includes('/oembed.json')
  );

const oEmbedPayload = (overrides: Record<string, unknown> = {}) =>
  JSON.stringify({
    type: 'rich',
    version: '1.0',
    title: 'Test Presentation Title',
    author_name: 'Test Author',
    author_url: 'https://speakerdeck.com/testuser',
    provider_name: 'Speaker Deck',
    provider_url: 'https://speakerdeck.com',
    thumbnail_url: 'https://speakerdeck.com/thumbnail.jpg',
    html: '<iframe></iframe>',
    width: 710,
    height: 400,
    ratio: 1.775,
    ...overrides,
  });

/** Speaker Deck の発表ページの形（Transcript 欄はスライドごとに見出しのリンクと本文が並ぶ） */
const deckPage = ({
  slides,
  description = '勉強会で発表した資料です。',
  ogImage = true,
}: {
  slides: string[];
  description?: string;
  ogImage?: boolean;
}) => `
  <!DOCTYPE html>
  <html>
  <head>
    <title>Deck Title - Speaker Deck</title>
    <meta property="og:title" content="Deck Title">
    ${ogImage ? '<meta property="og:image" content="https://files.speakerdeck.com/presentations/abc/slide_0.jpg">' : ''}
  </head>
  <body>
    <div class="deck-description text-break mb-4">
      <p>${description}</p>
    </div>
    <details class="container mb-4 transcript text-break">
      <summary><h2 class="m-0">Transcript</h2></summary>
      <div id="transcript" class="pt-3 pb-4">
        <ol>
          ${slides
            .map(
              (text, i) => `
          <li class="mb-2">
            <div class="slide-transcript">
              <h3 class="fs-6 fw-normal">
                <a title="Deck Title ${text.slice(0, 10)}..." href="https://files.speakerdeck.com/presentations/abc/slide_${i}.jpg">${text}</a>
              </h3>
            </div>
          </li>`
            )
            .join('')}
        </ol>
      </div>
    </details>
  </body>
  </html>
`;

describe('SpeakerDeckEnricher', () => {
  let enricher: SpeakerDeckEnricher;

  beforeEach(() => {
    enricher = new SpeakerDeckEnricher();
    mockFetch.mockReset();
  });

  describe('canHandle', () => {
    it('should handle speakerdeck.com URLs', () => {
      expect(
        enricher.canHandle('https://speakerdeck.com/user/presentation')
      ).toBe(true);
      expect(
        enricher.canHandle('https://speakerdeck.com/oikon48/claude-code')
      ).toBe(true);
    });

    it('should not handle non-speakerdeck URLs', () => {
      expect(enricher.canHandle('https://slideshare.net/presentation')).toBe(
        false
      );
      expect(enricher.canHandle('https://docs.google.com/presentation')).toBe(
        false
      );
      expect(enricher.canHandle('https://example.com/speakerdeck')).toBe(false);
    });
  });

  describe('enrich', () => {
    const testUrl = 'https://speakerdeck.com/testuser/test-presentation';

    it('スライドの文字起こしがあれば、タイトル・説明文・各スライドの文字を本文にする（oEmbed は問い合わせない）', async () => {
      routeFetch({
        page: okText(
          deckPage({
            slides: [
              'Deck Title 2026/11/24 発表者',
              'アジェンダ\n  背景と課題\n  計測の方法',
              '',
              'まとめ 不具合の多いファイルを数値で示す',
            ],
          })
        ),
        oEmbed: okText(oEmbedPayload()),
      });

      const result = await enricher.enrich(testUrl);

      expect(result?.content).toBe(
        [
          'Deck Title',
          '勉強会で発表した資料です。',
          'Deck Title 2026/11/24 発表者',
          'アジェンダ 背景と課題 計測の方法',
          'まとめ 不具合の多いファイルを数値で示す',
        ].join('\n\n')
      );
      expect(result?.thumbnail).toBe(
        'https://files.speakerdeck.com/presentations/abc/slide_0.jpg'
      );
      expect(oEmbedCalls()).toHaveLength(0);
    });

    it('文字起こしがあってもページに画像のメタ情報が無ければ、oEmbed のサムネイルで補う', async () => {
      routeFetch({
        page: okText(deckPage({ slides: ['本題のスライド'], ogImage: false })),
        oEmbed: okText(oEmbedPayload()),
      });

      const result = await enricher.enrich(testUrl);

      expect(result?.content).toContain('本題のスライド');
      expect(result?.thumbnail).toBe('https://speakerdeck.com/thumbnail.jpg');
      expect(oEmbedCalls()).toHaveLength(1);
    });

    it('サムネイルを補う oEmbed が取れなくても、文字起こしの本文は返す', async () => {
      routeFetch({
        page: okText(deckPage({ slides: ['本題のスライド'], ogImage: false })),
        oEmbed: failed(500),
      });

      const result = await enricher.enrich(testUrl);

      expect(result?.content).toContain('本題のスライド');
      expect(result?.thumbnail).toBeNull();
    });

    it('文字のあるスライドが無ければ oEmbed で作り、oEmbed のサムネイルを使う', async () => {
      routeFetch({
        page: okText(deckPage({ slides: ['', '   '] })),
        oEmbed: okText(oEmbedPayload()),
      });

      const result = await enricher.enrich(testUrl);

      expect(result?.content).toContain('Test Presentation Title');
      expect(result?.content).toContain('Speaker: Test Author');
      expect(result?.content).toContain('Speaker Deck');
      expect(result?.thumbnail).toBe('https://speakerdeck.com/thumbnail.jpg');
      expect(oEmbedCalls()).toHaveLength(1);
    });

    it('oEmbed にサムネイルが無ければ、発表ページの og:image を使う', async () => {
      routeFetch({
        page: okText(deckPage({ slides: [] })),
        oEmbed: okText(
          oEmbedPayload({
            title: 'Presentation Without Thumbnail',
            thumbnail_url: undefined,
          })
        ),
      });

      const result = await enricher.enrich(testUrl);

      expect(result?.content).toContain('Presentation Without Thumbnail');
      expect(result?.thumbnail).toBe(
        'https://files.speakerdeck.com/presentations/abc/slide_0.jpg'
      );
    });

    it('発表ページを取れなければ oEmbed で作る（サムネイルが無ければ null）', async () => {
      routeFetch({
        page: new Error('Network error'),
        oEmbed: okText(
          oEmbedPayload({
            title: 'Presentation Without Thumbnail',
            thumbnail_url: undefined,
          })
        ),
      });

      const result = await enricher.enrich(testUrl);

      expect(result?.content).toContain('Presentation Without Thumbnail');
      expect(result?.thumbnail).toBeNull();
    });

    it('should include slide count when available in embed HTML', async () => {
      routeFetch({
        page: okText(deckPage({ slides: [] })),
        oEmbed: okText(
          oEmbedPayload({
            title: 'Slides with Count',
            html: '<iframe data-slide-count="42"></iframe>',
          })
        ),
      });

      const result = await enricher.enrich(testUrl);

      expect(result?.content).toContain('Slides: 42');
    });

    it('文字起こしも oEmbed も無ければ、ページのメタ情報で作る', async () => {
      routeFetch({
        page: okText(`
          <!DOCTYPE html>
          <html>
          <head>
            <title>Fallback Presentation - Speaker Deck</title>
            <meta property="og:title" content="Fallback Presentation">
            <meta property="og:description" content="This is a test description for the presentation that is longer than minimum.">
            <meta property="og:image" content="https://speakerdeck.com/fallback-thumb.jpg">
          </head>
          <body>
            <article>
              <div class="deck-author"><a href="/author">Fallback Author</a></div>
            </article>
          </body>
          </html>
        `),
        oEmbed: failed(404),
      });

      const result = await enricher.enrich(testUrl);

      expect(result?.content).toContain('Fallback Presentation');
      expect(result?.content).toContain('Speaker: Fallback Author');
      expect(result?.thumbnail).toBe(
        'https://speakerdeck.com/fallback-thumb.jpg'
      );
    });

    it('メタ情報の og:description が空白だけなら meta description を使う', async () => {
      routeFetch({
        page: okText(`
          <html><head>
            <meta property="og:title" content="Meta Presentation">
            <meta property="og:description" content="   ">
            <meta name="description" content="This is the meta description for the presentation.">
          </head><body></body></html>
        `),
        oEmbed: failed(404),
      });

      const result = await enricher.enrich(testUrl);

      expect(result?.content).toContain('This is the meta description for the presentation.');
    });

    it('should return minimal content when both strategies have limited data', async () => {
      routeFetch({
        page: okText(
          '<html><head><title>Empty</title></head><body></body></html>'
        ),
        oEmbed: failed(500),
      });

      const result = await enricher.enrich(testUrl);

      // メタ情報が無くても、Platform と URL は入る
      expect(result?.content).toContain('Platform: Speaker Deck');
      expect(result?.content).toContain('URL:');
    });

    it('should handle network errors gracefully', async () => {
      mockFetch.mockRejectedValue(new Error('Network error'));

      const result = await enricher.enrich(testUrl);

      expect(result).toBeNull();
    });
  });
});
