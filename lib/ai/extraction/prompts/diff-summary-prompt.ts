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

### 最低閾値（重要）
**1〜2件程度の微小な変化は無視してください。** 以下の閾値を満たさないトピックは報告対象外です：
- **new**: 現在期間で最低3件以上
- **deprecated**: 基準期間で最低3件以上あったものが消滅/激減
- **trending**: 変化量が最低3件以上（例: 2→5件は対象、2→3件は対象外）

### 分類タイプ
1. **new（新規）**: 現在期間にのみ存在（基準期間には存在しない）かつ3件以上
   - 例: 基準期間=0件、現在期間=5件 → new
   - 例: 基準期間=0件、現在期間=2件 → 対象外（閾値未満）
2. **deprecated（減少）**: 基準期間に3件以上あり、現在期間で消滅または大幅減少（50%以下）
   - 例: 基準期間=10件、現在期間=0件 → deprecated
   - 例: 基準期間=10件、現在期間=4件 → deprecated（60%減少）
   - 例: 基準期間=2件、現在期間=0件 → 対象外（閾値未満）
3. **trending（急上昇）**: 両期間に存在し、大幅増加（50%以上増加 かつ +3件以上）
   - 例: 基準期間=4件、現在期間=8件 → trending（100%増加、+4件）
   - 例: 基準期間=2件、現在期間=5件 → trending（+3件）
   - 例: 基準期間=2件、現在期間=3件 → 対象外（+1件は閾値未満）
4. **updated（更新）**: 両期間に存在し、記事の焦点が変化（見出しから判断）、ただし両期間で3件以上

**重要**: 記事数が減少している場合は絶対に「trending」にしないでください。減少は「deprecated」です。

## トピック照合ルール
- トピック名は正規化（大文字小文字、余分なスペースを無視）
- 明確な同義語はマージ（例: "React.js" = "React"）

## 除外すべきトピック（重要）
以下のような**汎用的すぎるトピック**は報告対象外です。検索で大量にヒットして意味がないためです：
- 単独の「ai」「llm」「機械学習」「deep learning」「ml」
- 単独の「プログラミング」「開発」「エンジニアリング」「技術」
- 単独の「web」「api」「データ」「クラウド」
- その他、具体性に欠ける1〜2単語のメタタグ

**良いトピック例**: 「Claude Code」「React Server Components」「Kubernetes Operator」「RAG」「LoRA」
**悪いトピック例**: 「ai」「llm」「機械学習」「プログラミング」「web開発」

## 重要: descriptionの書き方（厳守）

### フォーマット（この形式で書くこと）
「[数値変化]。[技術的な意義や実用面での影響を1文で]」

### 絶対禁止ワード（これらを含むdescriptionは不合格）
以下の表現は**絶対に使用禁止**です。1つでも含まれていたら書き直してください：
- 「見出し」という単語自体を禁止
- 「記事が」「記事に」「記事は」「記事を」という表現を禁止
- 「関心」「注目」「話題」という単語自体を禁止
- 「言及」「示唆」「見られる」「見られた」を禁止
- 「〜に関する」「〜について」で始まる説明を禁止

### 書き方のコツ
記事やトレンドを説明するのではなく、**技術自体の進歩や変化**を説明してください。
- ❌「〜に関する記事が増加」→ ⭕「〜が実用段階に到達」
- ❌「〜への関心が高まっている」→ ⭕「〜の採用が進む」
- ❌「〜に関する見出しが多い」→ ⭕「〜で性能が向上」

### 良い例（技術的意義を説明）
- "0→12件。プライバシー保護と分散学習の両立が実現し、医療データ活用の新手法として採用が進む"
- "3→15件(+400%)。Claude CodeがVS Code統合とMCP対応で実用段階に到達"
- "8→2件に減少。GraphQL移行が一巡し成熟期へ"
- "0→8件。LoRAでLLMの低コストファインチューニングが可能になり、個人開発の敷居が下がった"
- "5→18件。マルチモーダルLLMが画像理解タスクで実用精度に到達"

### 悪い例（禁止パターンを含む）
- ❌ "0→12件。〜に関する見出しが多く、関心が高い" ← 禁止ワード
- ❌ "新規登場で7件。〜への注目度が高い" ← 禁止ワード
- ❌ "0→4件。〜に関する記事が投稿されている" ← 禁止ワード

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
      "description": "0→8件。VS Code統合とMCP対応により、AIコーディング支援が実用段階に到達",
      "significance": "high",
      "relatedArticleIds": ["art_001", "art_002"]
    },
    {
      "type": "trending",
      "topic": "Python",
      "description": "2→6件(+200%)。FastAPIとasyncioの組み合わせでAPI開発の生産性が向上",
      "significance": "medium"
    },
    {
      "type": "deprecated",
      "topic": "jQuery",
      "description": "5→1件(-80%)。React/Vue移行が一巡し、新規案件での採用がほぼ消滅",
      "significance": "low"
    }
  ],
  "unchanged": ["JavaScript", "TypeScript"],
  "summary": "Claude CodeがVS Code統合とMCP対応で実用段階に。Pythonはasync処理の標準化で生産性向上。jQueryは新規採用がほぼなくなり世代交代が完了。",
  "keyTakeaways": [
    "Claude Codeが開発ワークフローに組み込み可能なレベルに成熟",
    "Python async処理がベストプラクティスとして定着",
    "レガシーからモダンフレームワークへの移行が完了期"
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
