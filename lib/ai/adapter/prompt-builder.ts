import { SummaryProviderInput } from './summary-provider.interface';
// 項目数ルールは lib/ai/constants.ts の ITEM_COUNT_RULES と同期
// 詳細要約の文字数やポリシー調整があるため、ここでは直接使用せず
// 定数の変更時は両ファイルの整合性を確認すること

const SYSTEM_INSTRUCTIONS = `
あなたは技術記事の要約を生成する専門AIです。以下のルールを厳守してください：

【基本制約】
- 要約は150〜250文字で必ず1行に収める（範囲外は生成失敗とみなす）
- 詳細要約は記事内容に応じた自然な長さ
- 実際の記事内容のみを書く（存在しない情報を追加しない）
- 箇条書きには句点（。）を付けない

【要約の書き方】
- 記事の核心的な内容を端的に表現
- 技術的価値を明確に示す
- 冗長な表現は避ける
- 技術用語は略称を活用（JavaScript→JS、TypeScript→TS等）
- 必ず完結した文で終了（体言止めは避ける）

【詳細要約の形式ルール】
1. 改行の絶対禁止
   - 各項目は「・項目名： 内容...」の形式で1行に全て記載
   - 項目名の後にコロン（：）を書いたら、絶対に改行せず、必ず半角スペース1つの後に内容を続ける

2. Markdown装飾の絶対禁止
   - **太字**、_斜体_、\`コード\`、# 見出しは使用しない
   - 平文テキストのみ

3. コロンとスペースの厳守
   - 「・項目名： 内容」（全角コロン + 半角スペース1つ）

4. 1行完結の厳守
   - 各箇条書き項目は、「・」から内容の最後まで、途中で改行せず1行で完結

5. 短い記事（400文字未満）の特別ルール
   - 箇条書き形式は使用しない
   - 1-2文の平文で簡潔に要約
   - 元記事の長さの1.5倍を超える詳細要約は生成しない

【項目名の設定ルール】
- 記事の内容を具体的に表すタイトルにする
- 汎用的なカテゴリ名（技術概要、詳細、背景、概要、実装、効果等）は禁止
- 記事タイプに応じて最適な項目名を自由に設定

【項目統合ルール】
- 各項目は十分な情報量を持つこと（1文だけの薄い項目は禁止）
- 関連する内容は1つの項目に統合する（例: 3段階のレベル説明は「レベル別特徴」として1項目にまとめる）
- 項目を細分化するより、1項目の中で複数の要素を並列記述する方が望ましい
- 目安: 各項目は最低でも2-3文、または複数の具体的な情報を含むこと

【正しい出力例】
・GPSの進化と位置情報共有の普及： GPS（Global Positioning System）は元々軍事利用を目的に開発されたが、その正確性から民間利用も拡大し、現代社会に不可欠な技術となった
・位置情報共有のメリットとデメリット： 位置情報共有は、家族や友人との連絡を円滑にし、安全確認に役立つ。しかし、誤解やプライバシー侵害のリスクも存在する

【カテゴリ】
以下から1つ選択：
- プログラミング言語
- フレームワーク・ライブラリ
- AI・機械学習
- クラウド・インフラ
- Web開発
- モバイル開発
- データベース
- セキュリティ
- ツール・開発環境
- その他

【タグ生成ルール】
- 3-5個の技術タグを生成
- 一般的な名称を使用（略称推奨）
- 適切な粒度（具体的すぎず、一般的すぎず）
- カンマ区切りで記載

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

const OUTPUT_SCHEMA = `
以下の形式で出力してください：

要約:
[ここに150-250文字の要約を1行で出力]

詳細要約:
・項目1の内容
・項目2の内容
・項目3の内容
...

カテゴリ:
[カテゴリ名]

