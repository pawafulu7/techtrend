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
  DIFF_DESCRIPTION_BANNED_TERMS_HINT,
  parseJSONFromLLM,
} from '../extraction-schemas';
import { getPromptVersion } from '../prompt-versions';
import { classifyTopics, normalizeTopic } from '../topic-classifier';

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

  const { classified, updateCandidates, unchanged } = classifyTopics(
    data.currentTopics,
    data.baselineTopics
  );

  return `あなたは技術トレンドアナリストです。2つの期間のトピック変化を説明してください。

## 入力データ
カテゴリ: ${data.category} (${data.categoryName})
現在期間: ${data.currentPeriod}
基準期間: ${data.baselinePeriod}

## 分類済みトピック
閾値判定・汎用トピックの除外・type の決定は算出済みです。
**type を再判定しないでください。** 下記の値をそのまま使ってください。

${JSON.stringify(classified, null, 2)}

## 更新候補（あなたが判断する部分）
両期間に十分な件数があるトピックです。
見出しを読み、記事の焦点が変化していれば type="updated" として changes に含めてください。
変化していなければ changes に入れず、unchanged に残してください。

${JSON.stringify(updateCandidates, null, 2)}

## 変化なしと判定済みのトピック
${JSON.stringify(unchanged)}

## あなたの仕事
1. classified の各トピックに description と significance を付ける
2. updateCandidates から updated を選び、同様に description と significance を付ける
3. カテゴリ全体の summary と keyTakeaways を書く

## 重要: descriptionの書き方（厳守）

### フォーマット（この形式で書くこと）
「[数値変化]。[技術的な意義や実用面での影響を1文で]」

### 使用しない語
次の語を含む description はスキーマ検証で弾かれます（自動で再生成されます）:
${DIFF_DESCRIPTION_BANNED_TERMS_HINT}
また「〜に関する」「〜について」で始めないこと。

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
- 開発者に関連する技術的に重要な変化に焦点を当てること。
- changes の type と topic は分類済みの値をそのまま使うこと。件数の再計算は不要。
- unchanged には「変化なしと判定済みのトピック」に、updated にしなかった更新候補を足したものを入れること。`;
}

/**
 * Parse the LLM response into DiffSummaryOutput
 */
function parseDiffSummaryResponse(
  text: string,
  input: unknown
): DiffSummaryOutput {
  const raw = parseJSONFromLLM<DiffSummaryOutput>(text);
  const data = validateDiffSummaryInput(input);
  const { classified, updateCandidates, unchanged } = classifyTopics(
    data.currentTopics,
    data.baselineTopics
  );

  // LLM が書いた description / significance だけを採用し、
  // topic と type はコード側の分類で上書きする。
  // プロンプトで「再判定しないこと」と指示しても保証にはならないため、
  // ここで機械的に突き合わせる。
  const byTopic = new Map(
    raw.changes?.map((c) => [normalizeTopic(c.topic), c]) ?? []
  );

  const changes: DiffSummaryOutput['changes'] = [];

  for (const t of classified) {
    const written = byTopic.get(normalizeTopic(t.topic));
    if (!written) {
      // LLM が落としたトピックは description を書けないので採用しない。
      // 件数の事実は unchanged 側には入れず、欠落として扱う。
      continue;
    }
    changes.push({
      ...written,
      topic: t.topic,
      type: t.type,
    });
  }

  // updated は候補集合の中からのみ許可する
  // （分類にも候補にも無いトピックを LLM が足していた場合は、
  //   どちらのループにも入らないため自動的に捨てられる）
  const acceptedUpdates = new Set<string>();
  for (const c of updateCandidates) {
    const key = normalizeTopic(c.topic);
    const written = byTopic.get(key);
    if (written && written.type === 'updated') {
      changes.push({ ...written, topic: c.topic, type: 'updated' });
      acceptedUpdates.add(key);
    }
  }

  // updated にならなかった候補は unchanged に回す
  const unchangedTopics = [
    ...unchanged,
    ...updateCandidates
      .filter((c) => !acceptedUpdates.has(normalizeTopic(c.topic)))
      .map((c) => c.topic),
  ];

  return {
    ...raw,
    changes,
    unchanged: unchangedTopics,
  };
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
