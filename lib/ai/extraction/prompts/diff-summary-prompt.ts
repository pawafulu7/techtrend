/**
 * Diff Summary Prompt
 *
 * Prompt template for detecting topic changes between periods.
 * Uses structured JSON input/output for reliable parsing.
 */

import { ExtractionConfig } from '../llm-extraction-pipeline';
import {
  DiffSummaryOutput,
  DiffSummaryOutputSchema,
  parseJSONFromLLM,
} from '../extraction-schemas';
import { getPromptVersion } from '../prompt-versions';

/**
 * Input structure for diff summary extraction
 */
export interface DiffSummaryInput {
  category: string;
  categoryName: string;
  currentPeriod: string; // ISO week format: "2026-W01"
  baselinePeriod: string; // ISO week format: "2025-W52"
  currentTopics: TopicData[];
  baselineTopics: TopicData[];
}

export interface TopicData {
  topic: string;
  count: number;
  articleIds: string[];
  headlines: string[];
}

/**
 * Validate DiffSummaryInput structure
 */
function validateDiffSummaryInput(input: unknown): DiffSummaryInput {
  if (!input || typeof input !== 'object') {
    throw new Error('Invalid input: expected an object');
  }

  const data = input as Record<string, unknown>;

  if (typeof data.category !== 'string' || !data.category) {
    throw new Error('Invalid input: category is required');
  }
  if (typeof data.categoryName !== 'string' || !data.categoryName) {
    throw new Error('Invalid input: categoryName is required');
  }
  if (typeof data.currentPeriod !== 'string' || !data.currentPeriod) {
    throw new Error('Invalid input: currentPeriod is required');
  }
  if (typeof data.baselinePeriod !== 'string' || !data.baselinePeriod) {
    throw new Error('Invalid input: baselinePeriod is required');
  }
  if (!Array.isArray(data.currentTopics)) {
    throw new Error('Invalid input: currentTopics must be an array');
  }
  if (!Array.isArray(data.baselineTopics)) {
    throw new Error('Invalid input: baselineTopics must be an array');
  }

  return data as unknown as DiffSummaryInput;
}

/**
 * Build the diff summary prompt
 */
function buildDiffSummaryPrompt(input: unknown): string {
  const data = validateDiffSummaryInput(input);

  return `あなたは技術トレンドアナリストです。2つの期間のトピック変化を分析してください。

## 入力データ
カテゴリ: ${data.category} (${data.categoryName})
現在期間: ${data.currentPeriod}
基準期間: ${data.baselinePeriod}

### 現在期間のトピック (${data.currentPeriod}):
${JSON.stringify(data.currentTopics, null, 2)}

### 基準期間のトピック (${data.baselinePeriod}):
${JSON.stringify(data.baselineTopics, null, 2)}

## 分類ルール（厳守）
以下のルールに従って、トピックを分類してください：

1. **new（新規）**: 現在期間にのみ存在（基準期間には存在しない）
   - 例: 基準期間=0件、現在期間=5件 → new
2. **deprecated（減少）**: 基準期間にのみ存在（現在期間には存在しない）、または大幅減少（50%以下）
   - 例: 基準期間=10件、現在期間=0件 → deprecated
   - 例: 基準期間=10件、現在期間=4件 → deprecated（60%減少）
3. **trending（急上昇）**: 両期間に存在し、大幅増加（50%以上増加 または +3件以上）
   - 例: 基準期間=4件、現在期間=8件 → trending（100%増加）
   - 例: 基準期間=2件、現在期間=5件 → trending（+3件）
4. **updated（更新）**: 両期間に存在し、記事の焦点が変化（見出しから判断）

**重要**: 記事数が減少している場合は絶対に「trending」にしないでください。減少は「deprecated」です。

## トピック照合ルール
- トピック名は正規化（大文字小文字、余分なスペースを無視）
- 明確な同義語はマージ（例: "React.js" = "React"）

## 重要: descriptionの必須要素
以下のルールを厳守してください：
- **数値必須**: 現在件数/基準件数/差分のいずれかを必ず含める
- **根拠必須**: headlinesから抽出した具体的なキーワードを1つ以上含める
- **NGパターン（これらは禁止）**:
  - 「〜に関するトピックが登場しました」
  - 「〜が話題です」
  - 「〜に関する記事が増加」
  - 「〜についての記事が出ました」
- **良い例**:
  - "Pythonが2→6件に増加。FastAPI/asyncio/型ヒント関連の見出しが増えた"
  - "Claude Codeの新機能発表により記事が急増（3→12件）。特にMCP連携とCLI操作に関する内容が多い"
  - "Reactが8→3件に減少。代わりにSolidJSへの移行記事が目立つ"

## 出力要件
以下のスキーマに一致する有効なJSONオブジェクトのみを出力してください：
{
  "changes": [
    {
      "type": "new" | "updated" | "deprecated" | "trending",
      "topic": "トピック名",
      "description": "変化の説明（日本語、30文字以上、数値と具体的キーワード必須）",
      "significance": "high" | "medium" | "low",
      "relatedArticleIds": ["article_id_1"] // 任意
    }
  ],
  "unchanged": ["トピック1", "トピック2"],
  "summary": "このカテゴリの全体的な変化の要約（日本語、50-500文字）",
  "keyTakeaways": ["要点1", "要点2"] // 1-5個の重要な洞察（日本語）
}

### 出力例
{
  "changes": [
    {
      "type": "new",
      "topic": "Claude Code",
      "description": "新規登場で0→8件。MCP連携、CLI操作、コード生成の見出しが多く、開発者ツールとしての注目度が高い",
      "significance": "high",
      "relatedArticleIds": ["art_001", "art_002"]
    },
    {
      "type": "trending",
      "topic": "Python",
      "description": "2→6件に増加（+200%）。FastAPIのパフォーマンス改善、asyncioベストプラクティス、型ヒント活用の記事が増えた",
      "significance": "medium"
    },
    {
      "type": "deprecated",
      "topic": "jQuery",
      "description": "5→1件に減少（-80%）。モダンフレームワークへの移行が進み、レガシー保守以外での言及がほぼなくなった",
      "significance": "low"
    }
  ],
  "unchanged": ["JavaScript", "TypeScript"],
  "summary": "今週はAI開発ツール関連の記事が急増。特にClaude Codeが新規登場し8件の記事が投稿された。Pythonも型安全性とasync処理の文脈で増加傾向。一方、jQueryは継続的に減少しており、フロントエンド技術の世代交代が進んでいる。",
  "keyTakeaways": [
    "Claude CodeがAI開発ツールとして急速に注目を集めている",
    "Pythonの型ヒントとasync処理への関心が高まっている",
    "レガシーライブラリからモダンフレームワークへの移行が加速"
  ]
}

## 重要な注意事項
- 提供されたデータのみを使用。外部知識は使用しないこと。
- 有効なJSONのみを出力。マークダウンや説明は不要。
- 全ての説明文・要約・要点は日本語で記述すること。
- 開発者に関連する技術的に重要な変化に焦点を当てること。`;
}

/**
 * Parse the LLM response into DiffSummaryOutput
 */
function parseDiffSummaryResponse(text: string): DiffSummaryOutput {
  return parseJSONFromLLM<DiffSummaryOutput>(text);
}

/**
 * Extraction configuration for diff summary
 */
export const diffSummaryConfig: ExtractionConfig<DiffSummaryOutput> = {
  schema: DiffSummaryOutputSchema,
  promptVersion: getPromptVersion('diff-summary'),
  buildPrompt: buildDiffSummaryPrompt,
  parseResponse: parseDiffSummaryResponse,
};
