import { Source } from '@/lib/prisma-exports';
import Parser from 'rss-parser';
import { fetchFeedXml } from './fetch-feed';
import { BaseFetcher } from './base';
import { FetchResult } from '@/types/fetchers';
import { CreateArticleInput } from '@/types/models';
import { parseRSSDate } from '@/lib/utils/date';
import { extractContent } from '@/lib/utils/content/content-extractor';
import { env } from '@/lib/config/env';

interface SRERSSItem {
  title?: string;
  link?: string;
  pubDate?: string;
  isoDate?: string;
  creator?: string;
  'dc:creator'?: string;
  content?: string;
  contentSnippet?: string;
  guid?: string;
  categories?: string[];
  enclosure?: {
    url?: string;
    type?: string;
  };
}

export class SREFetcher extends BaseFetcher {
  private parser: Parser<unknown, SRERSSItem>;
  private readonly feedTimeoutMs =
    env.FETCHER_TIMEOUT_MS > 0 ? env.FETCHER_TIMEOUT_MS : 120_000;

  // SRE関連の複数のRSSフィードを統合
  // SRE Weekly は号の中の記事を1本ずつ取り込むソース（curated-newsletter）に移した。
  // ここにも残すと、号まるごとの1記事と号の中の記事が二重に入る
  // Google Cloud の SRE の製品別フィード（HTML や 500 を返す）と Datadog（404）は、一度も記事を
  // 取れていなかったので外した（2026-10 時点）
  // CNCF は専用のソース（CNCF Blog）が同じフィードを読むので外した。両方が読むと、記事がどちらに
  // 付くかが取得の順で決まる
  private rssUrls = [
    { url: 'https://www.hashicorp.com/blog/feed.xml', name: 'HashiCorp' },
    { url: 'https://grafana.com/blog/index.xml', name: 'Grafana Labs' },
  ];

  constructor(source: Source) {
    super(source);
    this.parser = new Parser({
      customFields: {
        item: [['dc:creator', 'dcCreator']],
      },
    });
  }

  async fetch(): Promise<FetchResult> {
    const allArticles: CreateArticleInput[] = [];
    const allErrors: Error[] = [];
    const seenUrls = new Set<string>();

    // 各RSSフィードから記事を取得
    for (const feedInfo of this.rssUrls) {
      try {
        const feed = await this.retry(async () =>
          this.parser.parseString(
            await fetchFeedXml(feedInfo.url, { timeoutMs: this.feedTimeoutMs })
          )
        );

        if (!feed.items || feed.items.length === 0) {
          continue;
        }

        for (const item of feed.items) {
          try {
            if (!item.title || !item.link) continue;

            // 重複チェック
            if (seenUrls.has(item.link)) continue;
            seenUrls.add(item.link);

            // タグを抽出（必ずSREタグと取得元を含める）
            const tags = this.extractTags(item, feedInfo.name);

            // 取得元をタグとして追加（スペースを除去）
            const sourceName = feedInfo.name
              .replace(' SRE', '')
              .replace(' Labs', '');
            if (!tags.includes(sourceName)) {
              tags.unshift(sourceName);
            }

            tags.unshift('SRE'); // 必ずSREタグを先頭に追加

            // コンテンツを抽出
            const content = extractContent(
              item as unknown as Record<string, unknown>
            );

            const article: CreateArticleInput = {
              title: this.sanitizeText(item.title),
              url: this.normalizeUrl(item.link),
              summary: undefined, // 要約は後で日本語で生成
              content: content || '',
              publishedAt: item.isoDate
                ? new Date(item.isoDate)
                : item.pubDate
                  ? parseRSSDate(item.pubDate)
                  : new Date(),
              sourceId: this.source.id,
              tagNames: tags,
            };

            // サムネイルを抽出
            if (
              item.enclosure?.url &&
              item.enclosure.type?.startsWith('image/')
            ) {
              article.thumbnail = item.enclosure.url;
            } else if (article.content) {
              const thumbnail = this.extractThumbnail(article.content);
              if (thumbnail) {
                article.thumbnail = thumbnail;
              }
            }

            allArticles.push(article);
          } catch (_error) {
            allErrors.push(
              new Error(
                `Failed to parse item: ${_error instanceof Error ? _error.message : String(_error)}`
              )
            );
          }
        }

        // レート制限対策
        await new Promise((resolve) => setTimeout(resolve, 500));
      } catch (_error) {
        allErrors.push(
          new Error(
            `Failed to fetch SRE ${feedInfo.name} feed: ${_error instanceof Error ? _error.message : String(_error)}`
          )
        );
      }
    }

    // 日付順にソートして最新80件を返す
    allArticles.sort(
      (a, b) => b.publishedAt.getTime() - a.publishedAt.getTime()
    );
    const limitedArticles = allArticles.slice(0, 80);

    return { articles: limitedArticles, errors: allErrors };
  }

  private extractTags(item: SRERSSItem, feedName: string): string[] {
    const tags: string[] = [];

    // カテゴリから抽出
    if (item.categories && item.categories.length > 0) {
      tags.push(...item.categories);
    }

    // フィード別の追加タグ
    switch (feedName) {
      case 'Google Cloud SRE':
        tags.push('Google Cloud', 'GCP');
        break;
      case 'Datadog':
        tags.push('Monitoring', 'Observability', 'モニタリング');
        break;
      case 'HashiCorp':
        tags.push('Infrastructure as Code', 'IaC');
        break;
      case 'CNCF':
        tags.push('Cloud Native', 'Kubernetes');
        break;
      case 'Grafana Labs':
        tags.push('Grafana', 'Observability', '可観測性');
        break;
    }

    // タイトルからSRE関連キーワードを抽出
    const title = item.title || '';
    const sreKeywords = [
      'Kubernetes',
      'k8s',
      'Docker',
      'Container',
      'Terraform',
      'Ansible',
      'Prometheus',
      'Grafana',
      'Monitoring',
      'Observability',
      'Incident',
      'Outage',
      'Reliability',
      'Performance',
      'Scalability',
      'DevOps',
      'CI/CD',
      'GitOps',
      'Service Mesh',
      'Istio',
      'Envoy',
      'OpenTelemetry',
      'Chaos Engineering',
      'SLO',
      'SLI',
      'Error Budget',
      'Postmortem',
    ];

    for (const keyword of sreKeywords) {
      if (title.toLowerCase().includes(keyword.toLowerCase())) {
        tags.push(keyword);
      }
    }

    // 重複を削除
    return [...new Set(tags)];
  }
}
