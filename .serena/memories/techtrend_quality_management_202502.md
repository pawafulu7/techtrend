# TechTrend 品質管理システム（2025年2月）

## 品質スコアリングシステム

### 品質スコア算出（0-100点）

#### 1. 基本スコア（40点）
```typescript
// lib/utils/quality-score.ts
const baseScore = Math.min(40, 
  (article.bookmarks * 2) + 
  (article.userVotes * 5)
);
```
- ブックマーク: 1件 = 2点
- ユーザー投票: 1票 = 5点
- 上限: 40点

#### 2. コンテンツスコア（30点）
```typescript
let contentScore = 0;
if (article.summary) contentScore += 15;
if (article.content) contentScore += 10;
if (article.tags?.length > 0) contentScore += 5;
```
- 要約あり: 15点
- 本文あり: 10点
- タグあり: 5点

#### 3. 鮮度スコア（20点）
```typescript
const ageInDays = (Date.now() - article.publishedAt) / (1000 * 60 * 60 * 24);
const freshnessScore = Math.max(0, 20 - (ageInDays * 0.5));
```
- 新着記事: 20点
- 1日経過: -0.5点
- 40日以上: 0点

#### 4. エンゲージメントスコア（10点）
```typescript
const engagementScore = Math.min(10,
  (article.readingList?.length || 0) * 2
);
```
- 読書リスト登録: 1件 = 2点
- 上限: 10点

### 品質フィルタリング基準

#### ソース別フィルタ

**Dev.to**
- positive_reactions_count >= 10
- reading_time_minutes >= 2
- top = 1（日別トップ記事）

**Qiita**
- stocks_count >= 10
- created_at >= 24時間以内

**Zenn**
- デイリートレンドフィード使用
- 複数トピックから収集

**Speaker Deck**
- 日本語プレゼンテーション
- トレンドページから取得

**はてなブックマーク**
- テクノロジーカテゴリ
- ホットエントリー優先

### 低品質記事の自動削除

#### 削除基準
```typescript
// scripts/delete-low-quality-articles.ts
const deleteCriteria = {
  // Dev.to: 反応数0
  devto: { 
    source: 'Dev.to',
    qualityScore: 0,
    bookmarks: 0
  },
  // 全ソース: 3ヶ月以上前
  old: {
    publishedAt: { 
      lt: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000)
    }
  }
};
```

#### 削除実行
```bash
# 低品質記事削除
npx tsx scripts/delete-low-quality-articles.ts

# ドライラン（確認のみ）
npx tsx scripts/delete-low-quality-articles.ts --dry-run
```

## 記事タイプ分類

### 5つの記事タイプ

#### 1. release（リリース・更新情報）
- キーワード: version, release, update, changelog
- 要約フォーカス: バージョン番号、新機能、変更点

#### 2. problem-solving（問題解決）
- キーワード: fix, solve, debug, error, issue
- 要約フォーカス: 問題内容、解決方法、結果

#### 3. tutorial（チュートリアル）
- キーワード: how to, guide, tutorial, step
- 要約フォーカス: 学習内容、手順、ゴール

#### 4. tech-intro（技術紹介）
- キーワード: introduction, what is, overview
- 要約フォーカス: 技術概要、特徴、用途

#### 5. implementation（実装例）
- キーワード: implement, build, create, code
- 要約フォーカス: 実装内容、使用技術、成果

### タイプ判定アルゴリズム
```typescript
// lib/utils/article-type-detector.ts
export function detectArticleType(title: string, content: string): string {
  const text = `${title} ${content}`.toLowerCase();
  
  // キーワードマッチング
  if (releaseKeywords.some(k => text.includes(k))) return 'release';
  if (problemKeywords.some(k => text.includes(k))) return 'problem-solving';
  // ...
  
  return 'general'; // デフォルト
}
```

## 難易度レベル判定

### 3段階の難易度

#### beginner（初級）
- 基本的な概念説明
- 入門・導入記事
- セットアップガイド

#### intermediate（中級）
- 実装例・コードサンプル
- 一般的な問題解決
- フレームワーク活用