タグ:
[タグ1, タグ2, タグ3, ...]
`;

const METADATA_WARNING = `
IMPORTANT: The above metadata is for your reference only. Never include it in your output.
`;

export class PromptBuilder {
  buildPrompt(input: SummaryProviderInput): string {
    const maxContentLength = 150000;
    const truncatedContent = input.content.length > maxContentLength
      ? input.content.substring(0, maxContentLength) + '\n\n...[文字数制限により以下省略]'
      : input.content;

    const itemCountInstruction = this.buildItemCountInstruction(
      input.content.length,
      input.constraints.detailPolicy
    );

    const toneGuidance = this.buildToneGuidance(input.tone);
    const articleTypeGuidance = this.buildArticleTypeGuidance(input.articleType);

    const systemMessage = `${SYSTEM_INSTRUCTIONS}${itemCountInstruction}${toneGuidance}${articleTypeGuidance}`;

    return `${systemMessage}

${OUTPUT_SCHEMA}

<<<ARTICLE_START>>>
タイトル: ${input.title}
内容: ${truncatedContent}
<<<ARTICLE_END>>>
`;
  }

  private buildItemCountInstruction(contentLength: number, policy: 'short' | 'medium' | 'long'): string {
    const policyMultiplier = policy === 'long' ? 1.2 : policy === 'short' ? 0.8 : 1.0;

    // Very short article: plain text only, no bullet points
    if (contentLength < 400) {
      const maxLength = contentLength > 0 ? Math.floor(contentLength * 1.5) : 200;
      return `

INTERNAL METADATA (DO NOT OUTPUT THIS IN YOUR SUMMARY):
Article content length: ${contentLength} characters
This is a very short article.

Summary requirements:
- Detailed summary: Plain text format ONLY (1-2 sentences, NO bullet points)
- Maximum length: ${maxLength} characters (strict limit, do not exceed 1.5x source length)
- Do NOT expand beyond the source content
- If source content is insufficient, keep the detailed summary minimal and factual

${METADATA_WARNING}`;
    }

    if (contentLength >= 10000) {
      const baseMin = 7, baseMax = 9;
      const minItems = Math.max(baseMin, Math.floor(baseMin * policyMultiplier));
      const maxItems = Math.max(minItems, Math.floor(baseMax * policyMultiplier));
      const totalFloor = Math.max(900, minItems * 150);
      return `

INTERNAL METADATA (DO NOT OUTPUT THIS IN YOUR SUMMARY):
Article content length: ${contentLength} characters
This is a very long article requiring detailed summarization.

Summary requirements:
- Total summary: MUST be at least ${totalFloor} characters (target 1000-1300 characters)
- Number of items: ${minItems}-${maxItems} items only (strict requirement, do not exceed ${maxItems} items)
- CRITICAL: Each item MUST be at least 150 characters (target 180-200 characters); NEVER write items shorter than 150 characters
- Calculation: ${minItems} items x 150 chars = ${minItems * 150} chars minimum total
- Each item must include: specific version numbers, metrics/benchmarks, dates, technical terms, architecture details, or command examples
- DO NOT write brief one-line items. Expand each point with concrete supporting details.
- Prioritize the most technical or novel findings first.
- If any item is <150 chars OR total is <${totalFloor} chars, you MUST regenerate with longer descriptions
- If you cannot meet these requirements, reply: "unable to comply"

${METADATA_WARNING}`;
    } else if (contentLength >= 5000) {
      const baseMin = 5, baseMax = 7;
      const minItems = Math.max(baseMin, Math.floor(baseMin * policyMultiplier));
      const maxItems = Math.max(minItems, Math.floor(baseMax * policyMultiplier));
      const totalFloor = Math.max(600, minItems * 120);
      return `

INTERNAL METADATA (DO NOT OUTPUT THIS IN YOUR SUMMARY):
Article content length: ${contentLength} characters
This is a long article.

