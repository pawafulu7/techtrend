import { Source } from '@/lib/prisma-exports';
import Parser from 'rss-parser';
import { BaseFetcher } from './base';
import { FetchResult } from '@/types/fetchers';
import { CreateArticleInput } from '@/types/models';
import { parseRSSDate } from '@/lib/utils/date';
import { isUrlFromDomain } from '@/lib/utils/url/url-validator';
import { generateZennThumbnail } from '@/lib/utils/zenn-thumbnail';

interface HatenaItem {
  title?: string;
  link?: string;
  pubDate?: string;
  'dc:date'?: string;
  description?: string;
  content?: string;
  contentSnippet?: string;
  'hatena:bookmarkcount'?: string;
  hatenaImageUrl?: string;
  categories?: string[];
}

export class HatenaExtendedFetcher extends BaseFetcher {
  private parser: Parser<unknown, HatenaItem>;

  // 技術系のRSSフィードのみを使用
  private rssUrls = [
    'https://b.hatena.ne.jp/hotentry/it.rss', // ITカテゴリー人気
    'https://b.hatena.ne.jp/entrylist/it.rss', // ITカテゴリー新着
    'https://b.hatena.ne.jp/hotentry/it.rss?mode=rss&sort=hot', // ITカテゴリーホット
  ];

  // 技術系キーワード（フィルタリング用）
  private techKeywords = [
    // プログラミング言語
    'javascript',
    'typescript',
    'python',
    'java',
    'ruby',
    'go',
    'rust',
    'php',
    'swift',
    'kotlin',
    'c++',
    'c#',
    'scala',
    'elixir',
    'haskell',
    'clojure',
    'dart',
    'julia',
    'r言語',

    // フレームワーク・ライブラリ
    'react',
    'vue',
    'angular',
    'next.js',
    'nuxt',
    'svelte',
    'node.js',
    'express',
    'django',
    'rails',
    'spring',
    'laravel',
    'flask',
    'fastapi',
    'gin',
    'echo',

    // インフラ・クラウド
    'aws',
    'gcp',
    'azure',
    'docker',
    'kubernetes',
    'terraform',
    'ansible',
    'jenkins',
    'github',
    'gitlab',
    'circleci',
    'cloudflare',
    'vercel',
    'netlify',

    // データベース
    'mysql',
    'postgresql',
    'mongodb',
    'redis',
    'elasticsearch',
    'dynamodb',
    'firestore',
    'sqlite',
    'prisma',
    'typeorm',
    'sequelize',

    // AI・機械学習
    'ai',
    '機械学習',
    'ディープラーニング',
    'chatgpt',
    'gpt',
    'llm',
    'tensorflow',
    'pytorch',
    'scikit-learn',
    'pandas',
    'numpy',
    'jupyter',
    'claude',
    'gemini',
    'openai',
    'anthropic',
    'google',
    'microsoft',
    'meta',

    // その他技術用語
    'api',
    'rest',
    'graphql',
    'websocket',
    'oauth',
    'jwt',
    'ci/cd',
    'devops',
    'マイクロサービス',
    'サーバーレス',
    'sre',
    'セキュリティ',
    'linux',
    'ubuntu',
    'git',
    'vim',
    'vscode',
    'プログラミング',
    '開発',
    'エンジニア',
    'コーディング',
    'アルゴリズム',
    'データ構造',
    'デザインパターン',
    'リファクタリング',
    'テスト',
    'フロントエンド',
    'バックエンド',
    'フルスタック',
    'web開発',
    'アプリ開発',
    'オープンソース',
    'oss',
    'npm',
    'yarn',
    'pip',
    'gem',
    'cargo',
  ];

  constructor(source: Source) {
    super(source);
    this.parser = new Parser({
      customFields: {
        item: [
          ['dc:date', 'dcDate'],
          ['hatena:bookmarkcount', 'bookmarkcount'],
          ['hatena:imageurl', 'hatenaImageUrl'],
        ],
      },
    });
  }

