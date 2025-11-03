import { SummaryProviderInput } from './summary-provider.interface';

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

【項目名の設定ルール】
- 記事の内容を具体的に表すタイトルにする
- 汎用的なカテゴリ名（技術概要、詳細、背景、概要、実装、効果等）は禁止
- 記事タイプに応じて最適な項目名を自由に設定

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

【AI評価の生成ルール】
記事の客観的な評価を以下の3つの観点で提供してください：

1. トレンド・比較（contextComparison）
   - 現在のトレンドや関連技術との関係性を分析
   - ポジティブ・ネガティブ両面を検討
   - 根拠を明示（記事本文の具体例があれば言及）
   - 全角コロン + 半角スペース1つの後に内容を続ける
   - 120-200文字、1行で完結

2. 推薦対象者（recommendedAudience）
   - 職種やスキルレベルを具体的に指定
   - 記事本文に明記された前提知識があれば考慮
   - 「こんな人に参考になる」という視点で記述
   - 全角コロン + 半角スペース1つの後に内容を続ける
   - 80-140文字、1行で完結

3. 読む価値（valueAssessment）
   - 学習価値、実用性、独自性などを評価
   - 記事本文の実装手順や考察の深さを考慮
   - 参考情報として客観的に提示
   - 根拠を明示
   - 全角コロン + 半角スペース1つの後に内容を続ける
   - 80-140文字、1行で完結

【AI評価の注意事項】
- これは自動生成の参考情報です。過度な断言は避けてください
- 以下の強調語は使わない：絶対に、必ず、100%、最高
- 敬体で統一してください
- 客観的で公平な評価を心がけてください
- 著者や企業への主観的評価を避け、記事内の事実とその影響に基づいて記述してください
- ポジティブとネガティブの両面を必ず検討してください
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

AI評価:
トレンド・比較： [120-200文字の評価]
推薦対象者： [80-140文字の推薦]
読む価値： [80-140文字の評価]
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

    if (contentLength >= 10000) {
      const minItems = Math.max(7, Math.floor(7 * policyMultiplier));
      const maxItems = Math.max(9, Math.floor(9 * policyMultiplier));
      return `

INTERNAL METADATA (DO NOT OUTPUT THIS IN YOUR SUMMARY):
Article content length: ${contentLength} characters
This is a very long article requiring detailed summarization.

Summary requirements:
- Detailed summary: 1200-1500 characters (strict requirement)
- Number of items: Minimum ${minItems} items (recommended: ${minItems}-${maxItems} items)
- Length per item: 170-200 characters each
- Include specific numbers, dates, technical terms, product names, and command examples
${METADATA_WARNING}`;
    } else if (contentLength >= 5000) {
      const minItems = Math.max(5, Math.floor(5 * policyMultiplier));
      const maxItems = Math.max(7, Math.floor(7 * policyMultiplier));
      return `

INTERNAL METADATA (DO NOT OUTPUT THIS IN YOUR SUMMARY):
Article content length: ${contentLength} characters
This is a long article.

Summary requirements:
- Detailed summary: 900-1500 characters (strict requirement)
- Number of items: Minimum ${minItems} items (recommended: ${minItems}-${maxItems} items)
- Length per item: 150-200 characters each
- Include specific technical details

${METADATA_WARNING}`;
    } else if (contentLength >= 3000) {
      const minItems = Math.max(4, Math.floor(4 * policyMultiplier));
      const maxItems = Math.max(5, Math.floor(5 * policyMultiplier));
      return `

INTERNAL METADATA (DO NOT OUTPUT THIS IN YOUR SUMMARY):
Article content length: ${contentLength} characters

Summary requirements:
- Detailed summary: 600-1000 characters
- Number of items: Minimum ${minItems} items (recommended: ${minItems}-${maxItems} items)
- Length per item: Minimum 150 characters each

${METADATA_WARNING}`;
    } else if (contentLength >= 1000) {
      const minItems = Math.max(3, Math.floor(3 * policyMultiplier));
      const maxItems = Math.max(4, Math.floor(4 * policyMultiplier));
      return `

INTERNAL METADATA (DO NOT OUTPUT THIS IN YOUR SUMMARY):
Article content length: ${contentLength} characters

Summary requirements:
- Detailed summary: 400-700 characters
- Number of items: Minimum ${minItems} items (recommended: ${minItems}-${maxItems} items)
- Length per item: Minimum 130 characters each

${METADATA_WARNING}`;
    } else {
      const minItems = Math.max(3, Math.floor(3 * policyMultiplier));
      return `

INTERNAL METADATA (DO NOT OUTPUT THIS IN YOUR SUMMARY):
Article content length: ${contentLength} characters
This is a short article.

Summary requirements:
- Detailed summary: 300-500 characters
- Number of items: Minimum ${minItems} items
- Length per item: Minimum 100 characters each

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
