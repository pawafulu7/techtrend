/**
 * 記事タイプ判定ユーティリティ
 * タイトルと内容から記事の種類を自動判定します
 */

export type ArticleType = 
  | 'release'         // 新機能リリース型
  | 'problem-solving' // 問題解決型
  | 'tutorial'        // チュートリアル型
  | 'tech-intro'      // 技術紹介型
  | 'implementation'; // 実装レポート型

interface TypePattern {
  type: ArticleType;
  titlePatterns: RegExp[];
  contentPatterns?: RegExp[];
  priority: number; // 高い値ほど優先
}

const TYPE_PATTERNS: TypePattern[] = [
  // 実装レポート型（優先度を最も高く）
  {
    type: 'implementation',
    priority: 110,
    titlePatterns: [
      /building/i,
      /built/i,
      /created/i,
      /developed/i,
      /made/i,
      /作った/,
      /作りました/,
      /開発した/,
      /開発しました/,
      /実装した/,
      /実装しました/,
      /構築した/,
      /構築しました/
    ],
    contentPatterns: [
      /i built/i,
      /i created/i,
      /we built/i,
      /we created/i,
      /作成しました/,
      /開発しました/,
      /実装しました/
    ]
  },
  
  // 新機能リリース型
  {
    type: 'release',
    priority: 100,
    titlePatterns: [
      /release/i,
      /announces?/i,
      /introduces?/i,
      /launches?/i,
      /available/i,
      /now supports?/i,
      /adds? support/i,
      /リリース/,
      /公開/,
      /発表/,
      /開始/,
      /提供開始/,
      /サポート開始/
    ],
    contentPatterns: [
      /new feature/i,
      /new service/i,
      /now available/i,
      /we are pleased to announce/i,
      /we're excited to/i,
      /新機能/,
      /新サービス/,
      /本日より/,
      /開始しました/
    ]
  },
  
  // チュートリアル型
  {
    type: 'tutorial',
    priority: 90,
    titlePatterns: [
      /how to/i,
      /tutorial/i,
      /guide/i,
      /getting started/i,
      /step by step/i,
      /入門/,
      /使い方/,
      /はじめ[てる]/,
      /手順/,
      /チュートリアル/,
      /ガイド/
    ],
    contentPatterns: [
      /step \d+/i,
      /first,? you/i,
      /next,? you/i,
      /finally/i,
      /手順\d+/,
      /まず/,
      /次に/,
      /最後に/
    ]
  },
  
  // 技術紹介型
  {
    type: 'tech-intro',
    priority: 80,
    titlePatterns: [
      /what is/i,
      /introduction to/i,
      /understanding/i,
      /overview/i,
      /explained/i,
      /とは/,
      /について/,
      /紹介/,
      /解説/,
      /概要/
    ],
    contentPatterns: [
      /is a technology/i,
      /is a framework/i,
      /is a library/i,
      /という技術/,
      /というフレームワーク/,
      /というライブラリ/
    ]
  },
  
  // 問題解決型（デフォルト）
  {
    type: 'problem-solving',
    priority: 75, // 優先度を調整
    titlePatterns: [
      /fix(?:ing|ed)?/i,
      /solv(?:e|ing|ed)/i,
      /debug(?:ging)?/i,
      /troubleshoot/i,
      /optimiz(?:e|ing|ed)/i,
      /improv(?:e|ing|ed)/i,
      /解決/,
      /修正/,
      /改善/,
      /最適化/,
      /デバッグ/
    ],
    contentPatterns: [
      /problem/i,
      /issue/i,
      /error/i,
      /bug/i,
      /solution/i,
      /問題/,
      /課題/,
      /エラー/,
      /バグ/,
      /解決策/
    ]
  }
];

/**
 * 記事タイプを検出する
 * @param title 記事タイトル
 * @param content 記事内容（オプション）
 * @returns 検出された記事タイプ
 */
export function detectArticleType(title: string, content?: string): ArticleType {
  let bestMatch: { type: ArticleType; score: number } | null = null;
  
  for (const pattern of TYPE_PATTERNS) {
    let score = 0;
    
    // タイトルパターンのマッチング
    for (const titlePattern of pattern.titlePatterns) {
      if (titlePattern.test(title)) {
        score += pattern.priority;
        break; // 1つマッチしたら次のパターンへ
      }
    }
    
    // コンテンツパターンのマッチング（存在する場合）
    if (content && pattern.contentPatterns) {
      for (const contentPattern of pattern.contentPatterns) {
        if (contentPattern.test(content)) {
          score += pattern.priority * 0.5; // コンテンツマッチは半分の重み
          break;
        }
      }
    }
    
    // 最高スコアを更新
    if (score > 0 && (!bestMatch || score > bestMatch.score)) {
      bestMatch = { type: pattern.type, score };
    }
  }
  
  // マッチが見つからない場合はデフォルトで問題解決型
  return bestMatch?.type || 'problem-solving';
}

/**
 * 記事タイプの日本語名を取得
 * @param type 記事タイプ
 * @returns 日本語名
 */
export function getArticleTypeLabel(type: ArticleType): string {
  const labels: Record<ArticleType, string> = {
    'release': '新機能リリース',
    'problem-solving': '問題解決',
    'tutorial': 'チュートリアル',
    'tech-intro': '技術紹介',
    'implementation': '実装レポート'
  };
  return labels[type];
}

/**
 * 記事タイプの説明を取得
 * @param type 記事タイプ
 * @returns 説明文
 */
export function getArticleTypeDescription(type: ArticleType): string {
  const descriptions: Record<ArticleType, string> = {
    'release': '新しい機能やサービスのリリース情報',
    'problem-solving': '技術的な問題の解決方法や改善策',
    'tutorial': 'ステップバイステップの学習ガイド',
    'tech-intro': '技術やツールの概要説明',
    'implementation': '個人プロジェクトや実装の共有'
  };
  return descriptions[type];
}