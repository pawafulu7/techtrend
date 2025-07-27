import Parser from 'rss-parser';
import { BaseFetcher, FetchResult } from './base';
import { CreateArticleInput } from '@/lib/types/article';
import { parseRSSDate } from '@/lib/utils/date';

interface AWSRSSItem {
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

export class AWSFetcher extends BaseFetcher {
  private parser: Parser<any, AWSRSSItem>;
  
  // 3つのAWSフィードを統合
  private rssUrls = [
    { url: 'https://aws.amazon.com/jp/security/security-bulletins/rss/feed/', name: 'Security' },
    { url: 'https://aws.amazon.com/about-aws/whats-new/recent/feed/', name: 'WhatsNew' },
    { url: 'https://aws.amazon.com/jp/blogs/aws/feed/', name: 'Blog' },
  ];

  constructor(source: any) {
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
        console.log(`[AWS - ${feedInfo.name}] フィードを取得中...`);
        const feed = await this.retry(() => this.parser.parseURL(feedInfo.url));
        
        if (!feed.items || feed.items.length === 0) {
          console.log(`[AWS - ${feedInfo.name}] 記事が見つかりませんでした`);
          continue;
        }

        console.log(`[AWS - ${feedInfo.name}] ${feed.items.length}件の記事を取得`);

        for (const item of feed.items) {
          try {
            if (!item.title || !item.link) continue;
            
            // 重複チェック
            if (seenUrls.has(item.link)) continue;
            seenUrls.add(item.link);

            // 既存のカテゴリにAWSタグと取得元を追加
            const tags = this.extractTags(item, feedInfo.name);
            
            // 取得元をタグとして追加
            const sourceMap: Record<string, string> = {
              'Security': 'Security Bulletins',
              'WhatsNew': "What's New",
              'Blog': 'News Blog'
            };
            const sourceTag = sourceMap[feedInfo.name];
            if (sourceTag && !tags.includes(sourceTag)) {
              tags.unshift(sourceTag);
            }
            
            tags.unshift('AWS'); // 必ずAWSタグを先頭に追加

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
        allErrors.push(new Error(`Failed to fetch AWS ${feedInfo.name} feed: ${error instanceof Error ? error.message : String(error)}`));
      }
    }

    // 日付順にソートして最新60件を返す
    allArticles.sort((a, b) => b.publishedAt.getTime() - a.publishedAt.getTime());
    const limitedArticles = allArticles.slice(0, 60);

    console.log(`[AWS] 合計 ${limitedArticles.length}件の記事を処理`);
    return { articles: limitedArticles, errors: allErrors };
  }

  private extractTags(item: AWSRSSItem, feedName: string): string[] {
    const tags: string[] = [];

    // カテゴリから抽出
    if (item.categories && item.categories.length > 0) {
      tags.push(...item.categories);
    }

    // フィード別の追加タグ
    if (feedName === 'Security') {
      tags.push('セキュリティ', 'Security');
    } else if (feedName === 'WhatsNew') {
      tags.push('新機能', 'Updates');
    } else if (feedName === 'Blog') {
      tags.push('ブログ', 'Blog');
    }

    // タイトルからサービス名を抽出
    const title = item.title || '';
    const awsServices = [
      'EC2', 'S3', 'Lambda', 'DynamoDB', 'RDS', 'CloudFormation',
      'CloudWatch', 'IAM', 'VPC', 'Route 53', 'CloudFront', 'ECS',
      'EKS', 'Fargate', 'API Gateway', 'SQS', 'SNS', 'Kinesis',
      'Redshift', 'Athena', 'EMR', 'Glue', 'SageMaker', 'Bedrock'
    ];

    for (const service of awsServices) {
      if (title.includes(service)) {
        tags.push(service);
      }
    }

    // 重複を削除
    return [...new Set(tags)];
  }
}