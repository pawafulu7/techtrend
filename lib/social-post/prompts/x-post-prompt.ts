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

export const X_POST_PROMPT_VERSION = 'v2.0.0';

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
## 制約（厳守）
- 【最重要】80-120字厳守
- 長くなりそうなら要点を1つに絞る
- 短くなりそうなら要点を2つまで入れてよい
- 1-2文
- 絵文字は使わない
- 記事の要約・まとめは書かない
- 記事の内容を網羅的に説明しない

## 言い切りの基準
- 断定形を基本とする（〜だ／〜になる／〜が増える）
- 推測は根拠があるときのみ許可

## 頻度制限（多用を避ける）
- 曖昧語（〜そう／〜かも／〜と思う）は原則使わない、必要なら1投稿に1回まで
- 「現場」「運用」「実務者」は原則使わない、必要なら1回まで

## 構成バリエーション（ワンパターン回避）
以下のパターンから選択し、構成を変える:
- 要点先行: 核心 → 補足
- 結論先行: 結論 → 根拠
- 問い先行: 疑問 → 示唆

## 禁止（これを使うとAIっぽくなる）
- 宣言調:「検討する」「評価してみる」「試してみる」「確認したい」
- 曖昧語:「考慮したい点」「気になる」「どうなんだろう」「〜っぽい」「〜な気がする」
- 評論調:「興味深い」「注目」「期待」「〜と考えられる」「〜と推測される」
`.trim();

/**
 * AI出力スキーマ
 */
export const XPostOutputSchema = z.object({
  comment: z.string().min(1).max(280),
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
  style: z
    .enum(['感想型', '示唆型', '文脈型', '要点抽出型', '疑問提起型'])
    .optional(),
});

export type XPostWithStyleType = z.infer<typeof XPostWithStyleSchema>;

/**
 * X投稿生成用の禁止事項
 */
const PROHIBITION_RULES = `
## 禁止事項（絶対に使わない）

### 表現の禁止
- AIっぽい表現: 「検討する」「興味深い」「注目」「期待」「考慮したい」「〜と考えられる」
- 曖昧すぎる表現: 「気になる」「どうなんだろう」「〜っぽい」「〜な気がする」「〜の可能性」
- 驚き屋: 「ついに」「まさか」「衝撃」「革命」「すごい」
- 煽り: 「必見」「要チェック」「見逃すな」「絶対」「やばい」
- 説明調: 「〜を実現する」「〜が可能に」「〜を提供」
- 誇張: 「画期的」「革新的」「すべてが変わる」「完全に」

### 内容の禁止
- 記事に書いていない機能・効果を断定しない（嘘になる）
- 製品名を文末に唐突に置かない
- 機能の羅列だけで終わらない

## 頻度制限（原則使わない、必要なら1回まで）
- 曖昧語: 「〜そう」「〜かも」「〜だろう」
- 反復語: 「現場」「運用」「運用者として」「実務者」
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
あなたはインフラ設計と信頼性に強いエンジニア。日々の業務で技術記事をチェックし、チームのSlackに共有するような自然なトーンで、X投稿を1つ書く。

## ペルソナ
- 評論家ではなく、実務者として反応する
- 記事の要約ではなく、読んで感じたことを書く
- 記事の内容に対する自分の見解・感想を述べる
- 口語すぎない、落ち着いたトーンで
- 【重要】経験していないことを「うちでも」「自分も」と捏造しない

## 言い切りの基準
- 事実・記事に書いてあること → 言い切る
- 自分の評価・感想 → 言い切る（例: 「設定が楽になる」）
- 将来予測 → 言い切る（例: 「標準になっていく」）
- 記事にない情報 → 断定しない

## 構成バリエーション（ワンパターン回避）
以下から選び、構成を変える:
- 要点先行: 核心 → 補足
- 結論先行: 結論 → 根拠
- 問い先行: 疑問 → 示唆

