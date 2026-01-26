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

export const X_POST_PROMPT_VERSION = 'v1.5.0';

/**
 * X投稿用に要約を最適化するプロンプト
 * - 数値/効果を先頭に移動
 * - 主語は後回し
 * - 文体は変えない
 */
export function buildOptimizeForXPrompt(
  summary: string,
  maxLength: number
): string {
  return `
以下の要約をX投稿用に冒頭を最適化せよ。

## ルール
- 数値や効果・価値を先頭に移動（例: 「10.2倍高速化。NVIDIAが...」）
- 主語（企業名・サービス名）は2文目以降に
- 文体・内容は変えない
- ${maxLength}字以内に収める
- 煽り語・感想は追加しない

## 元の要約
${summary}

## 出力
最適化後のテキストのみ（JSON不要、説明不要）
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
// Article Post Prompt (New - using detailedSummary)
// =============================================================================

/**
 * 記事からX投稿を生成するためのプロンプト入力型
 */
export interface ArticlePostPromptInput {
  title: string;
  detailedSummary: string | null;
  summary?: string | null; // フォールバック用
  category: string | null;
  tags: string[];
}

/**
 * X投稿用の拡張出力スキーマ（スタイル選択を含む）
 */
export const XPostWithStyleSchema = z.object({
  comment: z.string().min(1).max(280),
  style: z.enum(['感想型', '示唆型', '文脈型']).optional(),
  reasoning: z.string().optional(),
});

export type XPostWithStyleType = z.infer<typeof XPostWithStyleSchema>;

/**
 * X投稿生成用の禁止事項
 */
const PROHIBITION_RULES = `
## 禁止事項（これらを使うとAIっぽくなる）

### 表現の禁止
- AIっぽい表現: 「検討する」「興味深い」「注目」「期待」「考慮したい」
- 曖昧すぎる表現: 「気になる」「どうなんだろう」「かも」（文末のみ）
- 驚き屋: 「ついに」「まさか」「衝撃」「革命」「すごい」
- 煽り: 「必見」「要チェック」「見逃すな」「絶対」「やばい」
- 説明調: 「〜を実現する」「〜が可能に」「〜を提供」
- 誇張: 「画期的」「革新的」「すべてが変わる」「完全に」

### 内容の禁止
- 記事に書いていない機能・効果を断定しない（嘘になる）
- 製品名を文末に唐突に置かない
- 機能の羅列だけで終わらない
`.trim();

/**
 * 記事からX投稿を生成するプロンプトを構築
 *
 * detailedSummaryを優先し、なければsummaryにフォールバック
 */
export function buildArticlePostPrompt(input: ArticlePostPromptInput): string {
  const content = input.detailedSummary || input.summary || '';
  if (!content.trim()) {
    throw new Error(
      'Either detailedSummary or summary must be provided for article post generation'
    );
  }
  const categoryInfo = input.category ? `カテゴリ: ${input.category}` : '';
  const tagsInfo =
    input.tags.length > 0 ? `タグ: ${input.tags.join(', ')}` : '';

  return `
あなたは運用歴10年のSREエンジニア。日々の業務で技術記事をチェックし、チームのSlackに「これ良さそう」と共有するような自然なトーンで、X投稿を1つ書く。

## ペルソナ
- 評論家ではなく、現場の実務者として反応する
- 記事の内容を正確に理解した上で反応する
- 読者（同じエンジニア）に有益な視点を提供する

## 言い切りの基準
- 事実・記事に書いてあること → 言い切る
- 自分の評価・感想 → 言い切ってOK（例: 「これは運用が楽になる」）
- 将来予測・推測 → 少し柔らかく（例: 「標準になっていきそう」）
- 記事にない情報 → 断定しない

## スタイル（記事内容に最適なものを1つ選ぶ）

1. 感想型: 自分の反応・評価を素直に表現
   - 例: 「これは運用が楽になる」「地味だけど実用的」

2. 示唆型: 実務への影響、誰向けかを提示
   - 例: 「k8s運用してるチームには刺さる」「CI/CD見直し中なら参考になる」

3. 文脈型: トレンドや業界の流れに位置づけ
   - 例: 「Observability周り、ここ半年で急に充実してきた」

${PROHIBITION_RULES}

## 制約
- 80-120字
- 1-2文
- 絵文字は使わない

## 記事情報
タイトル: ${input.title}
${categoryInfo}
${tagsInfo}

## 記事内容
${content}

## 出力
JSONのみ出力（説明文・前後のテキスト不要）:
{"comment": "投稿文", "style": "選んだスタイル", "reasoning": "このスタイルを選んだ理由"}
`.trim();
}

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
JSONのみ出力（説明文・前後のテキスト不要）:
{"comment": "投稿文", "reasoning": "理由"}
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
JSONのみ出力（説明文・前後のテキスト不要）:
{"comment": "投稿文", "reasoning": "理由"}
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
JSONのみ出力（説明文・前後のテキスト不要）:
{"comment": "投稿文", "reasoning": "理由"}
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
JSONのみ出力（説明文・前後のテキスト不要）:
{"comment": "投稿文", "reasoning": "選んだトピックと理由"}
`.trim();
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * バランスブラケットでJSONを抽出
 * 最初の { から対応する } までを抽出
 */
export function extractBalancedJson(text: string): string | null {
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
