import { Source } from '@prisma/client';
import Parser from 'rss-parser';
import { BaseFetcher, FetchResult } from './base';
import { CreateArticleInput } from '@/types/models';
import { parseRSSDate } from '@/lib/utils/date';

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
  
  // SRE関連の複数のRSSフィードを統合
  private rssUrls = [
    { url: 'https://cloud.google.com/blog/products/devops-sre/rss', name: 'Google Cloud SRE' },
    { url: 'https://www.datadoghq.com/blog/rss/', name: 'Datadog' },
    { url: 'https://www.hashicorp.com/blog/feed.xml', name: 'HashiCorp' },
    { url: 'https://www.cncf.io/feed/', name: 'CNCF' },
    { url: 'https://sreweekly.com/feed/', name: 'SRE Weekly' },
    { url: 'https://grafana.com/blog/index.xml', name: 'Grafana Labs' },
  ];

  constructor(source: Source) {
    super(source);
    this.parser = new Parser({
      customFields: {
        item: [
          ['dc:creator', 'dcCreator'],
        ],
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
        console.log(`[SRE - ${feedInfo.name}] フィードを取得中...`);
        const feed = await this.retry(() => this.parser.parseURL(feedInfo.url));
        
        if (!feed.items || feed.items.length === 0) {
          console.log(`[SRE - ${feedInfo.name}] 記事が見つかりませんでした`);
          continue;
        }

        console.log(`[SRE - ${feedInfo.name}] ${feed.items.length}件の記事を取得`);

        for (const item of feed.items) {
          try {
            if (!item.title || !item.link) continue;
            
            // 重複チェック
            if (seenUrls.has(item.link)) continue;
            seenUrls.add(item.link);

            // タグを抽出（必ずSREタグと取得元を含める）
            const tags = this.extractTags(item, feedInfo.name);
            
            // 取得元をタグとして追加（スペースを除去）
            const sourceName = feedInfo.name.replace(' SRE', '').replace(' Labs', '');
            if (!tags.includes(sourceName)) {
              tags.unshift(sourceName);
            }
            
            tags.unshift('SRE'); // 必ずSREタグを先頭に追加

            const article: CreateArticleInput = {
              title: this.sanitizeText(item.title),
              url: this.normalizeUrl(item.link),
              summary: undefined, // 要約は後で日本語で生成
              content: item.content || item.contentSnippet || '',
              publishedAt: item.isoDate ? new Date(item.isoDate) :
                          item.pubDate ? parseRSSDate(item.pubDate) : new Date(),
              sourceId: this.source.id,
              tagNames: tags,
            };

            // サムネイルを抽出
            if (item.enclosure?.url && item.enclosure.type?.startsWith('image/')) {
              article.thumbnail = item.enclosure.url;
            } else if (article.content) {
              const thumbnail = this.extractThumbnail(article.content);
              if (thumbnail) {
                article.thumbnail = thumbnail;
              }
            }

            allArticles.push(article);
          } catch (error) {
            allErrors.push(new Error(`Failed to parse item: ${error instanceof Error ? error.message : String(error)}`));
          }
        }

        // レート制限対策
        await new Promise(resolve => setTimeout(resolve, 500));
      } catch (error) {
        allErrors.push(new Error(`Failed to fetch SRE ${feedInfo.name} feed: ${error instanceof Error ? error.message : String(error)}`));
      }
    }

    // 日付順にソートして最新80件を返す
    allArticles.sort((a, b) => b.publishedAt.getTime() - a.publishedAt.getTime());
    const limitedArticles = allArticles.slice(0, 80);

    console.log(`[SRE] 合計 ${limitedArticles.length}件の記事を処理`);
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
      case 'SRE Weekly':
        tags.push('Newsletter', 'Weekly');
        break;
      case 'Grafana Labs':
        tags.push('Grafana', 'Observability', '可観測性');
        break;
    }

    // タイトルからSRE関連キーワードを抽出
    const title = item.title || '';
    const sreKeywords = [
      'Kubernetes', 'k8s', 'Docker', 'Container', 'Terraform', 'Ansible',
      'Prometheus', 'Grafana', 'Monitoring', 'Observability', 'Incident',
      'Outage', 'Reliability', 'Performance', 'Scalability', 'DevOps',
      'CI/CD', 'GitOps', 'Service Mesh', 'Istio', 'Envoy', 'OpenTelemetry',
      'Chaos Engineering', 'SLO', 'SLI', 'Error Budget', 'Postmortem'
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