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
  OpinionForPrompt,
} from '../types';

// =============================================================================
// Constants
// =============================================================================

export const X_POST_PROMPT_VERSION = 'v1.4.0';

/**
 * 短縮専用プロンプト（文体変換なし）
 */
export function buildShortenPrompt(text: string, maxLength: number): string {
  return `
以下のテキストを${maxLength}字以内に短縮せよ。
- 文体は変えない
- 意味を保つ
- 省略可能な修飾語を削る

テキスト: ${text}

出力: 短縮後のテキストのみ（JSON不要）
`.trim();
}

/**
 * 共通制約（シンプル版）
 */
const CONSTRAINTS = `
## 制約
- 80-120字、1-2文
- 1事実+1反応のみ
- 絵文字は使わない

## 禁止（これを使うとAIっぽくなる）
- 次にやることの宣言:「検討する」「評価してみる」「試してみる」「確認したい」
- 曖昧語:「考慮したい点」「気になる」「どうなんだろう」「かも」
- 評論調:「興味深い」「注目」「期待」
`.trim();

/**
 * AI出力スキーマ
 */
export const XPostOutputSchema = z.object({
  comment: z.string().min(1).max(280),
  reasoning: z.string().optional(),
});

export type XPostOutputType = z.infer<typeof XPostOutputSchema>;

// =============================================================================
// Article Prompt
// =============================================================================

/**
 * 記事投稿用プロンプト構築
 */
export function buildArticlePrompt(params: {
  article: ArticleForPrompt;
}): string {
  const { article } = params;

  return `
あなたは運用に強いエンジニア。以下の記事からX投稿を1つ書く。

${CONSTRAINTS}

## 良い例
- 「Grafanaの新アラート統合、運用の手間が減りそう。設定の見通しが良くなるのは助かる。」
- 「RDSの自動スケーリング改善、負荷ピーク時の安定化に効きそう。運用側としては嬉しい。」
- 「Next.js 15のキャッシュ周り、設定がシンプルになった。移行コスト低めで済みそう。」

## 記事
タイトル: ${article.title}
要約: ${article.summary}

## 出力
JSON形式: {"comment": "投稿文", "reasoning": "理由"}
`.trim();
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

  const articleList = params.topArticles
    .map((a, i) => `${i + 1}. ${a.title}`)
    .join('\n');

  return `
あなたは運用に強いエンジニア。本日のトレンドからX投稿を1つ書く。

${CONSTRAINTS}

## 良い例
- 「今週はObservability関連の記事が多い。運用の可視化、どこも課題なんだな。」
- 「AI系とインフラ系が同時に盛り上がってる。MLOpsの需要が増えてる証拠か。」

## ${dateStr}のトレンド
${params.summary}

## 注目記事
${articleList}

## 出力
JSON形式: {"comment": "投稿文", "reasoning": "理由"}
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

  return `
あなたは運用に強いエンジニア。週次のトピック変化からX投稿を1つ書く。

${CONSTRAINTS}

## 良い例
- 「Kubernetes関連が先週比+30%。コンテナ運用の標準化、まだ進行中なんだな。」
- 「セキュリティ系トピックが急上昇。最近のインシデント報道の影響か。」

## カテゴリ: ${params.category}
## 期間: ${params.period}

## 上昇トピック
${risingList || '特になし'}

## 出力
JSON形式: {"comment": "投稿文", "reasoning": "理由"}
`.trim();
}

// =============================================================================
// Opinion Prompt
// =============================================================================

/**
 * Opinion投稿用プロンプト構築（トレンド分析ベースの感想・意見）
 */
export function buildOpinionPrompt(params: OpinionForPrompt): string {
  const topicsList = params.trendingTopics
    .slice(0, 5)
    .map(
      (t) =>
        `- ${t.topic}（${t.count}件${t.category ? `、${t.category}` : ''}）`
    )
    .join('\n');

  const articlesList = params.recentArticles
    .slice(0, 5)
    .map((a) => `- ${a.title}（${a.category}）`)
    .join('\n');

  return `
あなたは運用に強いエンジニア。トレンドデータを見てX投稿を1つ書く。

${CONSTRAINTS}

## 良い例
- 「LLM関連の記事が急に増えた。プロダクション投入が本格化してきた感じがする。」
- 「Terraformとk8s、セットで語られることが多くなった。IaCの標準構成が固まりつつあるな。」
- 「障害報告系の記事が目立つ週だった。他社事例、勉強になる。」

## トレンドトピック（${params.period}）
${topicsList || '特になし'}

## 人気記事
${articlesList || '特になし'}

## 出力
JSON形式: {"comment": "投稿文", "reasoning": "選んだトピックと理由"}
`.trim();
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * バランスブラケットでJSONを抽出
 * 最初の { から対応する } までを抽出
 */
function extractBalancedJson(text: string): string | null {
  const startIndex = text.indexOf('{');
  if (startIndex === -1) return null;

  let depth = 0;
  let inString = false;
  let escapeNext = false;

  for (let i = startIndex; i < text.length; i++) {
    const char = text[i];

    if (escapeNext) {
      escapeNext = false;
      continue;
    }

    if (char === '\\' && inString) {
      escapeNext = true;
      continue;
    }

    if (char === '"') {
      inString = !inString;
      continue;
    }

    if (!inString) {
      if (char === '{') {
        depth++;
      } else if (char === '}') {
        depth--;
        if (depth === 0) {
          return text.slice(startIndex, i + 1);
        }
      }
    }
  }

  return null;
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
      // コードブロックを検出して内容を抽出
      const codeBlockMatch = response.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
      const textToExtract = codeBlockMatch ? codeBlockMatch[1] : response;

      // バランスブラケット抽出（ネストJSONにも対応）
      const jsonString = extractBalancedJson(textToExtract);

      if (!jsonString) {
        throw new Error('No JSON found in response');
      }

      // JSON解析（エラーハンドリング付き）
      let parsed: unknown;
      try {
        parsed = JSON.parse(jsonString);
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
