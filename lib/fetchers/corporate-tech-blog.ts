import { Source } from '@prisma/client';
import Parser from 'rss-parser';
import { BaseFetcher, FetchResult } from './base';
import { CreateArticleInput } from '@/types/models';
import { parseRSSDate } from '@/lib/utils/date';

interface CorporateRSSItem {
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
  description?: string;
  enclosure?: {
    url?: string;
    type?: string;
  };
}

export class CorporateTechBlogFetcher extends BaseFetcher {
  private parser: Parser<unknown, CorporateRSSItem>;
  
  // 日本企業テックブログのRSSフィード
  private rssUrls = [
    { url: 'https://engineering.dena.com/blog/index.xml', name: 'DeNA' },
    { url: 'https://techblog.yahoo.co.jp/index.xml', name: 'Yahoo! JAPAN' },
    { url: 'https://engineering.mercari.com/blog/feed.xml', name: 'メルカリ' },
    { url: 'https://developers.cyberagent.co.jp/blog/feed/', name: 'サイバーエージェント' },
    { url: 'https://techblog.lycorp.co.jp/ja/feed/index.xml', name: 'LINEヤフー' },
    // 新規追加（2025年8月）
    { url: 'https://developers.gmo.jp/feed/', name: 'GMO' },
    { url: 'https://tech.smarthr.jp/feed', name: 'SmartHR' },
    { url: 'https://developers.freee.co.jp/feed', name: 'freee' },
    { url: 'https://techlife.cookpad.com/feed', name: 'クックパッド' },
    // 新規追加（2025年8月14日）
    { url: 'https://techblog.zozo.com/rss', name: 'ZOZO' },
    { url: 'https://techblog.recruit.co.jp/rss.xml', name: 'リクルート' },
    { url: 'https://developer.hatenastaff.com/feed', name: 'はてなDeveloper' },
    { url: 'https://tech.pepabo.com/feed.rss', name: 'GMOペパボ' },
    { url: 'https://buildersbox.corp-sansan.com/feed', name: 'Sansan' },
    { url: 'https://moneyforward-dev.jp/feed', name: 'マネーフォワード' }
  ];

  constructor(source: Source) {
    super(source);
    this.parser = new Parser({
      customFields: {
        item: [
          ['dc:creator', 'dcCreator'],
          ['content:encoded', 'contentEncoded'],
        ],
      },
      headers: {
        'User-Agent': 'TechTrend/1.0 (https://techtrend.example.com)',
        'Accept': 'application/rss+xml, application/xml, text/xml',
      },
    });
  }

