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

const FIXTURES: Array<[string, string]> = [
  ['JSer.info', 'jser-info.xml'],
  ['CodeZine', 'codezine.xml'],
  ['gihyo.jp', 'gihyo-jp.xml'],
  ['Findy Engineer Lab', 'findy-engineer-lab.xml'],
];

describe('Batch 1 フィード fixture パース検証', () => {
  const parser = new Parser();

  it.each(FIXTURES)(
    '%s: 必須フィールドが取得できる',
    async (_name, file) => {
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
  );
});
