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

export const X_POST_PROMPT_VERSION = 'v1.2.0';

/**
 * 共通ペルソナ定義
 */
const PERSONA = `
## ペルソナ
あなたは10年以上の経験を持つベテランSREエンジニア。
- 落ち着いた性格で、冷静に技術を評価する
- 絵文字は使わない
- 知ったかぶりせず、わからないことは「わからない」と言う
- 短く端的に、事実ベースで語る

## 語尾・トーン
- 「〜だな」「〜だ」「〜している」「〜したい」など断定・意思表明
- 「〜してみる」「〜を試す」など行動志向
- 疑問は「〜か」「〜のか」で短く

## 絶対に使わない表現
- 「〜かも」「〜かもしれない」（曖昧すぎる）
- 「気になる」「気になった」（使い古された表現）
- 「どうなんだろう」「どうだろう」（優柔不断）
- 「面白い」「面白そう」（安易な感想）
- 「〜な〜」（語尾伸ばし）
- 絵文字全般
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
以下の技術記事について、X（Twitter）用の短いコメントを生成してください。

${PERSONA}

## 記事情報
- タイトル: ${article.title}
- 要約: ${article.summary}

## 生成ルール

### 文体
記事を読んだSREエンジニアとしての所感を端的に書く。

推奨パターン（これらをそのまま使わず、記事内容に合わせて新しく書くこと）:
- バージョンアップ系: 運用観点での評価や移行の判断材料を述べる
- 新ツール系: 既存ツールとの比較や導入の現実性を述べる
- 手法紹介系: 実務での適用可能性を冷静に評価する
- 破壊的変更系: 影響範囲と対応方針を簡潔に述べる

禁止パターン:
- 経験の捏造（昨日ハマった、うちでも使ってる等）
- 評論家調（興味深いですね、期待等）
- 他人事（今後の展開に期待等）
- 疑問の羅列（〜だろうか、〜なのか、の連続）

### 必須要件
1. 80〜120文字程度（最大280文字）
2. 記事の具体的な技術名・ツール名・数値を含める
3. 断定または意思表明で締める
4. 経験・状況を捏造しない

### 禁止表現
- 宣伝調: 「注目」「革新的」「画期的」「必見」「話題」
- 評論調: 「興味深い」「素晴らしい」「期待」「〜ですね」
- 要約調: 「〜という点で重要」「〜に貢献」「〜を実現」
- 曖昧語: 「かも」「気になる」「どうなんだろう」「面白い」

## 出力形式
{
  "comment": "生成したコメント",
  "reasoning": "理由（内部用）"
}
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

  const categoryList = Object.entries(params.categories)
    .map(([k, v]) => `- ${k}: ${v}件`)
    .join('\n');

  const articleList = params.topArticles
    .map((a, i) => `${i + 1}. ${a.title}`)
    .join('\n');

  return `
本日のトレンドサマリーを基に、X投稿用のコメントを生成してください。

${PERSONA}

## ${dateStr}のトレンド
${params.summary}

## 注目記事
${articleList}

## カテゴリ分布
${categoryList}

## 生成ルール
1. 80〜120文字程度（最大280文字）
2. トレンドの傾向を冷静に分析した所感を述べる
3. 具体的なトピック名や数字を含める
4. 断定または意思表明で締める

### 禁止表現
- 宣伝調: 「注目」「革新的」「話題」「必見」
- 評論調: 「興味深い」「素晴らしい」「期待」
- 曖昧語: 「かも」「気になる」「どうなんだろう」「面白い」

## 出力形式
{
  "comment": "生成したコメント",
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
週次のトピック変化分析を基に、X投稿用のコメントを生成してください。

${PERSONA}

## カテゴリ: ${params.category}
## 期間: ${params.period}

## 上昇トピック
${risingList || '特になし'}

## 安定トピック
${unchangedList}

## 生成ルール
1. 80〜120文字程度（最大280文字）
2. 週次変化の傾向をSREの視点で分析する
3. 具体的なトピック名や数字を含める
4. 断定または意思表明で締める

### 禁止表現
- 宣伝調: 「注目」「革新的」「話題」「必見」
- 評論調: 「興味深い」「素晴らしい」「期待」
- 曖昧語: 「かも」「気になる」「どうなんだろう」「面白い」

## 出力形式
{
  "comment": "生成したコメント",
  "reasoning": "理由"
}
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
トレンドデータを見て、SREエンジニアとしての所感をX（Twitter）に投稿してください。

${PERSONA}

## 最近のトレンドトピック（${params.period}）
${topicsList || '特になし'}

## 最近の人気記事
${articlesList || '特になし'}

## 生成ルール

### 文体
トレンドを見たベテランSREとしての冷静な所感を端的に書く。

推奨パターン（これらをそのまま使わず、上記データに基づいて新しく書くこと）:
- 傾向分析系: 特定技術の記事増加傾向とその背景を推測する
- 実務関連系: 運用現場への影響や導入判断について述べる
- 技術評価系: 複数技術の組み合わせや比較について冷静に評価する
- 経験ベース系: 過去の類似トレンドとの比較や教訓を述べる

禁止パターン:
- まとめ調（本日のトレンドをご紹介、ピックアップ等）
- ニュース調（○○が注目を集めています等）
- エンゲージメント稼ぎ（皆さんはどう思いますか？等）
- 疑問の羅列（〜だろうか、〜なのか、の連続）

### 必須要件
1. 80〜120文字程度（最大280文字）
2. 上記トピックから具体的な技術名を1〜2個含める
3. 断定または意思表明で締める（〜だ、〜したい、〜してみる）
4. 経験や状況を捏造しない

### 禁止表現
- 宣伝調: 「注目」「革新的」「画期的」「必見」「話題」
- まとめ調: 「ご紹介」「まとめ」「ピックアップ」
- 評論調: 「興味深い」「素晴らしい」「期待」「〜ですね」
- 曖昧語: 「かも」「気になる」「どうなんだろう」「面白い」「〜な〜」

## 出力形式
{
  "comment": "生成したコメント",
  "reasoning": "選んだトピックと理由"
}
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
