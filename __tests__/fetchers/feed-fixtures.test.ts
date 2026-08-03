import fs from 'fs';
import path from 'path';
import Parser from 'rss-parser';

/**
 * Batch 1 フィード fixture パーステスト（Issue #628）
 *
 * 実フィードから採取した最小化XMLサンプルを rss-parser にかけ、
 * GenericForeignRssFetcher が依存するフィールド
 * （title / 絶対link / isoDate|pubDate / content系フォールバック）が
 * 取得できることを検証する。rss-parser 更新時の回帰検出器。
 *
 * fixture採取日: 2026-08-02
 */

// expectContent=false: CodeZine は item の description を空で配信する
// （2026-08-02 実フィードで確認、20件中全件空）。本文は保存後に
// GenericContentEnricher が補完するため、フィード段階では空を許容する。
const FIXTURES: Array<[string, string, { expectContent: boolean }]> = [
  ['JSer.info', 'jser-info.xml', { expectContent: true }],
  ['CodeZine', 'codezine.xml', { expectContent: false }],
  ['gihyo.jp', 'gihyo-jp.xml', { expectContent: true }],
  ['Findy Engineer Lab', 'findy-engineer-lab.xml', { expectContent: true }],
];

describe('Batch 1 フィード fixture パース検証', () => {
  const parser = new Parser();

  it.each(FIXTURES)(
    '%s: 必須フィールドが取得できる',
    async (_name, file, opts) => {
      const xml = fs.readFileSync(
        path.join(__dirname, '../fixtures/feeds', file),
        'utf-8'
      );
      const feed = await parser.parseString(xml);
      expect(feed.items.length).toBeGreaterThanOrEqual(1);

      for (const item of feed.items) {
        // GenericForeignRssFetcher の必須フィールド（title / link）
        expect(item.title).toBeTruthy();
        // 文字化け（UTF-8デコード失敗時の置換文字）がないこと
        expect(item.title).not.toContain('�');
        expect(item.link).toMatch(/^https?:\/\//);

        // 日付: isoDate 優先、pubDate フォールバック（欠落時は現在時刻になる仕様）
        const dateSource = item.isoDate || item.pubDate;
        expect(dateSource).toBeTruthy();
        expect(Number.isNaN(new Date(dateSource as string).getTime())).toBe(
          false
        );

        // content系 5段階フォールバックのいずれかが存在すること
        // （expectContent=false のソースは空配信のためスキップ）
        if (opts.expectContent) {
          const record = item as Record<string, unknown>;
          const content =
            record['content:encoded'] ||
            item.content ||
            item.contentSnippet ||
            record['description'] ||
            item.summary;
          expect(content).toBeTruthy();
        }
      }
    }
  );
});

/**
 * Batch 2 フィード fixture パーステスト（Issue #628, Lobsters / Techmeme）
 *
 * Lobsters / Techmeme は description の中身に強く依存する品質対処
 * （ignoreFeedContent / skipEnrichment, plan_20260802_221749 §4.1）を
 * 実施しているため、rss-parser が description をどう解釈するかという
 * 「事実」自体を固定し、rss-parser 更新時の前提崩れを検知する。
 *
 * fixture採取日: 2026-08-02
 */
describe('Batch 2 フィード fixture パース検証', () => {
  const parser = new Parser();

  it('Lobsters: descriptionがCommentsリンクのみで、content/contentSnippetへ変換される', async () => {
    const xml = fs.readFileSync(
      path.join(__dirname, '../fixtures/feeds/lobsters.xml'),
      'utf-8'
    );
    const feed = await parser.parseString(xml);
    expect(feed.items.length).toBe(1);

    const item = feed.items[0];
    expect(item.title).toBe('Some article title');
    // Lobsters の link は外部記事の生URL（www・末尾スラッシュ付きのまま）
    expect(item.link).toBe('https://www.example.com/blog/Some-Article/');

    // description はHTMLのまま content に、タグ除去済みテキストが
    // contentSnippet に入る（rss-parser の仕様）。
    // ignoreFeedContent はこの「Commentsのみ」という中身を前提に空文字化する。
    expect(item.content).toBe(
      '<p><a href="https://lobste.rs/s/abc123/some_article_title">Comments</a></p>'
    );
    expect(item.contentSnippet).toBe('Comments');
  });

  it('Techmeme: CDATA descriptionのIMG/Aタグ、アンカー付きlinkが期待通りに解釈される', async () => {
    const xml = fs.readFileSync(
      path.join(__dirname, '../fixtures/feeds/techmeme.xml'),
      'utf-8'
    );
    const feed = await parser.parseString(xml);
    expect(feed.items.length).toBe(1);

    const item = feed.items[0];
    expect(item.title).toBe('Some Headline About AI');
    // Techmeme の link は自サイトのリバーページ・パーマリンク（#アンカー付き）
    expect(item.link).toBe('https://www.techmeme.com/260802/p6#a260802p6');

    // content にはIMG/Aタグを含むHTMLがそのまま残る
    expect(item.content).toContain('<img src="https://example.com/thumb.jpg"');
    expect(item.content).toContain('<a href="https://example.com/story-page">');

    // contentSnippet はタグ除去済みの見出しテキスト（skipEnrichment時の本文の元になる）
    expect(item.contentSnippet).toContain(
      'Company announces new AI product with expanded capabilities'
    );
    expect(item.contentSnippet).not.toContain('<img');
    expect(item.contentSnippet).not.toContain('<a href');
  });
});

/**
 * Batch 3 フィード fixture パーステスト（Issue #628, 海外企業・プロダクトブログ）
 *
 * Batch 3 の設定判断は rss-parser のパース結果に強く依存する:
 * - Vercel の urlPathFilter: link が絶対URLで /blog/ と /changelog/ が混在する
 * - VS Code の categoryFilter: Atom category が { $: { term } } 形状で得られる
 * - TypeScript / Fly.io の useNormalizedUrl 無効: link が末尾スラッシュ付きで、
 *   既存の Hacker News / はてなブックマーク経由レコードと同形式である
 *
 * これらの「事実」を固定し、rss-parser 更新時の前提崩れを検知する。
 *
 * fixture採取日: 2026-08-03
 */
describe('Batch 3 フィード fixture パース検証', () => {
  // GenericForeignRssFetcher と同じ customFields を与える
  // （Atom category を配列として保持するために必要）
  const parser = new Parser({
    customFields: {
      item: [['category', 'category', { keepArray: true }]],
    },
  });

  const parseFixture = async (file: string) => {
    const xml = fs.readFileSync(
      path.join(__dirname, '../fixtures/feeds', file),
      'utf-8'
    );
    return parser.parseString(xml);
  };

  it('Vercel Blog: xhtml contentが文字列化され、/blog/と/changelog/が絶対URLで混在する', async () => {
    const feed = await parseFixture('vercel-blog.xml');
    expect(feed.items.length).toBe(3);

    const links = feed.items.map((i) => i.link);
    // urlPathFilter の前提: link は絶対URL（相対解決に依存しない）
    expect(links.every((l) => l?.startsWith('https://vercel.com/'))).toBe(true);
    // フィードに blog 以外のパスが混在する（フィルタが必要な理由）
    expect(links).toContain('https://vercel.com/blog/example-blog-post');
    expect(links).toContain(
      'https://vercel.com/changelog/example-changelog-entry'
    );
    expect(links).toContain('https://vercel.com/kb/bulletin/example-bulletin');

    // Atom の <content type="xhtml"> は入れ子divを含むが文字列として得られる
    // （オブジェクトで返るとsanitizeTextが機能しないため、型を固定する）
    const blogItem = feed.items.find((i) => i.link?.includes('/blog/'));
    expect(typeof blogItem?.content).toBe('string');
    expect(blogItem?.contentSnippet).toContain('Blog article body');

    // categoryFilter が使えない（Atom category を持たない）ことの確認
    const record = blogItem as unknown as Record<string, unknown>;
    expect(record['category']).toBeUndefined();
    expect(blogItem?.categories).toBeUndefined();
  });

  it('VS Code Blog: Atom categoryが{ $: { term } }形状で、blog/releaseを判別できる', async () => {
    const feed = await parseFixture('vscode-blog.xml');
    expect(feed.items.length).toBe(2);

    const terms = feed.items.map((item) => {
      const record = item as unknown as Record<string, unknown>;
      const categories = record['category'] as Array<{
        $?: { term?: string };
      }>;
      return categories?.[0]?.$?.term;
    });
    // categoryFilter: ['blog'] が依存する形状
    expect(terms).toEqual(['release', 'blog']);

    // link は rel なし（=alternate）が採用され、rel="related" の画像URLではない
    const blogItem = feed.items.find((_, i) => terms[i] === 'blog');
    expect(blogItem?.link).toBe(
      'https://code.visualstudio.com/blogs/2026/07/29/example-post'
    );
    expect(blogItem?.link).not.toContain('/assets/');

    // 本文はリンク付き要旨のみで短い（保存後エンリッチメントに依存する根拠）
    expect(blogItem?.contentSnippet?.length).toBeLessThan(200);
  });

  it('TypeScript Blog: linkが末尾スラッシュ付きで、content:encodedに本文が入る', async () => {
    const feed = await parseFixture('typescript-blog.xml');
    expect(feed.items.length).toBe(1);

    const item = feed.items[0];
    // useNormalizedUrl を有効化しない根拠（既存レコードと同じ末尾スラッシュ付き形式）
    expect(item.link).toBe(
      'https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/'
    );
    expect(item.link?.endsWith('/')).toBe(true);

    const record = item as unknown as Record<string, unknown>;
    expect(typeof record['content:encoded']).toBe('string');
    expect(record['content:encoded'] as string).toContain('TypeScript 7');
    expect(item.categories).toEqual(['TypeScript']);
  });

  it('Dropbox Tech: 複数categoryが文字列配列で、content:encodedに本文が入る', async () => {
    const feed = await parseFixture('dropbox-tech.xml');
    expect(feed.items.length).toBe(1);

    const item = feed.items[0];
    expect(item.link).toBe(
      'https://dropbox.tech/infrastructure/example-content-processing-platform'
    );
    // 末尾スラッシュなし（useNormalizedUrl 有効化が安全な根拠）
    expect(item.link?.endsWith('/')).toBe(false);

    const record = item as unknown as Record<string, unknown>;
    expect(typeof record['content:encoded']).toBe('string');
    expect(item.categories).toEqual(['Dash', 'architecture', 'AI']);
  });

  it('Fly.io Blog: rel="alternate"のlinkが末尾スラッシュ付きで採用される', async () => {
    const feed = await parseFixture('flyio-blog.xml');
    expect(feed.items.length).toBe(1);

    const item = feed.items[0];
    // useNormalizedUrl を有効化しない根拠（既存 Hacker News レコードと同形式）
    expect(item.link).toBe('https://fly.io/blog/example-blog-post/');
    expect(item.link?.endsWith('/')).toBe(true);

    expect(typeof item.content).toBe('string');
    expect(item.contentSnippet).toContain('public cloud platform');
  });
});
