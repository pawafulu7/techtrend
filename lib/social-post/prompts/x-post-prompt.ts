/**
 * X Post Prompt Builder
 *
 * X（Twitter）投稿用コンテンツ生成プロンプト
 */

import { z } from 'zod';
import type {
  ArticleForPrompt,
  DailyTrendForPrompt,
  DiffSummaryForPrompt,
} from '../types';

// =============================================================================
// Constants
// =============================================================================

export const X_POST_PROMPT_VERSION = 'v1.0.0';

/**
 * AI出力スキーマ
 */
export const XPostOutputSchema = z.object({
  comment: z.string().min(1).max(300),
  hashtag: z.string().regex(/^#[\w\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF]+$/),
  reasoning: z.string().optional(),
});

export type XPostOutputType = z.infer<typeof XPostOutputSchema>;

// =============================================================================
// Category to Hashtag Mapping
// =============================================================================

const CATEGORY_HASHTAG_MAP: Record<string, string> = {
  frontend: '#Frontend',
  backend: '#Backend',
  ai_ml: '#AI',
  security: '#Security',
  devops: '#DevOps',
  database: '#Database',
  mobile: '#Mobile',
  web3: '#Web3',
  design: '#Design',
  testing: '#Testing',
  performance: '#Performance',
  architecture: '#Architecture',
  cloud: '#Cloud',
  api: '#API',
  typescript: '#TypeScript',
  javascript: '#JavaScript',
  python: '#Python',
  rust: '#Rust',
  go: '#Go',
};

/**
 * カテゴリからハッシュタグを取得
 */
export function getCategoryHashtag(
  category: string | null | undefined
): string {
  if (!category) return '#Tech';
  return CATEGORY_HASHTAG_MAP[category.toLowerCase()] || '#Tech';
}

// =============================================================================
// Article Prompt
// =============================================================================

/**
 * 記事投稿用プロンプト構築
 */
export function buildArticlePrompt(params: {
  article: ArticleForPrompt;
  relatedTrends?: string[];
  recentArticles?: string[];
}): string {
  const { article, relatedTrends, recentArticles } = params;

  let prompt = `
あなたは技術トレンドに詳しいエンジニアです。以下の技術記事について、X（Twitter）投稿用のコメントを生成してください。

## 記事情報
- タイトル: ${article.title}
- 要約: ${article.summary}
- カテゴリ: ${article.category}
`;

  if (relatedTrends && relatedTrends.length > 0) {
    prompt += `
## 最近のトレンド
${relatedTrends.map((t) => `- ${t}`).join('\n')}
`;
  }

  if (recentArticles && recentArticles.length > 0) {
    prompt += `
## 同カテゴリの最近の記事
${recentArticles.map((a) => `- ${a}`).join('\n')}
`;
  }

  prompt += `
## 生成ルール

### 必須要件
1. 100文字程度の日本語コメント
2. 記事の具体的な事実・数値・固有名詞を1つ以上含める
3. 単なる要約ではなく、技術者として価値ある視点を提供する

### 価値ある視点の例
- 技術的トレードオフ（「Xは速いがYとの両立が課題」）
- 適用場面の具体化（「大規模システムの移行時に有効」）
- 運用上の落とし穴（「本番導入前にZの検証が必要」）
- 他技術との比較（「従来のAと比べてBの点で優位」）

### 禁止表現
以下の汎用的・宣伝的な表現は使用禁止:
- 「注目」「革新的」「画期的」「必見」「話題」「すごい」「やばい」

### ハッシュタグ
カテゴリに応じて1つのみ選択:
- frontend → #Frontend
- backend → #Backend
- ai_ml → #AI
- security → #Security
- devops → #DevOps
- その他 → #Tech

## 出力形式
以下のJSON形式で出力してください:
{
  "comment": "生成したコメント（100文字程度）",
  "hashtag": "#カテゴリタグ",
  "reasoning": "このコメントを選んだ理由（内部確認用、投稿には使用しない）"
}
`;

  return prompt.trim();
}

// =============================================================================
// Daily Trend Prompt
// =============================================================================

/**
 * Daily Trend投稿用プロンプト構築
 */
export function buildDailyTrendPrompt(params: DailyTrendForPrompt): string {
  const dateStr = params.period.toLocaleDateString('ja-JP', {
    month: 'long',
    day: 'numeric',
  });

  const categoryList = Object.entries(params.categories)
    .map(([k, v]) => `- ${k}: ${v}件`)
    .join('\n');

  const articleList = params.topArticles
    .map((a, i) => `${i + 1}. ${a.title}`)
    .join('\n');

  return `
あなたは技術トレンドアナリストです。本日のトレンドサマリーを基に、X投稿用のコメントを生成してください。

## ${dateStr}のトレンド
${params.summary}

## 注目記事
${articleList}

## カテゴリ分布
${categoryList}

## 生成ルール
1. 100文字程度の日本語コメント
2. 「今日の技術トレンド」として価値ある洞察を提供
3. 具体的なトピック名や数字を含める
4. 禁止表現: 「注目」「革新的」「話題」

## 出力形式
{
  "comment": "生成したコメント",
  "hashtag": "#TechTrend",
  "reasoning": "理由"
}
`.trim();
}

// =============================================================================
// Diff Summary Prompt
// =============================================================================

/**
 * Diff Summary投稿用プロンプト構築
 */
export function buildDiffSummaryPrompt(params: DiffSummaryForPrompt): string {
  const risingList = params.risingTopics
    .map((t) => `- ${t.topic} (+${t.change}%)`)
    .join('\n');

  const unchangedList =
    params.unchanged.length > 0
      ? params.unchanged.slice(0, 3).join(', ')
      : '特になし';

  return `
あなたは技術トレンドアナリストです。週次のトピック変化分析を基に、X投稿用のコメントを生成してください。

## カテゴリ: ${params.category}
## 期間: ${params.period}

## 上昇トピック
${risingList || '特になし'}

## 安定トピック
${unchangedList}

## 生成ルール
1. 100文字程度の日本語コメント
2. 週次変化の観点から価値ある洞察を提供
3. 具体的なトピック名や数字を含める
4. 禁止表現: 「注目」「革新的」「話題」

## 出力形式
{
  "comment": "生成したコメント",
  "hashtag": "${getCategoryHashtag(params.category)}",
  "reasoning": "理由"
}
`.trim();
}

// =============================================================================
// Extraction Config
// =============================================================================

/**
 * LLMExtractionPipeline用のExtractionConfig
 */
export function createXPostExtractionConfig() {
  return {
    promptVersion: X_POST_PROMPT_VERSION,
    schema: XPostOutputSchema,
    buildPrompt: (input: unknown) => String(input),
    parseResponse: (response: string): XPostOutputType => {
      // マークダウンコードブロック内のJSONを優先的に抽出
      const codeBlockMatch = response.match(
        /```(?:json)?\s*(\{[\s\S]*?\})\s*```/
      );
      // コードブロックがなければ貪欲マッチングで完全なJSONオブジェクトを取得
      const jsonMatch = codeBlockMatch
        ? [codeBlockMatch[1]]
        : response.match(/\{[\s\S]*\}/);

      if (!jsonMatch) {
        throw new Error('No JSON found in response');
      }

      // JSON解析（エラーハンドリング付き）
      let parsed: unknown;
      try {
        parsed = JSON.parse(jsonMatch[0]);
      } catch (e) {
        throw new Error(
          `Invalid JSON in response: ${e instanceof Error ? e.message : String(e)}`
        );
      }

      // スキーマ検証
      const result = XPostOutputSchema.safeParse(parsed);
      if (!result.success) {
        throw new Error(
          `Schema validation failed: ${result.error.errors.map((e) => e.message).join(', ')}`
        );
      }

      return result.data;
    },
  };
}
