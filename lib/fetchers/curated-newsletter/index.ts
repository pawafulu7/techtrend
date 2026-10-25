/**
 * 分野のニュースレター（JavaScript Weekly・Postgres Weekly・SRE Weekly など）の号から、
 * 編集者が選んだ記事を1本ずつ記事として返す。
 *
 * Hacker News の取得と同じく、記事の URL と見出しだけを返し、本文は空にする。本文は保存の後に
 * enricher が記事ページから取り、取れなかった記事は号が最新の2号に入っている間、次の実行の
 * 自己修復が取り直す（scripts/scheduled/collect-feeds.ts）。紹介文を本文にすると、本文が空でなく
 * なり自己修復が動かない。100字未満の紹介文は要約もされない。
 *
 * 返す記事の順は実行ごとに無作為にする。自己修復の上限（1ソース1回5件、試した数で数える）と
 * 転送の解決の締め切りで残った記事に、次の実行で順番が回るようにするため。
 */

import Parser from 'rss-parser';
import type { Source } from '@/lib/prisma-exports';
import type { CreateArticleInput } from '@/types/models';
import type { FetchResult } from '@/types/fetchers';
import logger from '@/lib/logger';
import { BaseFetcher } from '../base';
import { SourceFormatError } from '../errors';
import { fetchFeedXml } from '../fetch-feed';
import { getCuratedNewsletterConfig, type NewsletterConfig } from './configs';
import {
  extractCooperpressIssue,
  isKnownExcludedSection,
} from './extract-cooperpress';
import { extractSreWeeklyIssue } from './extract-sre-weekly';
import {
  extractDataEngineeringWeeklyIssue,
  ISSUE_TITLE as DATA_ENGINEERING_WEEKLY_ISSUE_TITLE,
  looksLikeDataEngineeringWeeklyIssue,
} from './extract-data-engineering-weekly';
import { filterArticleUrl } from './link-filter';
import { resolveRedirectLinks } from './resolve-links';
import {
  addExcluded,
  countCandidates,
  type ExtractionResult,
  type ExtractedItem,
} from './types';

/** 読む号の数。1回の実行が失敗しても前の号を取りこぼさない */
const MAX_ISSUES = 2;
/** これより古い号は読まない（止まったニュースレターの古い号を読み続けないため） */
const MAX_POST_AGE_MS = 30 * 24 * 60 * 60 * 1000;
/** Data Engineering Weekly の著者のエッセイを1回に読む数 */
const MAX_ESSAYS = 4;
/** 1号あたりの記事の上限（実測の最大は13本。規則の誤判定で大量に入るのを止める） */
const MAX_ITEMS_PER_ISSUE = 40;
/** fetch() の開始からの締め切り。collect-feeds の FETCHER_TIMEOUT_MS（120秒）より早く返す */
const DEADLINE_MS = 100_000;
const FEED_TIMEOUT_MS = 20_000;
const RESOLVE_REQUEST_TIMEOUT_MS = 5_000;
const RESOLVE_CONCURRENCY = 3;
const RESOLVE_INTERVAL_MS = 200;

interface NewsletterItem {
  title?: string;
  link?: string;
  isoDate?: string;
  pubDate?: string;
  content?: string;
  contentEncoded?: string;
}

interface Post {
  title: string;
  link: string;
  publishedAt: Date;
  html: string;
}

interface IssueStats {
  issue: string;
  date: string;
  candidates: number;
  extracted: number;
  excluded: Record<string, number>;
  unresolved: number;
  returned: number;
}

export interface CuratedNewsletterFetcherOptions {
  /** 並べ替えの乱数（テストで差し替える） */
  random?: () => number;
  now?: () => number;
  /** fetch() の開始からの締め切り（テストで短くする）。既定 100 秒 */
  deadlineMs?: number;
}

export class CuratedNewsletterFetcher extends BaseFetcher {
  private readonly config: NewsletterConfig;
  private readonly parser: Parser<unknown, NewsletterItem>;
  private readonly random: () => number;
  private readonly now: () => number;
  private readonly deadlineMs: number;

  constructor(source: Source, options: CuratedNewsletterFetcherOptions = {}) {
    super(source);
    const config = getCuratedNewsletterConfig(source.name);
    if (!config) {
      throw new Error(
        `No curated newsletter config for source: ${source.name}`
      );
    }
    this.config = config;
    this.parser = new Parser({
      customFields: { item: [['content:encoded', 'contentEncoded']] },
    });
    this.random = options.random ?? Math.random;
    this.now = options.now ?? Date.now;
    this.deadlineMs = options.deadlineMs ?? DEADLINE_MS;
  }

