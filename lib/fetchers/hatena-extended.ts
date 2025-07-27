import { HatenaFetcher } from './hatena';
import { FetchResult } from './base';
import { CreateArticleInput } from '@/lib/types/article';

export class HatenaExtendedFetcher extends HatenaFetcher {
  // 技術系のRSSフィードのみを使用
  private rssUrls = [
    'https://b.hatena.ne.jp/hotentry/it.rss',           // ITカテゴリー人気
    'https://b.hatena.ne.jp/entrylist/it.rss',          // ITカテゴリー新着
    'https://b.hatena.ne.jp/hotentry/it.rss?mode=rss&sort=hot',  // ITカテゴリーホット
  ];

  // 技術系キーワード（フィルタリング用）
  private techKeywords = [
    // プログラミング言語
    'javascript', 'typescript', 'python', 'java', 'ruby', 'go', 'rust', 'php', 'swift', 'kotlin',
    'c++', 'c#', 'scala', 'elixir', 'haskell', 'clojure', 'dart', 'julia', 'r言語',
    
    // フレームワーク・ライブラリ
    'react', 'vue', 'angular', 'next.js', 'nuxt', 'svelte', 'node.js', 'express', 'django',
    'rails', 'spring', 'laravel', 'flask', 'fastapi', 'gin', 'echo',
    
    // インフラ・クラウド
    'aws', 'gcp', 'azure', 'docker', 'kubernetes', 'terraform', 'ansible', 'jenkins',
    'github', 'gitlab', 'circleci', 'cloudflare', 'vercel', 'netlify',
    
    // データベース
    'mysql', 'postgresql', 'mongodb', 'redis', 'elasticsearch', 'dynamodb', 'firestore',
    'sqlite', 'prisma', 'typeorm', 'sequelize',
    
    // AI・機械学習
    'ai', '機械学習', 'ディープラーニング', 'chatgpt', 'gpt', 'llm', 'tensorflow',
    'pytorch', 'scikit-learn', 'pandas', 'numpy', 'jupyter',
    
    // その他技術用語
    'api', 'rest', 'graphql', 'websocket', 'oauth', 'jwt', 'ci/cd', 'devops',
    'マイクロサービス', 'サーバーレス', 'sre', 'セキュリティ', 'linux', 'ubuntu',
    'git', 'vim', 'vscode', 'プログラミング', '開発', 'エンジニア', 'コーディング',
    'アルゴリズム', 'データ構造', 'デザインパターン', 'リファクタリング', 'テスト',
    'フロントエンド', 'バックエンド', 'フルスタック', 'web開発', 'アプリ開発',
    'オープンソース', 'oss', 'npm', 'yarn', 'pip', 'gem', 'cargo'
  ];

  async fetch(): Promise<FetchResult> {
    const allArticles: CreateArticleInput[] = [];
    const allErrors: Error[] = [];
    const seenUrls = new Set<string>();

    // 各RSSフィードから記事を取得
    for (const rssUrl of this.rssUrls) {
      try {
        // 一時的にURLを変更
        const originalUrl = this.source.url;
        this.source.url = rssUrl;
        
        const result = await super.fetch();
        
        // URLを元に戻す
        this.source.url = originalUrl;

        // 重複を除いて技術記事のみを追加
        for (const article of result.articles) {
          if (!seenUrls.has(article.url) && this.isTechArticle(article)) {
            seenUrls.add(article.url);
            allArticles.push(article);
          }
        }

        allErrors.push(...result.errors);

        // レート制限を考慮して少し待機
        await new Promise(resolve => setTimeout(resolve, 500));
      } catch (error) {
        allErrors.push(new Error(`Failed to fetch from ${rssUrl}: ${error instanceof Error ? error.message : String(error)}`));
      }
    }

    return { 
      articles: allArticles.slice(0, 40), // 日別トレンド上位40件
      errors: allErrors 
    };
  }

  private isTechArticle(article: CreateArticleInput): boolean {
    // タイトルと要約を小文字に変換
    const titleLower = article.title.toLowerCase();
    const summaryLower = (article.summary || '').toLowerCase();
    const contentLower = (article.content || '').toLowerCase().slice(0, 1000); // 最初の1000文字のみチェック
    
    // 技術キーワードのいずれかが含まれているかチェック
    return this.techKeywords.some(keyword => {
      const keywordLower = keyword.toLowerCase();
      return titleLower.includes(keywordLower) || 
             summaryLower.includes(keywordLower) ||
             contentLower.includes(keywordLower);
    });
  }
}