  // Qiita記事かどうかを判定
  private isQiitaArticle(url: string): boolean {
    return isUrlFromDomain(url, 'qiita.com');
  }

  // コンテンツが削除メッセージかどうかを検証
  private validateContent(content: string): boolean {
    if (!content) return true;

    // 削除メッセージのパターン
    const deletedPatterns = [
      'Deleted articles cannot be recovered',
      'This article has been deleted',
      '記事は削除されました',
      'Are you sure you want to delete this article',
    ];

    // いずれかのパターンが含まれていたら無効なコンテンツ
    return !deletedPatterns.some((pattern) =>
      content.toLowerCase().includes(pattern.toLowerCase())
    );
  }

  // Qiita記事のコンテンツをフェッチ（簡易版）
  async fetch(): Promise<FetchResult> {
    const allArticles: CreateArticleInput[] = [];
    const allErrors: Error[] = [];
    const seenUrls = new Set<string>();

    // 各RSSフィードから記事を取得
    for (const rssUrl of this.rssUrls) {
      try {
        const feed = await this.retry(() => this.parser.parseURL(rssUrl));

        for (const item of feed.items || []) {
          try {
            if (!item.title || !item.link) continue;

            // 重複チェック
            if (seenUrls.has(item.link)) continue;

            // コンテンツの取得と検証
            const content =
              item.content || item.description || item.contentSnippet || '';
            let thumbnail: string | undefined;
            if (item.hatenaImageUrl) {
              try {
                const url = new URL(item.hatenaImageUrl);
                if (url.protocol === 'http:' || url.protocol === 'https:') {
                  thumbnail = item.hatenaImageUrl;
                }
              } catch {
                // Invalid URL - ignore
              }
            }
            if (
              !thumbnail &&
              item.link &&
              isUrlFromDomain(item.link, 'zenn.dev')
            ) {
              thumbnail =
                generateZennThumbnail(item.link, item.title) || undefined;
            }

            // Qiita記事の場合の特別処理
            if (this.isQiitaArticle(item.link)) {
              // コンテンツが削除メッセージの場合
              if (!this.validateContent(content)) {
                // コンテンツが取得できない場合はスキップ
                continue;
              }
            }

            const article: CreateArticleInput = {
              title: this.sanitizeText(item.title),
              url: this.normalizeUrl(item.link),
              summary: undefined, // 要約は後で日本語で生成
              content: content,
              thumbnail: thumbnail, // サムネイルを追加
              publishedAt: item.pubDate
                ? parseRSSDate(item.pubDate)
                : item['dc:date']
                  ? new Date(item['dc:date'])
                  : new Date(),
              sourceId: this.source.id,
              tagNames: item.categories || [],
            };

            // 技術記事かチェック
            if (this.isTechArticle(article)) {
              seenUrls.add(item.link);
              allArticles.push(article);
            }
          } catch (_error) {
            allErrors.push(
              new Error(
                `Failed to parse item: ${_error instanceof Error ? _error.message : String(_error)}`
              )
            );
          }
        }

        // レート制限を考慮して少し待機
        await new Promise((resolve) => setTimeout(resolve, 500));
      } catch (_error) {
        allErrors.push(
          new Error(
            `Failed to fetch from ${rssUrl}: ${_error instanceof Error ? _error.message : String(_error)}`
          )
        );
      }
    }

    return {
      articles: allArticles.slice(0, 40),
      errors: allErrors,
    };
  }

  private isTechArticle(article: CreateArticleInput): boolean {
    // タイトルと要約を小文字に変換
    const titleLower = article.title.toLowerCase();
    const summaryLower = (article.summary || '').toLowerCase();
    const contentLower = (article.content || '').toLowerCase().slice(0, 1000); // 最初の1000文字のみチェック

    // 技術キーワードのいずれかが含まれているかチェック
    return this.techKeywords.some((keyword) => {
      const keywordLower = keyword.toLowerCase();
      return (
        titleLower.includes(keywordLower) ||
        summaryLower.includes(keywordLower) ||
        contentLower.includes(keywordLower)
      );
    });
  }
}