  async fetch(): Promise<FetchResult> {
    const startedAt = this.now();
    const deadlineAt = startedAt + this.deadlineMs;
    const errors: Error[] = [];
    const { name } = this.config;

    let items: NewsletterItem[];
    try {
      const xml = await fetchFeedXml(this.config.feedUrl, {
        timeoutMs: Math.min(
          FEED_TIMEOUT_MS,
          Math.max(1, deadlineAt - this.now())
        ),
      });
      items = (await this.parser.parseString(xml)).items ?? [];
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        articles: [],
        errors: [new Error(`${name}: フィードの取得に失敗: ${message}`)],
      };
    }

    const { issues, essays } = this.selectPosts(items, startedAt);
    if (issues.length === 0 && essays.length === 0) {
      logger.warn(
        { source: name },
        '[CuratedNewsletter] 30日以内の号が無い（休みの可能性）'
      );
    }

    // 号から記事を取り出す
    const pending: Array<{
      item: ExtractedItem;
      issue: Post;
      stats: IssueStats;
    }> = [];
    const allStats: IssueStats[] = [];
    for (const issue of issues) {
      const result = this.extract(issue.html);
      const stats: IssueStats = {
        issue: issue.title,
        date: issue.publishedAt.toISOString(),
        candidates: countCandidates(result),
        extracted: result.items.length,
        excluded: { ...result.excluded },
        unresolved: 0,
        returned: 0,
      };
      allStats.push(stats);
      // 協賛だけが残るなどで記事が0本なら、形の変化として扱う
      if (result.items.length === 0) {
        errors.push(
          new SourceFormatError(
            `${name}: 「${issue.title}」から記事を1本も取り出せなかった（号の HTML の形が変わった可能性）`
          )
        );
      }
      const unknownSections = Object.keys(result.excluded)
        .filter((reason) => reason.startsWith('section:'))
        .map((reason) => reason.slice('section:'.length))
        .filter((section) => !isKnownExcludedSection(section));
      if (unknownSections.length > 0) {
        // 記事の欄の名前が変わったのかもしれない（一回きりの欄のこともある）
        logger.warn(
          { source: name, issue: issue.title, sections: unknownSections },
          '[CuratedNewsletter] 知らない名前の欄を除いた'
        );
      }
      result.items.forEach((item, index) => {
        if (index >= MAX_ITEMS_PER_ISSUE) {
          addExcluded(stats.excluded, 'over-limit');
          return;
        }
        pending.push({ item, issue, stats });
      });
    }
    this.shuffle(pending);

    // Cooperpress の転送 URL を記事の URL に直す
    let resolved: Map<string, string> | null = null;
    if (this.config.format === 'cooperpress' && this.config.redirectOrigin) {
      const hrefs = [...new Set(pending.map(({ item }) => item.href))];
      const outcome = await resolveRedirectLinks(hrefs, {
        redirectOrigin: this.config.redirectOrigin,
        concurrency: RESOLVE_CONCURRENCY,
        requestTimeoutMs: RESOLVE_REQUEST_TIMEOUT_MS,
        intervalMs: RESOLVE_INTERVAL_MS,
        deadlineAt,
        now: this.now,
      });
      resolved = outcome.resolved;
      if (outcome.failed > 0 || outcome.unresolved > 0) {
        // collect-feeds はエラーの message を出さないので、解決できなかったリンクをここで出す
        logger.warn(
          {
            source: name,
            hrefs: hrefs
              .filter((href) => !outcome.resolved.has(href))
              .slice(0, 20),
          },
          '[CuratedNewsletter] 転送を解決できなかったリンク'
        );
        errors.push(
          new Error(
            `${name}: 転送の解決に失敗 ${outcome.failed} 本、締め切りで未処理 ${outcome.unresolved} 本`
          )
        );
      }
    }

