import { SummaryProviderInput } from './summary-provider.interface';

const SYSTEM_INSTRUCTIONS = `
あなたは技術記事の要約を生成する専門AIです。以下のルールを厳守してください：

【一覧要約ルール（summaryフィールド）】
- 150-250文字で記事の核心を端的に表現する
- 技術的価値を明確に示す
- 技術用語は略称を活用（JavaScript→JS、TypeScript→TS等）
- 必ず完結した文で終了（体言止めは避ける）
- 冗長な表現は避ける

【詳細要約ルール（detailedSummaryItemsフィールド）】
- 実際の記事内容のみを書く（存在しない情報を追加しない）
- 各項目のtitleは記事の内容を具体的に表すものにする
  - 禁止: 「技術概要」「詳細」「背景」「概要」「実装」「効果」等の汎用名
  - 良い例: 「GPSの進化と位置情報共有の普及」「Rustの型システムによるメモリ安全性」
- 各項目のcontentは十分な情報量を持つこと（1文だけの薄い項目は禁止）
  - 最低2-3文、または複数の具体的な情報を含む
  - 関連する内容は1つの項目に統合する

【タグ正規化ルール】
AI/LLM関連:
- Claude系（Claude Code、ClaudeCode、Claude Sonnet等）→ "Claude"
- GPT系（GPT-4、GPT-5、ChatGPT等）→ "GPT"
- OpenAI系 → "OpenAI"
- Gemini系（Google Gemini、Gemini API等）→ "Gemini"
- LLM/LLMs → "LLM"
- 生成AI/GenAI/Generative AI → "AI"

プログラミング言語:
- JavaScript/JS → "JavaScript"
- TypeScript/TS → "TypeScript"
- Python2/Python3 → "Python"
- Golang → "Go"

フレームワーク:
- React.js/ReactJS → "React"
- Vue.js/VueJS → "Vue.js"
- Node.js/NodeJS → "Node.js"
- Next.js/NextJS → "Next.js"
- Ruby on Rails/RoR → "Ruby on Rails"

クラウド:
- Amazon Web Services → "AWS"
- Google Cloud Platform/GCP → "GCP"
- Microsoft Azure → "Azure"

データベース:
- PostgreSQL/Postgres → "PostgreSQL"
- MySQL/MariaDB → "MySQL"
- MongoDB/Mongo → "MongoDB"
`;

const METADATA_WARNING =
  'IMPORTANT: The above metadata is for your reference only. Never include it in your output.';

export class PromptBuilder {
  buildPrompt(input: SummaryProviderInput): string {
    const maxContentLength = 150000;
    const truncatedContent =
      input.content.length > maxContentLength
        ? input.content.substring(0, maxContentLength) + '\n\n...[truncated]'
        : input.content;

    const itemCountInstruction = this.buildItemCountInstruction(
      input.content.length,
      input.constraints.detailPolicy
    );

    const toneGuidance = this.buildToneGuidance(input.tone);
    const articleTypeGuidance = this.buildArticleTypeGuidance(
      input.articleType
    );

    return `${SYSTEM_INSTRUCTIONS}${itemCountInstruction}${toneGuidance}${articleTypeGuidance}

<<<ARTICLE_START>>>
タイトル: ${input.title}
内容: ${truncatedContent}
<<<ARTICLE_END>>>
`;
  }

  private buildItemCountInstruction(
    contentLength: number,
    policy: 'short' | 'medium' | 'long'
  ): string {
    if (contentLength < 400) {
      return `

Article is ${contentLength} characters (very short).
Set detailedSummaryItems to an empty array [].
Focus only on writing a good summary field.
${METADATA_WARNING}`;
    }

    const policyMultiplier =
      policy === 'long' ? 1.2 : policy === 'short' ? 0.8 : 1.0;

    if (contentLength >= 10000) {
      const minItems = Math.max(7, Math.floor(7 * policyMultiplier));
      const maxItems = Math.max(minItems, Math.floor(9 * policyMultiplier));
      return `

Article is ${contentLength} characters (very long).
detailedSummaryItems: ${minItems}-${maxItems} items.
Each item's content: 120-180 characters with specific details (versions, metrics, dates, commands).
TOTAL detailedSummaryItems length MUST NOT exceed 1500 characters. Prioritize item count over item length.
${METADATA_WARNING}`;
    } else if (contentLength >= 5000) {
      const minItems = Math.max(5, Math.floor(5 * policyMultiplier));
      const maxItems = Math.max(minItems, Math.floor(7 * policyMultiplier));
      return `

Article is ${contentLength} characters (long).
detailedSummaryItems: ${minItems}-${maxItems} items.
Each item's content: 120-200 characters with concrete details.
TOTAL detailedSummaryItems length MUST NOT exceed 1200 characters. Prioritize total limit over per-item length.
${METADATA_WARNING}`;
    } else if (contentLength >= 3000) {
      const minItems = Math.max(4, Math.floor(4 * policyMultiplier));
      const maxItems = Math.max(minItems, Math.floor(5 * policyMultiplier));
      return `

Article is ${contentLength} characters.
detailedSummaryItems: ${minItems}-${maxItems} items.
Each item's content: 150-200 characters.
TOTAL detailedSummaryItems length MUST NOT exceed 1000 characters. Prioritize total limit over per-item length.
${METADATA_WARNING}`;
    } else if (contentLength >= 1000) {
      const minItems = Math.max(3, Math.floor(3 * policyMultiplier));
      const maxItems = Math.max(minItems, Math.floor(4 * policyMultiplier));
      return `

Article is ${contentLength} characters.
detailedSummaryItems: ${minItems}-${maxItems} items.
Each item's content: 130-175 characters.
TOTAL detailedSummaryItems length MUST NOT exceed 700 characters. Prioritize total limit over per-item length.
${METADATA_WARNING}`;
    } else {
      // 400-999 characters
      const minItems = Math.max(2, Math.floor(2 * policyMultiplier));
      const maxItems = Math.max(minItems, Math.floor(3 * policyMultiplier));
      return `

Article is ${contentLength} characters (short).
detailedSummaryItems: ${minItems}-${maxItems} items.
Each item's content: 80-200 characters.
TOTAL detailedSummaryItems length MUST NOT exceed 600 characters. Prioritize total limit over per-item length.
${METADATA_WARNING}`;
    }
  }

  private buildToneGuidance(tone?: 'formal' | 'casual'): string {
    if (!tone) {
      return '';
    }

    if (tone === 'formal') {
      return '\n\nTone: formal. Use professional language and precise terminology.';
    } else {
      return '\n\nTone: casual. Use approachable and friendly language.';
    }
  }

  private buildArticleTypeGuidance(
    articleType?: 'technical' | 'news' | 'tutorial' | 'opinion'
  ): string {
    if (!articleType) {
      return '';
    }

    const typeGuidance: Record<string, string> = {
      technical:
        '\n\nArticle type: technical. Focus on implementation details, specifications, and performance characteristics.',
      news: '\n\nArticle type: news. Focus on announcements, new features, impact, and future outlook.',
      tutorial:
        '\n\nArticle type: tutorial. Focus on steps, implementation methods, code examples, and caveats.',
      opinion:
        "\n\nArticle type: opinion. Focus on the author's perspective, pros/cons, and recommendations.",
    };

    return typeGuidance[articleType] || '';
  }
}
