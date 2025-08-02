import { Source } from '@prisma/client';
import Parser from 'rss-parser';
import { BaseFetcher, FetchResult } from './base';
import { CreateArticleInput } from '@/types/models';
import { parseRSSDate } from '@/lib/utils/date';

interface RailsReleaseItem {
  id?: string;
  title?: string;
  link?: string;
  published?: string;
  updated?: string;
  isoDate?: string;
  pubDate?: string;
  author?: {
    name?: string;
  };
  content?: string;
  'media:thumbnail'?: {
    $?: {
      url?: string;
    };
  };
}

export class RailsReleasesFetcher extends BaseFetcher {
  private parser: Parser<unknown, RailsReleaseItem>;

  constructor(source: Source) {
    super(source);
    this.parser = new Parser({
      customFields: {
        item: [
          ['published'],
          ['updated'],
          ['media:thumbnail', 'mediaThumbnail'],
        ],
      },
    });
  }

  async fetch(): Promise<FetchResult> {
    const articles: CreateArticleInput[] = [];
    const errors: Error[] = [];

    try {
      console.log('[Rails Releases] フィードを取得中...');
      const feed = await this.retry(() => this.parser.parseURL(this.source.url));
      
      if (!feed.items || feed.items.length === 0) {
        console.log('[Rails Releases] 記事が見つかりませんでした');
        return { articles, errors };
      }

      console.log(`[Rails Releases] ${feed.items.length}件のリリースを取得`);

      // 最新30件のリリースのみ処理
      for (const item of feed.items.slice(0, 30)) {
        try {
          if (!item.title || !item.link) continue;

          // バージョン番号を抽出（例: "v7.1.3" -> "7.1.3"）
          const versionMatch = item.title.match(/v?(\d+\.\d+\.\d+(?:\.\d+)?)/);
          const version = versionMatch ? versionMatch[1] : '';

          // リリースノートのコンテンツから重要な情報を抽出
          let releaseNotes = '';
          if (item.content) {
            // HTMLタグを除去して純粋なテキストを取得
            releaseNotes = this.sanitizeText(item.content);
          }

          const article: CreateArticleInput = {
            title: `Rails ${version} リリース`,
            url: this.normalizeUrl(item.link),
            summary: undefined, // 要約は後で日本語で生成
            content: releaseNotes,
            publishedAt: item.isoDate ? new Date(item.isoDate) :
                        item.pubDate ? parseRSSDate(item.pubDate) :
                        item.updated ? new Date(item.updated) : 
                        item.published ? new Date(item.published) : new Date(),
            sourceId: this.source.id,
            tagNames: this.extractTags(version, item.title || ''),
          };

          // GitHubのアバター画像をサムネイルとして使用
          if (item['media:thumbnail']?.$ ?.url) {
            article.thumbnail = item['media:thumbnail'].$.url;
          }

          articles.push(article);
        } catch (error) {
          errors.push(new Error(`Failed to parse release: ${error instanceof Error ? error.message : String(error)}`));
        }
      }

      console.log(`[Rails Releases] ${articles.length}件の記事を処理`);
    } catch (error) {
      errors.push(new Error(`Failed to fetch Rails releases: ${error instanceof Error ? error.message : String(error)}`));
    }

    return { articles, errors };
  }

  private extractTags(version: string, title: string): string[] {
    const tags = ['Rails', 'Ruby on Rails', 'リリース'];

    // メジャーバージョンに基づくタグ
    if (version) {
      const majorVersion = version.split('.')[0];
      tags.push(`Rails${majorVersion}`);
    }

    // プレリリースやRC版の判定
    if (title.includes('rc') || title.includes('RC')) {
      tags.push('RC版');
    } else if (title.includes('beta')) {
      tags.push('ベータ版');
    } else if (title.includes('alpha')) {
      tags.push('アルファ版');
    }

    // セキュリティリリースの判定
    if (title.toLowerCase().includes('security')) {
      tags.push('セキュリティ');
    }

    return tags;
  }
}