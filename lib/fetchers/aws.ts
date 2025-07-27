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
    const articles: CreateArticleInput[] = [];
    const errors: Error[] = [];

    try {
      console.log(`[${this.source.name}] フィードを取得中...`);
      const feed = await this.retry(() => this.parser.parseURL(this.source.url));
      
      if (!feed.items || feed.items.length === 0) {
        console.log(`[${this.source.name}] 記事が見つかりませんでした`);
        return { articles, errors };
      }

      console.log(`[${this.source.name}] ${feed.items.length}件の記事を取得`);

      // 最大30件に制限
      const limitedItems = feed.items.slice(0, 30);

      for (const item of limitedItems) {
        try {
          if (!item.title || !item.link) continue;

          // 既存のカテゴリにAWSタグを追加
          const tags = this.extractTags(item);
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

          articles.push(article);
        } catch (error) {
          errors.push(new Error(`Failed to parse item: ${error instanceof Error ? error.message : String(error)}`));
        }
      }

      console.log(`[${this.source.name}] ${articles.length}件の記事を処理`);
    } catch (error) {
      errors.push(new Error(`Failed to fetch ${this.source.name} feed: ${error instanceof Error ? error.message : String(error)}`));
    }

    return { articles, errors };
  }

  private extractTags(item: AWSRSSItem): string[] {
    const tags: string[] = [];

    // カテゴリから抽出
    if (item.categories && item.categories.length > 0) {
      tags.push(...item.categories);
    }

    // ソース別の追加タグ
    if (this.source.name === 'AWS Security Bulletins') {
      tags.push('セキュリティ', 'Security');
    } else if (this.source.name === 'AWS What\'s New') {
      tags.push('新機能', 'Updates');
    } else if (this.source.name === 'AWS News Blog') {
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