  async fetch(): Promise<FetchResult> {
    const allArticles: CreateArticleInput[] = [];
    const allErrors: Error[] = [];
    const seenUrls = new Set<string>();

    // ContentEnricherFactory をインポート（ファイル先頭でのインポートが必要）
    const { ContentEnricherFactory } = await import('../enrichers');
    const enricherFactory = new ContentEnricherFactory();

    // 30日前の日付を計算
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    // 各企業のRSSフィードから記事を取得
    for (const feedInfo of this.rssUrls) {
      try {
        const feed = await this.retry(() => this.parser.parseURL(feedInfo.url));
        
        if (!feed.items || feed.items.length === 0) {
          continue;
        }


        // 記事数制限を環境変数で設定可能に（デフォルト: 30件）
        const maxArticlesPerCompany = parseInt(process.env.MAX_ARTICLES_PER_COMPANY || '30');
        let processedCount = 0;

        // 全記事を処理（日付フィルタリング後に件数制限）
        for (const item of feed.items) {
          try {
            if (!item.title || !item.link) continue;
            
            // 重複チェック
            if (seenUrls.has(item.link)) continue;
            seenUrls.add(item.link);

            // 日付チェックを先に実施（30日以内の記事のみ処理）
            const publishedAt = item.isoDate ? new Date(item.isoDate) :
                          item.pubDate ? parseRSSDate(item.pubDate) : new Date();
            
            if (publishedAt < thirtyDaysAgo) {
              continue;
            }

            // 日本語記事かチェック（タイトルまたは説明に日本語が含まれるか）
            // RSSフィードによってdescription/content/summaryと異なるフィールドに格納されるため全てチェック
            const textToCheck = item.description || item.content || 
                             item.summary || item.contentSnippet || '';
            const hasJapanese = this.containsJapanese(item.title) || 
                              this.containsJapanese(textToCheck);
            
            if (!hasJapanese) {
              continue;
            }

            // イベント記事の除外（環境変数で制御）
            const excludeEvents = process.env.EXCLUDE_EVENT_ARTICLES !== 'false';
            if (excludeEvents && this.isEventArticle(item.title, item.link)) {
              continue;
            }

            // 企業ごとの記事数制限チェック
            if (processedCount >= maxArticlesPerCompany) {
              break;
            }

            // タグを抽出（企業名と技術タグ）
            const tags = this.extractTags(item, feedInfo.name);
            
            // Corporate Tech Blogタグを追加（最後に追加）
            if (!tags.includes('企業テックブログ')) {
              tags.push('企業テックブログ');
            }
            
            // 企業名をタグとして必ず最初に追加（最も目立つ位置）
            // 企業名を正規化して統一
            const companyTagName = this.normalizeCompanyName(feedInfo.name);
            // 既存の企業名タグを削除して最初に追加
            const tagsWithoutCompany = tags.filter(tag => tag !== feedInfo.name && tag !== companyTagName);
            const finalTags = [companyTagName, ...tagsWithoutCompany];

            // コンテンツの取得（優先順位: content > contentSnippet > description）
            let content = item.content || item.contentSnippet || item.description || '';

            // コンテンツエンリッチメント（2000文字未満の場合は常に試みる）
            let thumbnail: string | undefined;
            if (content && content.length < 2000) {
              const enricher = enricherFactory.getEnricher(item.link);
              if (enricher) {
                try {
                  const enrichedData = await enricher.enrich(item.link);
                  if (enrichedData && enrichedData.content && enrichedData.content.length > content.length) {
                    content = enrichedData.content;
                    thumbnail = enrichedData.thumbnail || undefined;
                  } else {
                  }
                } catch (_error) {
                  // エンリッチメント失敗時は元のコンテンツを使用
                }
              } else {
              }
            } else if (content && content.length >= 2000) {
            }

            const article: CreateArticleInput = {
              title: this.sanitizeText(item.title),
              url: this.normalizeUrl(item.link),
              summary: undefined, // 要約は後で日本語で生成
              content: this.sanitizeText(content),
              thumbnail,
              publishedAt,
              sourceId: this.source.id,
              tagNames: finalTags,
              author: item.creator || item['dc:creator'] || feedInfo.name,
            };

            // サムネイルを抽出
            if (item.enclosure?.url && item.enclosure.type?.startsWith('image/')) {
              article.thumbnail = item.enclosure.url;
            } else if (content) {
              const thumbnail = this.extractThumbnail(content);
              if (thumbnail) {
                article.thumbnail = thumbnail;
              }
            }

            allArticles.push(article);
            processedCount++; // 処理済み記事数をインクリメント
          } catch (_error) {
            allErrors.push(new Error(`Failed to parse item from ${feedInfo.name}: ${error instanceof Error ? error.message : String(error)}`));
          }
        }

        // レート制限対策
        await new Promise(resolve => setTimeout(resolve, 500));
      } catch (_error) {
        allErrors.push(new Error(`Failed to fetch ${feedInfo.name} feed: ${error instanceof Error ? error.message : String(error)}`));
      }
    }

    // 日付順にソートして最大50件を返す
    allArticles.sort((a, b) => b.publishedAt.getTime() - a.publishedAt.getTime());
    const limitedArticles = allArticles.slice(0, 50);

    return { articles: limitedArticles, errors: allErrors };
  }

  /**
   * 日本語を含むかチェック
   */
  private containsJapanese(text: string): boolean {
    // ひらがな、カタカナ、漢字のいずれかを含むかチェック
    return /[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]/.test(text);
  }

  /**
   * イベント記事かどうかを判定
   */
  private isEventArticle(title: string, url: string): boolean {
    // 除外対象のイベント系キーワード
    const eventKeywords = [
      '登壇', 'イベント', 'セミナー', '勉強会',
      'カンファレンス', 'meetup', '参加募集', '開催しました',
      '開催します', '参加者募集'
    ];
    
    // 除外しないキーワード（技術的価値がある可能性）
    const excludeExceptions = ['振り返り', 'レポート', '技術解説', 'まとめ'];
    
    const titleLower = title.toLowerCase();
    
    // 例外チェック
    const hasException = excludeExceptions.some(exception => 
      title.includes(exception)
    );
    
    if (hasException) {
      return false; // 技術レポートは除外しない
    }
    
    // イベントキーワードチェック
    const hasEventKeyword = eventKeywords.some(keyword => 
      title.includes(keyword) || titleLower.includes(keyword.toLowerCase())
    );
    
    // URLパターンチェック
    const hasEventUrl = /\/(event|seminar|meetup|conference)/i.test(url);
    
    // 未来の日付パターンチェック（例：2025/8/20）
    const futureDatePattern = /20\d{2}\/\d{1,2}\/\d{1,2}/;
    const hasFutureDate = futureDatePattern.test(title);
    
    return hasEventKeyword || hasEventUrl || hasFutureDate;
  }