Summary requirements:
- Total summary: MUST be at least ${totalFloor} characters (target 700-1000 characters)
- Number of items: ${minItems}-${maxItems} items only (strict requirement, do not exceed ${maxItems} items)
- CRITICAL: Each item MUST be at least 120 characters (target 150-180 characters); NEVER write items shorter than 120 characters
- Calculation: ${minItems} items x 120 chars = ${minItems * 120} chars minimum total
- Each item must include: specific metrics, timelines, architectures, failure modes, benchmarks, or version info
- DO NOT write brief one-line items. Expand each point with concrete supporting details.
- If any item is <120 chars OR total is <${totalFloor} chars, you MUST regenerate with longer descriptions
- If you cannot meet these requirements, reply: "unable to comply"

${METADATA_WARNING}`;
    } else if (contentLength >= 3000) {
      const baseMin = 4, baseMax = 5;
      const minItems = Math.max(baseMin, Math.floor(baseMin * policyMultiplier));
      const maxItems = Math.max(minItems, Math.floor(baseMax * policyMultiplier));
      return `

INTERNAL METADATA (DO NOT OUTPUT THIS IN YOUR SUMMARY):
Article content length: ${contentLength} characters

Summary requirements:
- Detailed summary: 600-1000 characters
- Number of items: ${minItems}-${maxItems} items only (strict requirement, do not exceed ${maxItems} items)
- Length per item: Minimum 150 characters each

${METADATA_WARNING}`;
    } else if (contentLength >= 1000) {
      const baseMin = 3, baseMax = 4;
      const minItems = Math.max(baseMin, Math.floor(baseMin * policyMultiplier));
      const maxItems = Math.max(minItems, Math.floor(baseMax * policyMultiplier));
      return `

INTERNAL METADATA (DO NOT OUTPUT THIS IN YOUR SUMMARY):
Article content length: ${contentLength} characters

Summary requirements:
- Detailed summary: 400-700 characters
- Number of items: ${minItems}-${maxItems} items only (strict requirement, do not exceed ${maxItems} items)
- Length per item: Minimum 130 characters each

${METADATA_WARNING}`;
    } else {
      // 400-999 characters
      const baseMin = 2, baseMax = 3;
      const minItems = Math.max(baseMin, Math.floor(baseMin * policyMultiplier));
      const maxItems = Math.max(minItems, Math.floor(baseMax * policyMultiplier));
      return `

INTERNAL METADATA (DO NOT OUTPUT THIS IN YOUR SUMMARY):
Article content length: ${contentLength} characters
This is a short article.

Summary requirements:
- Detailed summary: 200-400 characters
- Number of items: ${minItems}-${maxItems} items only (strict requirement, do not exceed ${maxItems} items)
- Length per item: Minimum 80 characters each

${METADATA_WARNING}`;
    }
  }

  private buildToneGuidance(tone?: 'formal' | 'casual'): string {
    if (!tone) {
      return '';
    }

    if (tone === 'formal') {
      return '\n\n【トーン指定】フォーマルな表現で作成してください。専門的な用語を使用し、丁寧な文体を維持してください。';
    } else {
      return '\n\n【トーン指定】カジュアルな表現で作成してください。親しみやすい文体を使用してください。';
    }
  }

  private buildArticleTypeGuidance(articleType?: 'technical' | 'news' | 'tutorial' | 'opinion'): string {
    if (!articleType) {
      return '';
    }

    const typeGuidance: Record<string, string> = {
      technical: '\n\n【記事タイプ】技術解説記事として、実装詳細、技術仕様、パフォーマンス特性などに重点を置いてください。',
      news: '\n\n【記事タイプ】ニュース記事として、発表内容、新機能、影響範囲、今後の展望に重点を置いてください。',
      tutorial: '\n\n【記事タイプ】チュートリアル記事として、手順、実装方法、コード例、注意点に重点を置いてください。',
      opinion: '\n\n【記事タイプ】意見記事として、著者の見解、メリット・デメリット、推奨事項に重点を置いてください。',
    };

    return typeGuidance[articleType] || '';
  }
}
