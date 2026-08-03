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