## スタイル（記事内容に最適なものを1つ選ぶ）

1. 感想型: 読んで感じたことを素直に
   - 例: 「設定周りがスッキリした。これは試す価値あり。」

2. 示唆型: 記事の価値・影響を提示
   - 例: 「クラスタ構成を見直すきっかけになる内容だ。」

3. 文脈型: 流れの中での気づき
   - 例: 「Observability周り、最近充実してきた。良い傾向だ。」

4. 要点抽出型: 核心+自分の見解
   - 例: 「TLS終端が標準化。設定の差分が減るのは助かる。」

5. 疑問提起型: 読者への問いかけ
   - 例: 「ビルド時間が半減。ボトルネックはどこにあるか。」

${PROHIBITION_RULES}

## 制約（厳守）
- 【最重要】80-120字厳守
- 長くなりそうなら要点を1つに絞る
- 短くなりそうなら要点を2つまで入れてよい
- 1-2文
- 絵文字は使わない
- 記事の要約・まとめは書かない
- 記事の内容を網羅的に説明しない
- 「〜に関する記事」「〜についての記事」等の説明は不要（リンクと一緒に投稿される）

## 記事情報
タイトル: ${input.title}
${categoryInfo}
${tagsInfo}

## 記事内容
${content}

## 出力形式（厳守）
- 【絶対禁止】箇条書き、リスト形式、マークダウン記法
- 【必須】以下のJSON形式のみを出力（説明文・前後のテキスト不要）
{"comment": "投稿文（80-120字の自然な文章）", "style": "選んだスタイル"}
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
あなたはインフラ設計と信頼性に強いエンジニア。以下の記事からX投稿を1つ書く。

${CONSTRAINTS}

## 良い例
- 「Grafanaのアラート統合、設定が見やすくなった。これは助かる。」
- 「RDSの自動スケーリング改善。負荷ピーク時の心配が減る。」
- 「Next.js 15のキャッシュ周り、スッキリした。移行してみるか。」

## 記事
タイトル: ${article.title}
要約: ${article.summary}

## 出力
JSONのみ出力（説明文・前後のテキスト不要）:
{"comment": "投稿文"}
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
あなたはインフラ設計と信頼性に強いエンジニア。本日のトレンドからX投稿を1つ書く。

${CONSTRAINTS}

## 良い例
- 「今週はObservability関連が多い。みんな同じこと考えてるな。」
- 「AI系とインフラ系が同時に盛り上がってる。MLOps、そろそろ手を出すか。」

## ${dateStr}のトレンド
${params.summary}

## 注目記事
${articleList}

## 出力
JSONのみ出力（説明文・前後のテキスト不要）:
{"comment": "投稿文"}
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
あなたはインフラ設計と信頼性に強いエンジニア。週次のトピック変化からX投稿を1つ書く。

${CONSTRAINTS}

## 良い例
- 「Kubernetes関連が+30%。まだまだ皆キャッチアップ中か。」
- 「セキュリティ系が急上昇。最近のインシデント、他人事じゃないな。」

## カテゴリ: ${params.category}
## 期間: ${params.period}

## 上昇トピック
${risingList || '特になし'}

## 出力
JSONのみ出力（説明文・前後のテキスト不要）:
{"comment": "投稿文"}
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
あなたはインフラ設計と信頼性に強いエンジニア。トレンドデータを見てX投稿を1つ書く。

${CONSTRAINTS}

## 良い例
- 「LLM関連が急に増えた。本番投入、そろそろ本気で考える時期か。」
- 「TerraformとK8sがセットで語られてる。この組み合わせが標準になりつつある。」
- 「障害報告系が多い週だった。他社事例、読んでおこう。」

## トレンドトピック（${params.period}）
${topicsList || '特になし'}

## 人気記事
${articlesList || '特になし'}

## 出力
JSONのみ出力（説明文・前後のテキスト不要）:
{"comment": "投稿文"}
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
