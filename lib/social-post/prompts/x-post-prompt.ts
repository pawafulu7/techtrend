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

export const X_POST_PROMPT_VERSION = 'v1.1.0';

/**
 * AI出力スキーマ
 */
export const XPostOutputSchema = z.object({
  comment: z.string().min(1).max(280),
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
  historicalArticles?: { title: string; summary: string; publishedAt: Date }[];
}): string {
  const { article, relatedTrends, recentArticles, historicalArticles } = params;

  let prompt = `
あなたは現場で働くソフトウェアエンジニアです。以下の技術記事を読んで、同僚に話すようなカジュアルな感想をX（Twitter）に投稿してください。

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

  if (historicalArticles && historicalArticles.length > 0) {
    const formatDate = (d: Date) => {
      const date = new Date(d);
      return `${date.getFullYear()}/${date.getMonth() + 1}`;
    };
    prompt += `
## 過去の関連記事（時間軸の参考に）
${historicalArticles.map((a) => `- [${formatDate(a.publishedAt)}] ${a.title}: ${a.summary.slice(0, 100)}...`).join('\n')}
`;
  }

  prompt += `
## 生成ルール

### 文体（最重要）
エンジニアが本音で呟くような文体で書く。評論家や解説者ではなく、実際に手を動かす人の視点で。

良い例:
- 「これ昨日ちょうどハマってたやつだ。設定周りがクセあるんだよな」
- 「うちでも導入検討中。移行コストどのくらいかかるんだろ」
- 「個人的にはYの方が好き。Xは学習コスト高め」
- 「へー、こんな方法あったんだ。明日試してみよ」
- 「これ知らなかった。v2からの変更点ちゃんと追えてない」
- 「Rust製か。パフォーマンス気になる」
- 「ついにXがYに対応したか。去年まではワークアラウンド必要だったのに」
- 「v2から待ってた機能だ。これでようやく本番で使える」
- 「半年前は実験的だったけど、もう安定版出たんだな」

悪い例:
- 「〜は興味深いですね」（評論家調）
- 「今後の展開に期待」（他人事）
- 「素晴らしい取り組みです」（お世辞）
- 「〜という点で重要です」（教科書調）

### 必須要件
1. 80〜120文字程度（最大280文字）
2. 記事の具体的な技術名・ツール名・数値を含める
3. 一人称視点または疑問形で書く
4. 過去の関連記事がある場合は、時間軸の変化（「以前は〜だったのに」「ついに〜できるように」）を入れると良い

### 禁止表現
- 宣伝調: 「注目」「革新的」「画期的」「必見」「話題」
- 評論調: 「興味深い」「素晴らしい」「期待」「〜ですね」「〜ですよね」
- 要約調: 「〜という点で重要」「〜に貢献」「〜を実現」

### ハッシュタグ
カテゴリに応じて1つのみ:
- frontend → #Frontend
- backend → #Backend
- ai_ml → #AI
- security → #Security
- devops → #DevOps
- その他 → #Tech

## 出力形式
{
  "comment": "生成したコメント",
  "hashtag": "#カテゴリタグ",
  "reasoning": "理由（内部用）"
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
1. 100文字程度の日本語コメント（最大280文字まで許容）
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
1. 100文字程度の日本語コメント（最大280文字まで許容）
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
      // マークダウンコードブロック内のJSONを優先的に抽出
      const codeBlockMatch = response.match(
        /```(?:json)?\s*(\{[\s\S]*?\})\s*```/
      );

      let jsonString: string | null = null;

      if (codeBlockMatch) {
        jsonString = codeBlockMatch[1];
      } else {
        // バランスブラケット抽出: 最初の { から対応する } まで
        jsonString = extractBalancedJson(response);
      }

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
