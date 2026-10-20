/**
 * 分野のニュースレター7本と、未登録だった4ソースの登録の整合
 *
 * 登録スクリプトの定義（DB に書く name / id）・設定の辞書・createFetcher・カテゴリ・ワークフローの
 * 引数がずれると、収集されない（name の不一致）か、絞り込みに出ない（id の不一致）。登録スクリプトは
 * 手動で流すので CI では走らず、この検証が恒久の検出器になる。
 */

import fs from 'fs';
import path from 'path';
import { NEWSLETTER_SOURCES, DORMANT_SOURCES } from '@/scripts/maintenance/add-newsletter-sources';
import { CURATED_NEWSLETTER_CONFIGS, CURATED_NEWSLETTER_SOURCE_IDS } from '@/lib/fetchers/curated-newsletter/configs';
import { CuratedNewsletterFetcher } from '@/lib/fetchers/curated-newsletter';
import { createFetcher } from '@/lib/fetchers';
import { SOURCE_CATEGORIES } from '@/lib/constants/source-categories';
import { HATENA_SOURCE_ID } from '@/lib/constants/source-ids';
import { shouldTransferSource } from '@/scripts/scheduled/utils/source-transfer';
import type { Source } from '@/lib/prisma-exports';

const workflow = (name: string) =>
  fs.readFileSync(path.join(__dirname, '../../.github/workflows', name), 'utf8');

describe('ニュースレター7本の登録の整合', () => {
  it('登録スクリプトの対象が設定の辞書の7本と一致する', () => {
    expect(NEWSLETTER_SOURCES.map((s) => s.name).sort()).toEqual(Object.keys(CURATED_NEWSLETTER_CONFIGS).sort());
  });

  it.each(NEWSLETTER_SOURCES)('$name: id が設定・foreign カテゴリと一致し、1日2回の収集に入っている', (row) => {
    expect(CURATED_NEWSLETTER_CONFIGS[row.name].sourceId).toBe(row.id);
    expect(SOURCE_CATEGORIES.foreign.sourceIds).toContain(row.id);
    expect(workflow('scheduler-scraping.yml')).toContain(`"${row.name}"`);
    expect(createFetcher(row as unknown as Source)).toBeInstanceOf(CuratedNewsletterFetcher);
  });
});

describe('未登録だった4ソースの登録の整合', () => {
  it.each([
    ['DeepMind Blog', 'deepmind_blog', 'ai', 'scheduler-rss-hourly.yml'],
    ['NVIDIA Developer Blog', 'nvidia_developer_blog', 'ai', 'scheduler-rss-hourly.yml'],
    ['Anthropic News', 'anthropic_news', 'ai', 'scheduler-scraping.yml'],
    ['Rails Releases', 'rails_releases', 'foreign', 'scheduler-rss-hourly.yml'],
  ] as const)('%s: id %s が %s カテゴリにあり、%s で収集される', (name, id, category, file) => {
    const row = DORMANT_SOURCES.find((s) => s.name === name);
    expect(row?.id).toBe(id);
    expect(SOURCE_CATEGORIES[category].sourceIds).toContain(id);
    expect(workflow(file)).toContain(`"${name}"`);
    expect(() => createFetcher(row as unknown as Source)).not.toThrow();
  });

  it('Rails Releases の url はフィード（fetcher が Source.url をフィードとして読む）', () => {
    expect(DORMANT_SOURCES.find((s) => s.name === 'Rails Releases')?.url).toBe(
      'https://github.com/rails/rails/releases.atom'
    );
  });
});

describe('既存記事のソースの付け替え（はてなブックマーク・ニュースレター・リンクを集めるソース → 出し手）', () => {
  const publisher = 'github_blog_202508';

  it('はてなブックマーク経由の記事は、ふつうのソースに付け替える', () => {
    expect(shouldTransferSource(HATENA_SOURCE_ID, publisher)).toBe(true);
  });

  it.each([...CURATED_NEWSLETTER_SOURCE_IDS])('ニュースレター %s には付け替えない', (id) => {
    expect(shouldTransferSource(HATENA_SOURCE_ID, id)).toBe(false);
    expect(shouldTransferSource(publisher, id)).toBe(false);
  });

  it.each([...CURATED_NEWSLETTER_SOURCE_IDS])('ニュースレター %s が先に保存した記事は、後から取った出し手に付け替える', (id) => {
    expect(shouldTransferSource(id, publisher)).toBe(true);
  });

  it.each(['hacker_news_202508', 'lobsters', 'techmeme'])(
    'リンクを集めるソース %s へは、はてな・ニュースレター・ほかのリンクを集めるソースから付け替えない',
    (aggregator) => {
      expect(shouldTransferSource('javascript_weekly', aggregator)).toBe(false);
      expect(shouldTransferSource(HATENA_SOURCE_ID, aggregator)).toBe(false);
      expect(shouldTransferSource(publisher, aggregator)).toBe(false);
      const other = aggregator === 'lobsters' ? 'techmeme' : 'lobsters';
      expect(shouldTransferSource(other, aggregator)).toBe(false);
    }
  );

  it.each(['hacker_news_202508', 'lobsters', 'techmeme'])(
    'リンクを集めるソース %s が先に保存した記事は、後から取った出し手に付け替える（はてな・ニュースレターには付け替えない）',
    (aggregator) => {
      expect(shouldTransferSource(aggregator, publisher)).toBe(true);
      expect(shouldTransferSource(aggregator, HATENA_SOURCE_ID)).toBe(false);
      expect(shouldTransferSource(aggregator, 'javascript_weekly')).toBe(false);
    }
  );

  it('ニュースレター同士・はてなへは付け替えない。出し手同士も付け替えない', () => {
    expect(shouldTransferSource('javascript_weekly', 'node_weekly')).toBe(false);
    expect(shouldTransferSource('javascript_weekly', HATENA_SOURCE_ID)).toBe(false);
    expect(shouldTransferSource(publisher, 'cloudflare_blog_202508')).toBe(false);
  });
});
