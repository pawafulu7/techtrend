import { SummaryProviderInput } from './summary-provider.interface';
import {
  SUMMARY_LENGTH_HINT,
  THIN_SUMMARY_LENGTH_HINT,
  THIN_CONTENT_MAX_LENGTH,
  getItemCountRule,
  getDetailLengthBand,
  type DetailLengthBand,
} from '../constants';

const SYSTEM_INSTRUCTIONS = `
あなたは技術記事の要約を生成する専門AIです。以下のルールを厳守してください：

【言語ルール（最重要）】
- summary、detailedSummaryItemsの全フィールド（title, content）は必ず日本語で記述してください
- 英語の記事であっても、要約は必ず日本語で生成してください
- tagsは技術用語の正式名称（英語可）を使用してください

【一覧要約ルール（summaryフィールド）】
- ${SUMMARY_LENGTH_HINT}で記事の核心を端的に表現する
- 技術的価値を明確に示す
- 技術用語は略称を活用（JavaScript→JS、TypeScript→TS等）
- 必ず完結した文で終了（体言止めは避ける）
- 冗長な表現は避ける
- 「この記事は」「本記事は」「本研究は」「本論文は」「本稿は」「本プロジェクトは」等の自己言及表現は禁止。記事の内容・主題から直接書き始めること
  - 悪い例: 「この記事ではTypeScriptの型システムについて解説しています」
  - 良い例: 「TypeScriptの型システムを活用し、型安全性を保ちながら柔軟なコードを書く方法を解説する」

【詳細要約ルール（detailedSummaryItemsフィールド）】
- 「この記事は」「本記事は」等の自己言及表現は禁止。具体的な内容から直接書き始めること
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
    if (contentLength < THIN_CONTENT_MAX_LENGTH) {
      // 短記事は品質チェック側の上限も下がるため、一覧要約の長さ指示を上書きする。
      // 上書きしないと SYSTEM_INSTRUCTIONS の通常レンジに従った出力が
      // 検証層の thin-content 判定で減点される。
      return `

記事は${contentLength}文字（非常に短い）です。
detailedSummaryItemsは空配列[]にしてください。
summaryフィールドの作成のみに集中してください。
この記事のsummaryは${THIN_SUMMARY_LENGTH_HINT}にしてください（上記の通常レンジより優先）。
${METADATA_WARNING}`;
    }

    // 項目数は constants.ts の ITEM_COUNT_RULES を唯一の出典とする。
    // quality-checker.ts も同じ関数を参照するため、ここで独自に再計算しない。
    const { recommendedItems } = getItemCountRule(contentLength, policy);
    const band = getDetailLengthBand(contentLength) as DetailLengthBand;

    return `

記事は${contentLength}文字${band.label}です。
detailedSummaryItems: ${recommendedItems}項目。
各項目のcontent: ${band.itemContentHint}
detailedSummaryItems全体の合計は${band.totalMax}文字以内。${band.priorityHint}
${METADATA_WARNING}`;
  }

  private buildToneGuidance(tone?: 'formal' | 'casual'): string {
    if (!tone) {
      return '';
    }

    if (tone === 'formal') {
      return '\n\nトーン: フォーマル。専門的で正確な用語を使用してください。';
    } else {
      return '\n\nトーン: カジュアル。親しみやすく分かりやすい表現を使用してください。';
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
        '\n\n記事タイプ: 技術記事。実装の詳細、仕様、パフォーマンス特性に焦点を当ててください。',
      news: '\n\n記事タイプ: ニュース。発表内容、新機能、影響、今後の展望に焦点を当ててください。',
      tutorial:
        '\n\n記事タイプ: チュートリアル。手順、実装方法、コード例、注意点に焦点を当ててください。',
      opinion:
        '\n\n記事タイプ: オピニオン。著者の見解、メリット・デメリット、推奨事項に焦点を当ててください。',
    };

    return typeGuidance[articleType] || '';
  }
}
