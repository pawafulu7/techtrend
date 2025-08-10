import type { ArticleWithDetails } from '@/types/models';

export function calculateQualityScore(article: ArticleWithDetails): number {
  let score = 0;
  const now = new Date();

  // 1. タグの質と量（最大30点）
  const techTagCount = article.tags.filter(tag => 
    !['AWS', 'SRE', 'HashiCorp', 'CNCF', 'Grafana', 'What\'s New', 'Security Bulletins', 'News Blog', 'SRE Weekly'].includes(tag.name)
  ).length;
  
  if (techTagCount >= 5) score += 30;
  else if (techTagCount >= 3) score += 25;
  else if (techTagCount >= 2) score += 15;
  else if (techTagCount >= 1) score += 10;

  // 2. 要約の充実度（最大20点）
  if (article.summary) {
    const summaryLength = article.summary.length;
    if (summaryLength >= 60 && summaryLength <= 120) score += 20;
    else if (summaryLength >= 40) score += 15;
    else if (summaryLength >= 20) score += 10;
  }

  // 3. ソースの信頼性（最大20点）
  const sourceScores: Record<string, number> = {
    'Dev.to': 15,
    'Qiita': 18,
    'Qiita Popular': 20,
    'Zenn': 18,
    'はてなブックマーク': 15,
    'Publickey': 20,
    'Stack Overflow Blog': 18,
    'AWS': 20,
    'SRE': 18,
    'Think IT': 15,
    'Rails Releases': 15,
    'Speaker Deck': 12,
  };
  score += sourceScores[article.source.name] || 10;

  // 4. 新鮮さ（最大15点）
  const ageInDays = (now.getTime() - new Date(article.publishedAt).getTime()) / (1000 * 60 * 60 * 24);
  if (ageInDays <= 1) score += 15;
  else if (ageInDays <= 3) score += 12;
  else if (ageInDays <= 7) score += 8;
  else if (ageInDays <= 14) score += 4;

  // 5. エンゲージメント（最大15点）
  // Dev.toのブックマーク数を基準に
  if (article.bookmarks > 0) {
    if (article.bookmarks >= 500) score += 15;
    else if (article.bookmarks >= 200) score += 12;
    else if (article.bookmarks >= 100) score += 10;
    else if (article.bookmarks >= 50) score += 8;
    else if (article.bookmarks >= 20) score += 5;
    else score += 2;
  }

  // 6. タイトルの質（減点方式）
  const clickbaitPatterns = [
    /^[0-9]+[\s]*[のつ個]/,  // "10個の〜"
    /知らないと[損|ヤバい|マズい]/,
    /絶対に/,
    /すぎる/,    // 「〜すぎる」パターン
    /理由$/,     // 「〜理由」で終わるパターン
    /衝撃/,
    /必見/,
  ];
  
  for (const pattern of clickbaitPatterns) {
    if (pattern.test(article.title)) {
      score -= 10;
      break;
    }
  }

  // 7. ユーザー投票ボーナス
  if (article.userVotes > 0) {
    score += Math.min(article.userVotes * 2, 20);
  }

  // スコアを0-100の範囲に正規化
  return Math.max(0, Math.min(100, score));
}

// 記事の難易度を判定
export function determineDifficulty(article: ArticleWithDetails): 'beginner' | 'intermediate' | 'advanced' {
  const tagNames = article.tags.map(t => t.name.toLowerCase());
  const title = article.title.toLowerCase();
  const content = (article.content || article.summary || '').toLowerCase();
  
  // 上級者向けのキーワード
  const advancedKeywords = [
    'アーキテクチャ', 'architecture', 'パフォーマンス最適化', 'performance optimization',
    'スケーラビリティ', 'scalability', '分散システム', 'distributed',
    'アルゴリズム', 'algorithm', '機械学習', 'machine learning', 'deep learning',
    'コンパイラ', 'compiler', 'カーネル', 'kernel', 'low-level',
    '設計パターン', 'design pattern', 'マイクロサービス', 'microservices',
    'kubernetes', 'k8s', 'terraform', 'インフラ', 'infrastructure as code'
  ];
  
  // 初級者向けのキーワード
  const beginnerKeywords = [
    '入門', 'getting started', '初心者', 'beginner', 'tutorial',
    '基本', 'basic', '基礎', 'fundamental', 'はじめて', 'first time',
    'hello world', 'インストール', 'install', 'セットアップ', 'setup',
    '環境構築', '導入', 'introduction', '使い方', 'how to use'
  ];
  
  // コンテンツの複雑さをチェック
  let complexityScore = 0;
  
  // 上級キーワードのカウント
  advancedKeywords.forEach(keyword => {
    if (title.includes(keyword) || content.includes(keyword)) {
      complexityScore += 2;
    }
    if (tagNames.some(tag => tag.includes(keyword))) {
      complexityScore += 1;
    }
  });
  
  // 初級キーワードのカウント
  beginnerKeywords.forEach(keyword => {
    if (title.includes(keyword) || content.includes(keyword)) {
      complexityScore -= 2;
    }
    if (tagNames.some(tag => tag.includes(keyword))) {
      complexityScore -= 1;
    }
  });
  
  // コードブロックの有無と複雑さ
  const codeBlocks = (content.match(/```/g) || []).length / 2;
  if (codeBlocks > 5) complexityScore += 2;
  else if (codeBlocks > 2) complexityScore += 1;
  
  // 記事の長さ
  if (content.length > 5000) complexityScore += 1;
  if (content.length < 1000) complexityScore -= 1;
  
  // 難易度の判定
  if (complexityScore >= 4) return 'advanced';
  if (complexityScore <= -3) return 'beginner';
  return 'intermediate';
}

// カテゴリー別の品質チェック
export function checkCategoryQuality(article: ArticleWithDetails): {
  category: string | null;
  qualityBonus: number;
} {
  const tagNames = article.tags.map(t => t.name.toLowerCase());
  let category = null;
  let qualityBonus = 0;

  // AI/機械学習カテゴリー
  if (tagNames.some(tag => ['ai', '機械学習', 'ml', 'deeplearning', '深層学習'].includes(tag))) {
    category = 'AI/ML';
    // 実装例やコードがあるかチェック
    if (article.content && (article.content.includes('```') || article.content.includes('import '))) {
      qualityBonus = 10;
    }
  }

  // セキュリティカテゴリー
  else if (tagNames.some(tag => ['セキュリティ', 'security', '脆弱性', 'cve'].includes(tag))) {
    category = 'Security';
    // CVE番号や具体的な対策があるかチェック
    if (article.content && (article.content.match(/CVE-\d{4}-\d+/) || article.content.includes('対策'))) {
      qualityBonus = 10;
    }
  }

  // チュートリアルカテゴリー
  else if (tagNames.some(tag => ['tutorial', 'チュートリアル', '入門', 'getting-started'].includes(tag))) {
    category = 'Tutorial';
    // ステップバイステップの説明があるかチェック
    if (article.content && (article.content.match(/[1-9]\./g) || article.content.includes('Step'))) {
      qualityBonus = 10;
    }
  }

  return { category, qualityBonus };
}