  /**
   * 企業名を正規化（統一された表記にする）
   */
  private normalizeCompanyName(name: string): string {
    // 企業名の正規化マッピング
    const nameMap: Record<string, string> = {
      'DeNA': 'DeNA',
      'Yahoo! JAPAN': 'LINEヤフー',  // 統合を反映
      'メルカリ': 'メルカリ',
      'サイバーエージェント': 'CyberAgent',
      'LINEヤフー': 'LINEヤフー',
      'GMO': 'GMO',
      'SmartHR': 'SmartHR',
      'freee': 'freee',
      'クックパッド': 'クックパッド',
      // 新規追加（2025年8月14日）
      'ZOZO': 'ZOZO',
      'リクルート': 'リクルート',
      'はてなDeveloper': 'はてなDeveloper',
      'GMOペパボ': 'GMOペパボ',
      'Sansan': 'Sansan',
      'マネーフォワード': 'マネーフォワード'
    };
    
    return nameMap[name] || name;
  }

  /**
   * タグ抽出
   */
  private extractTags(item: CorporateRSSItem, companyName: string): string[] {
    const tags: string[] = [];

    // カテゴリから抽出
    if (item.categories && item.categories.length > 0) {
      tags.push(...item.categories);
    }

    // 企業別の追加タグ（企業名自体はここでは追加しない）
    switch (companyName) {
      case 'DeNA':
        tags.push('ゲーム開発', 'モバイル');
        break;
      case 'Yahoo! JAPAN':
        tags.push('ポータルサイト', '検索技術');
        break;
      case 'メルカリ':
        tags.push('マーケットプレイス', 'フリマアプリ');
        break;
      case 'サイバーエージェント':
        tags.push('広告技術', 'メディア');
        break;
      case 'LINEヤフー':
        tags.push('メッセージング', 'コミュニケーション');
        break;
    }

    // タイトルと内容から技術キーワードを抽出
    const text = `${item.title} ${item.description || ''}`;
    const techKeywords = [
      // プログラミング言語
      'JavaScript', 'TypeScript', 'Python', 'Go', 'Rust', 'Ruby', 'Java', 'Kotlin', 'Swift',
      'PHP', 'C++', 'Scala', 'Elixir', 'Dart', 'R',
      
      // フレームワーク・ライブラリ
      'React', 'Vue', 'Angular', 'Next.js', 'Nuxt.js', 'Express', 'Django', 'Rails', 
      'Spring', 'Laravel', 'Flutter', 'React Native', 'Svelte',
      
      // インフラ・クラウド
      'AWS', 'GCP', 'Azure', 'Docker', 'Kubernetes', 'Terraform', 'Ansible',
      'CloudFormation', 'CI/CD', 'GitHub Actions', 'Jenkins', 'GitLab',
      
      // データベース
      'MySQL', 'PostgreSQL', 'MongoDB', 'Redis', 'Elasticsearch', 'DynamoDB',
      'Firestore', 'BigQuery', 'Cassandra', 'Neo4j',
      
      // AI・機械学習
      'AI', '機械学習', 'ディープラーニング', 'TensorFlow', 'PyTorch', 'LLM',
      'ChatGPT', 'GPT-4', 'BERT', 'Transformer', 'NLP', '自然言語処理',
      
      // その他の技術
      'GraphQL', 'REST API', 'gRPC', 'WebSocket', 'マイクロサービス', 'サーバーレス',
      'ブロックチェーン', 'IoT', 'AR', 'VR', 'WebAssembly', 'PWA',
      
      // 開発手法・概念
      'DevOps', 'SRE', 'アジャイル', 'スクラム', 'TDD', 'DDD', 'クリーンアーキテクチャ',
      'リファクタリング', 'パフォーマンス', 'セキュリティ', 'アクセシビリティ'
    ];

    for (const keyword of techKeywords) {
      if (text.toLowerCase().includes(keyword.toLowerCase())) {
        tags.push(keyword);
      }
    }

    // 重複を削除して最大10個まで
    return [...new Set(tags)].slice(0, 10);
  }
}