    const articles: CreateArticleInput[] = [];
    const seenUrls = new Set<string>();
    for (const { item, issue, stats } of pending) {
      const rawUrl = resolved ? resolved.get(item.href) : item.href;
      if (!rawUrl) {
        stats.unresolved++;
        continue;
      }
      const filtered = filterArticleUrl(rawUrl, this.config.ownHosts);
      if (!filtered.ok) {
        addExcluded(stats.excluded, filtered.reason);
        continue;
      }
      if (seenUrls.has(filtered.url)) {
        addExcluded(stats.excluded, 'duplicate-in-run');
        continue;
      }
      seenUrls.add(filtered.url);
      stats.returned++;
      articles.push(
        this.toArticle(item.title, filtered.url, issue.publishedAt)
      );
    }

    // Data Engineering Weekly の著者のエッセイは、投稿そのものを1本の記事にする（本文はフィードの全文）
    for (const essay of essays) {
      // エッセイの URL はニュースレター自身のサイトなので、自誌の除外は当てない
      const filtered = filterArticleUrl(essay.link, []);
      if (!filtered.ok) {
        logger.warn(
          { source: name, essay: essay.title, reason: filtered.reason },
          '[CuratedNewsletter] エッセイを飛ばした'
        );
        continue;
      }
      const url = filtered.url;
      if (seenUrls.has(url)) continue;
      seenUrls.add(url);
      articles.push({
        ...this.toArticle(essay.title, url, essay.publishedAt),
        content: essay.html,
      });
    }

    for (const stats of allStats) {
      logger.info(
        { source: name, ...stats },
        '[CuratedNewsletter] 号ごとの件数'
      );
    }
    if (essays.length > 0) {
      logger.info(
        { source: name, essays: essays.length },
        '[CuratedNewsletter] エッセイ'
      );
    }

    return { articles: this.shuffle(articles), errors };
  }

  private extract(html: string): ExtractionResult {
    switch (this.config.format) {
      case 'cooperpress':
        return extractCooperpressIssue(html, this.config.name);
      case 'sre-weekly':
        return extractSreWeeklyIssue(html);
      case 'data-engineering-weekly':
        return extractDataEngineeringWeeklyIssue(html);
    }
  }

  /** 30日以内の投稿を新しい順に並べ、号を最大2つ、エッセイを最大4つ選ぶ */
  private selectPosts(
    items: NewsletterItem[],
    now: number
  ): { issues: Post[]; essays: Post[] } {
    const posts = items
      .map((item) => this.toPost(item))
      .filter(
        (post): post is Post =>
          post !== null && now - post.publishedAt.getTime() <= MAX_POST_AGE_MS
      )
      .sort((a, b) => b.publishedAt.getTime() - a.publishedAt.getTime());

    if (this.config.format !== 'data-engineering-weekly') {
      return { issues: posts.slice(0, MAX_ISSUES), essays: [] };
    }
    // 号とエッセイを先に分ける（フィードの先頭は「エッセイ→号→号」の順のことがある）。
    // タイトルの書き方が変わっても号を号として扱えるよう、記事の節の数でも判定する
    // （号を1本のエッセイとして黙って保存しないため）
    const isIssue = (post: Post) =>
      DATA_ENGINEERING_WEEKLY_ISSUE_TITLE.test(post.title) ||
      looksLikeDataEngineeringWeeklyIssue(post.html);
    return {
      issues: posts.filter(isIssue).slice(0, MAX_ISSUES),
      essays: posts.filter((post) => !isIssue(post)).slice(0, MAX_ESSAYS),
    };
  }

  private toPost(item: NewsletterItem): Post | null {
    const date = item.isoDate ?? item.pubDate;
    const publishedAt = date ? new Date(date) : null;
    const html = item.contentEncoded || item.content || '';
    if (
      !item.title ||
      !item.link ||
      !publishedAt ||
      Number.isNaN(publishedAt.getTime())
    ) {
      return null;
    }
    return { title: item.title.trim(), link: item.link, publishedAt, html };
  }

  private toArticle(
    title: string,
    url: string,
    publishedAt: Date
  ): CreateArticleInput {
    return {
      title: this.sanitizeText(title),
      url,
      summary: undefined, // 要約は後で日本語で生成
      content: undefined, // 本文は保存の後に enricher が記事ページから取る
      publishedAt,
      sourceId: this.source.id,
      tagNames: [...this.config.tags],
    };
  }

  /** Fisher–Yates で並べ替える（引数の配列を並べ替えて返す） */
  private shuffle<T>(values: T[]): T[] {
    for (let i = values.length - 1; i > 0; i--) {
      const j = Math.floor(this.random() * (i + 1));
      [values[i], values[j]] = [values[j], values[i]];
    }
    return values;
  }
}