#### advanced（上級）
- アーキテクチャ設計
- パフォーマンス最適化
- 高度なアルゴリズム

### 判定基準
```typescript
// scripts/calculate-difficulty-levels.ts
const difficultyKeywords = {
  beginner: ['入門', '初心者', 'getting started', 'introduction'],
  intermediate: ['実装', 'implement', 'tutorial', 'how to'],
  advanced: ['最適化', 'architecture', 'performance', 'advanced']
};
```

## タグ管理

### タグカテゴリ分類
```typescript
// lib/constants/tag-categories.ts
export const TAG_CATEGORIES = {
  'プログラミング言語': ['JavaScript', 'TypeScript', 'Python', 'Go'],
  'フレームワーク': ['React', 'Next.js', 'Vue', 'Angular'],
  'インフラ': ['AWS', 'Docker', 'Kubernetes', 'CI/CD'],
  'AI/ML': ['ChatGPT', 'Claude', 'Gemini', 'LLM'],
  // ...
};
```

### タグ正規化
```typescript
// lib/utils/tag-normalizer.ts
export function normalizeTag(tag: string): string {
  return tag
    .toLowerCase()
    .replace(/[\.\/\-_]/g, '')
    .replace(/\s+/g, '-')
    .slice(0, 30);
}
```

### タグ生成
```bash
# AI自動生成
npm run scripts:tags:generate

# Claude使用
npm run claude:tags:generate

# バッチ処理
npx tsx scripts/generate-tags-claude-batch.ts
```

## 要約品質管理

### 要約要件
- 文字数: 60-80文字（日本語）
- 形式: 1文で完結
- 内容: 記事の要点を簡潔に
- 文末: 適切な句点で終了

### 品質チェック
```typescript
// lib/utils/summary-parser.ts
export function validateSummary(summary: string): boolean {
  const length = summary.length;
  const hasProperEnding = /[。！？]$/.test(summary);
  const isWithinRange = length >= 60 && length <= 80;
  
  return hasProperEnding && isWithinRange;
}
```

### 要約再生成
```bash
# 品質の低い要約を再生成
npx tsx scripts/regenerate-low-quality-summaries.ts

# 特定ソースの要約再生成
npx tsx scripts/regenerate-speakerdeck-summaries.ts
```

## 重複検出

### URL正規化
```typescript
// lib/utils/url.ts
export function normalizeUrl(url: string): string {
  // HTTPSに統一
  url = url.replace(/^http:/, 'https:');
  // トラッキングパラメータ除去
  url = removeTrackingParams(url);
  // 末尾スラッシュ除去
  url = url.replace(/\/$/, '');
  return url;
}
```

### 重複チェック
```typescript
// lib/utils/duplicate-detection.ts
export async function checkDuplicate(url: string): Promise<boolean> {
  const normalized = normalizeUrl(url);
  const existing = await prisma.article.findUnique({
    where: { url: normalized }
  });
  return !!existing;
}
```

## 品質モニタリング

### 定期チェックスクリプト

#### 記事品質チェック
```bash
npx tsx scripts/check-article-quality.ts
```
出力:
- 平均品質スコア
- スコア分布
- 低品質記事リスト

#### 要約品質チェック
```bash
npx tsx scripts/check-missing-summaries.ts
```
出力:
- 未要約記事数
- 不適切な要約
- 再生成候補

#### タグ品質チェック
```bash
npx tsx scripts/check-tagged-articles.ts
```
出力:
- タグなし記事
- タグ数分布
- 異常タグ検出

### ダッシュボード指標
- 日別品質スコア推移
- ソース別品質分布
- タグカバレッジ率
- 要約生成率

## 品質改善アクション

### 自動改善
1. 低品質記事の自動削除（週次）
2. 要約再生成（エラー時）
3. タグ自動補完（未タグ記事）

### 手動改善
1. Claude Codeによる高品質要約
2. タグの手動調整
3. 記事タイプの修正

### 継続的改善
1. フィルタリング基準の調整
2. スコアリングアルゴリズム改善
3. AI プロンプトの最適化