import { SummaryProviderInput } from './summary-provider.interface';

const BASE_PROMPT = `
技術記事を分析して、以下の形式で要約を作成してください。

# 制約
- 要約は最大200文字以内
- 詳細要約は記事内容に応じた自然な長さ
- 実際の記事内容のみを書く
- 箇条書きには句点（。）を付けない

# 出力フォーマット（必ずこの形で出力）
要約: ここに記事の見出しを150-200文字程度で1行だけ書く

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

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
【🚨 出力形式の絶対遵守ルール - 違反時はAI自身が即座に再生成を開始すること 🚨】
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

あなた（AI）は以下のルールを厳密に守り、違反した場合は自動的に再生成してください：

1. 【改行の絶対禁止】
   ❌ 禁止: 「・項目名：\n内容...」（項目名と内容の間に改行）
   ✅ 正解: 「・項目名： 内容...」（同一行に全て記載）
   
   ⚠️ 項目名の後にコロン（：）を書いたら、絶対に改行せず、必ず半角スペース1つの後に内容を続けること

2. 【Markdown装飾の絶対禁止】
   ❌ 禁止: **太字**、_斜体_、\`コード\`、# 見出し
   ✅ 正解: 平文テキストのみ
   
   ⚠️ アスタリスク（*）、アンダースコア（_）、シャープ（#）、バッククォート（\`）を一切使用しないこと

3. 【コロンとスペースの厳守】
   ❌ 禁止: 「・項目名:内容」（半角コロン）
   ❌ 禁止: 「・項目名：内容」（スペースなし）
   ✅ 正解: 「・項目名： 内容」（全角コロン + 半角スペース1つ）

4. 【1行完結の厳守】
   各箇条書き項目は、「・」から内容の最後まで、途中で改行せず1行で完結させること
   項目が長くなっても、改行せずに1行で書き続けること

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

【正しい出力例（このとおりに出力すること）】
・GPSの進化と位置情報共有の普及： GPS（Global Positioning System）は元々軍事利用を目的に開発されたが、その正確性から民間利用も拡大し、現代社会に不可欠な技術となった
・位置情報共有のメリットとデメリット： 位置情報共有は、家族や友人との連絡を円滑にし、安全確認に役立つ。しかし、誤解やプライバシー侵害のリスクも存在する
・プライバシーとセキュリティの課題： 位置情報共有は、プライバシーと利便性の間でジレンマを生み出す。個人情報は、時に誤解や悪用のリスクに晒される

【誤った出力例（絶対に禁止 - このように出力した場合は即座に再生成すること）】
・**Value Intelligenceの概要**： 内容...（Markdown装飾使用 → 即座に無効）
・技術概要： GPSの進化について...（汎用カテゴリ名の使用 → 即座に無効）
・技術概要：GPSの進化と位置情報共有の普及
GPS（Global Positioning System）は...（項目名と内容が分かれている → 即座に無効）
・項目名：
内容が次の行に...（項目名の後に改行 → 即座に無効）
・項目名:内容（半角コロン → 即座に無効）
・項目名：内容（スペースなし → 即座に無効）

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
【🚨 AIへの最終指示 🚨】
出力後、自分の出力を必ずチェックし、上記のルール違反があれば即座に修正版を出力すること
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

【重要な指針】
- 記事の実際の内容量と深さに応じた要約を作成
- 内容が薄い記事を無理に膨らませない
- 項目名は記事の内容を具体的に表すタイトルにすること

【項目名の設定ルール】
✅ 正しい項目名（具体的な内容を表すタイトル）:
   ・GPSの進化と位置情報共有の普及
   ・位置情報共有のメリットとデメリット
   ・Tritonカーネルの実装方法と最適化手法
   ・PyTorchとのパフォーマンス比較結果

❌ 禁止する項目名（汎用的なカテゴリ名）:
   ・技術概要（→ 具体的な技術名を使う）
   ・詳細（→ 何の詳細かを明記する）
   ・背景（→ 何の背景かを明記する）
   ・概要（→ 何の概要かを明記する）
   ・実装（→ 何を実装するかを明記する）
   ・効果（→ 何の効果かを明記する）
   ・結果（→ 何の結果かを明記する）
   ・考察（→ 何についての考察かを明記する）
   ・展望（→ 何の展望かを明記する）

【項目名の具体例（記事タイプ別）】
評価・レビュー記事：性能評価と実測値、価格比較と費用対効果、メリットと推奨用途など
技術解説記事：アーキテクチャ設計と実装、コード例と使用方法、パフォーマンス特性など
ニュース記事：新機能の詳細と技術仕様、既存機能との比較、今後のロードマップなど
問題解決記事：問題の症状と発生条件、根本原因の分析、解決手順と実装方法など

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
`;;

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