import { SummaryProviderInput } from './summary-provider.interface';

const BASE_PROMPT = `
技術記事を分析して、以下の形式で要約を作成してください。

【最重要ルール】
1. 要約は最大200文字以内（超過厳禁）
2. 詳細要約は記事の内容量に応じた自然な長さで
3. 無理に内容を膨らませない - 実際の記事内容を忠実に反映
4. 箇条書きには句点（。）を付けない

要約:
【条件】150-250文字程度。内容に応じて適切な長さで自然に終わらせる。
【書き方】
- 記事の核心的な内容を端的に表現
- 技術的価値を明確に示す
- 冗長な表現は避ける
- 技術用語は略称を活用（JavaScript→JS、TypeScript→TS等）
【文末】必ず完結した文で終了（体言止めは避ける）

詳細要約:
【重要：以下の文字数を必ず守ること】
- 5000文字以上の記事：必ず800文字以上1500文字以内で作成
- 3000-5000文字の記事：必ず600文字以上1000文字以内で作成
- 1000-3000文字の記事：必ず400文字以上700文字以内で作成
- 1000文字未満の記事：必ず300文字以上500文字以内で作成

【形式】記事の内容に最も適した項目を箇条書きで作成
【項目数の必須要件】
- 5000文字以上の記事：最低5個、推奨6-7個
- 3000-5000文字の記事：最低4個、推奨5個
- 1000-3000文字の記事：最低3個、推奨4個
- 1000文字未満の記事：最低3個

【各項目の必須要件】
・記事タイプに応じて最適な項目名を自由に設定
・各項目は「・項目名：」の後に必ず詳細な説明を記載
・各項目の文字数要件：
  - 5000文字以上の記事：各項目150-200文字
  - 3000-5000文字の記事：各項目130-180文字
  - 1000-3000文字の記事：各項目120-150文字
  - 1000文字未満：各項目100-120文字
・具体例、数値、日付、技術名、製品名、機能名、コマンド例などを省略せず明記
・記事の重要な技術的詳細、実装方法、設定内容を具体的に説明
・記事に書かれていない内容は追加しない

【出力形式の厳密な要件（違反時は出力全体を無効化し即座に再生成すること）】
1. 各項目は必ず「・項目名：内容」の形式で項目名と内容を同一行に記載すること
2. 項目名と内容の間に改行を絶対に入れないこと（項目名・コロン・内容が必ず1行に収まること）
3. Markdown装飾を一切使用しないこと（アスタリスク2個、アンダースコア、シャープ、バッククォートなどを含む全ての装飾を禁止）
4. 項目名は装飾なしの平文テキストのみで記載すること
5. コロン（：）は全角を使用し、その直後に半角スペースを1つ必ず入れること

【正しい出力例】
・Value Intelligenceの概要と目的： SALESCOREが正式リリースしたAIサービス「Value Intelligence」は営業活動を支援します
・独自概念「Value Map」の仕組み： Value Intelligenceの核となるのが「Value Map」という独自の概念です

【誤った出力例（絶対禁止）】
・項目名に太字装飾を使用:
内容が次の行に...（Markdown装飾使用・改行があるため即座に無効）

・シャープ記号で見出しを作成
内容...（Markdown見出し使用のため即座に無効）

・項目名:内容...（コロン後のスペース無しのため即座に無効）

【重要な指針】
- 記事の実際の内容量と深さに応じた要約を作成
- 内容が薄い記事を無理に膨らませない
- 項目名は記事の内容に最も適したものを選択

【項目名の例（自由に選択・組み合わせ可）】
評価・レビュー記事：性能評価、価格比較、メリット、デメリット、推奨用途、ベンチマーク結果など
技術解説記事：技術概要、実装方法、コード例、パフォーマンス、ユースケースなど
ニュース記事：発表内容、新機能、影響範囲、技術仕様、今後の展望など
問題解決記事：問題の症状、原因分析、解決方法、実装手順、注意点など

※上記は例であり、記事内容に応じて最適な項目名を自由に設定すること

カテゴリ:
以下から1つ選択してください：
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

タグ:
【生成ルール】
- 3-5個の技術タグを生成
- 一般的な名称を使用（略称推奨）
- 適切な粒度（具体的すぎず、一般的すぎず）
- カンマ区切りで記載

【正規化ルール - 必ず以下の統一表記を使用】
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

    return `${BASE_PROMPT}${itemCountInstruction}${toneGuidance}${articleTypeGuidance}

タイトル: ${input.title}
内容: ${truncatedContent}
`;
  }

  private buildItemCountInstruction(contentLength: number, policy: 'short' | 'medium' | 'long'): string {
    const policyMultiplier = policy === 'long' ? 1.2 : policy === 'short' ? 0.8 : 1.0;

    if (contentLength >= 10000) {
      const minItems = Math.max(7, Math.floor(7 * policyMultiplier));
      const maxItems = Math.max(9, Math.floor(9 * policyMultiplier));
      return `\n\n【最重要要件】この記事は${contentLength}文字の特大長文記事です。\n詳細要約は必ず1200文字以上1500文字以内で作成し、条件を外れた場合は生成失敗とみなします。\n最低${minItems}個以上の項目（推奨${minItems}-${maxItems}個）を必ず作成し、各項目は必ず170文字以上200文字以内の詳細な説明にしてください。\n項目数が${minItems - 1}個以下、または文字数要件を満たさない項目が含まれる場合はペナルティとして出力全体を無効化し、直ちに再生成してください。\n重要な数値、日付、技術名、機能名を省略せず、具体的に記載してください。`;
    } else if (contentLength >= 5000) {
      const minItems = Math.max(5, Math.floor(5 * policyMultiplier));
      const maxItems = Math.max(7, Math.floor(7 * policyMultiplier));
      return `\n\n【必須要件】この記事は${contentLength}文字の長文記事です。\n詳細要約は必ず900文字以上1500文字以内で作成し、条件を外れた場合は生成失敗とみなします。\n最低${minItems}個以上の項目（推奨${minItems}-${maxItems}個）を必ず作成し、各項目は必ず150文字以上200文字以内の詳細な説明にしてください。\n項目数が${minItems}個未満、または150文字未満の項目が含まれる場合はペナルティとして出力全体を無効化し、再生成してください。\n重要な数値、日付、技術名、機能名を省略せず、具体的に記載してください。`;
    } else if (contentLength >= 3000) {
      const minItems = Math.max(4, Math.floor(4 * policyMultiplier));
      const maxItems = Math.max(5, Math.floor(5 * policyMultiplier));
      return `\n\n【必須要件】この記事は${contentLength}文字です。\n詳細要約は必ず600文字以上1000文字以内で作成してください。\n最低${minItems}個以上の項目（推奨${maxItems}個）を作成し、各項目は必ず150文字以上の詳細な説明にしてください。`;
    } else if (contentLength >= 1000) {
      const minItems = Math.max(3, Math.floor(3 * policyMultiplier));
      const maxItems = Math.max(4, Math.floor(4 * policyMultiplier));
      return `\n\n【必須要件】この記事は${contentLength}文字です。\n詳細要約は必ず400文字以上700文字以内で作成してください。\n最低${minItems}個以上の項目（推奨${maxItems}個）を作成し、各項目は必ず130文字以上にしてください。`;
    } else {
      const minItems = Math.max(3, Math.floor(3 * policyMultiplier));
      return `\n\n【必須要件】この記事は${contentLength}文字の短い記事です。\n詳細要約は必ず300文字以上500文字以内で作成してください。\n最低${minItems}個の項目を作成し、各項目は100文字以上にしてください。`;
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