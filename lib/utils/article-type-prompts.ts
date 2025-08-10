/**
 * 記事タイプ別のプロンプトテンプレート
 * 各記事タイプに最適化された要約生成プロンプトを定義
 */

import { ArticleType } from './article-type-detector';

/**
 * 統一プロンプト - すべての記事に適用
 */
/**
 * 改善版統一プロンプト - 文字数制約を厳格化
 * Phase 2強化版: 最小文字数を強調
 */
export const IMPROVED_UNIFIED_PROMPT = `
技術記事を分析して、以下の形式で要約を作成してください。

【絶対遵守ルール】
1. 文字数は必ず指定範囲内に収める
2. 要約は必ず150文字以上にすること。149文字以下は厳禁
3. 箇条書きには句点（。）を付けない
4. 短すぎる場合は、技術的背景や実装の特徴を追加して150文字以上にする

要約:
【必須】150文字以上180文字以下で記述。この範囲外は許可されない。
記事の核心的内容と技術的価値を含めて説明。最後は必ず句点で終了。
150文字未満は絶対に禁止。必要に応じて技術的背景、実装方法、利用シーンなどを追加。

詳細要約:
【必須】合計500文字以上600文字以下。この範囲外は厳禁。
以下の5項目を箇条書きで記述。各項目は句点なし。

・記事の主題は、【100-120文字厳守】
・具体的な問題は、【100-120文字厳守】
・提示されている解決策は、【100-120文字厳守】
・実装方法の詳細については、【100-120文字厳守】
・期待される効果は、【100-120文字厳守】

タグ:
技術名を5個まで（カンマ区切り）
`;

/**
 * 統一プロンプト（改善版を使用）
 */
export const UNIFIED_PROMPT = IMPROVED_UNIFIED_PROMPT;

/**
 * 統一プロンプト生成関数
 * @param title 記事タイトル
 * @param content 記事内容
 * @returns 生成されたプロンプト
 */
export function generateUnifiedPrompt(title: string, content: string): string {
  return `${UNIFIED_PROMPT}

タイトル: ${title}
内容: ${content.substring(0, 4000)}
`;
}

export interface ArticleTypePrompt {
  type: ArticleType;
  systemPrompt: string;
  analysisPoints: string[];
  outputFormat: string;
}

/**
 * 記事タイプ別のプロンプトテンプレート
 */
export const ARTICLE_TYPE_PROMPTS: Record<ArticleType, ArticleTypePrompt> = {
  'release': {
    type: 'release',
    systemPrompt: '新機能リリース記事として分析してください。',
    analysisPoints: [
      '新機能・サービスの概要と主要な特徴',
      'リリースの背景や開発の動機',
      '具体的な利用方法やセットアップ手順',
      '想定される利用シーンとターゲットユーザー',
      '料金体系、利用可能地域、制約事項'
    ],
    outputFormat: `詳細要約:
以下の要素を箇条書きで記載（各項目は「・」で開始）：
・新機能の概要（どのような機能か、何が新しいか）
・主な機能・特徴（箇条書きで3-5個の主要機能）
・利用方法・手順（具体的なセットアップや使用開始方法）
・対象ユーザー・ユースケース（誰にとって有用か、どのような場面で使うか）
・料金・制約事項（コスト、利用制限、前提条件など）`
  },

  'problem-solving': {
    type: 'problem-solving',
    systemPrompt: '技術的問題解決記事として分析してください。',
    analysisPoints: [
      '記事の主要なトピックと技術的な焦点',
      '解決しようとしている問題や課題',
      '提示されている解決策やアプローチ',
      '実装の具体例やコードの有無',
      '期待される効果と注意点'
    ],
    outputFormat: `詳細要約:
以下の要素を技術的に詳しく箇条書きで記載（各項目は「・」で開始）：
・技術的背景（使用技術、前提知識）
・解決しようとしている具体的な問題と現状の課題
・提示されている解決策の技術的アプローチ（アルゴリズム、設計パターン等）
・実装方法の詳細（具体的なコード例、設定方法、手順）
・期待される効果と性能改善の指標（数値があれば含める）
・実装時の注意点、制約事項、必要な環境`
  },

  'tutorial': {
    type: 'tutorial',
    systemPrompt: 'チュートリアル記事として分析してください。',
    analysisPoints: [
      '学習目標とゴール',
      '必要な前提知識と環境',
      '具体的な実装手順',
      'サンプルコードやデモ',
      '次のステップや発展的な内容'
    ],
    outputFormat: `詳細要約:
以下の要素を学習者向けに箇条書きで記載（各項目は「・」で開始）：
・学習内容・ゴール（何を学び、何ができるようになるか）
・前提知識・環境（必要なスキル、ツール、セットアップ）
・実装手順（ステップバイステップの具体的な手順）
・コード例・デモ（主要なコードスニペットや実行例）
・次のステップ（学習後の発展的な内容や関連トピック）`
  },

  'tech-intro': {
    type: 'tech-intro',
    systemPrompt: '技術紹介記事として分析してください。',
    analysisPoints: [
      '技術の概要と基本概念',
      '主要な特徴と機能',
      '実際の利用シーンや適用例',
      'メリットとデメリット',
      '類似技術との比較や代替案'
    ],
    outputFormat: `詳細要約:
以下の要素を技術概要として箇条書きで記載（各項目は「・」で開始）：
・技術概要（何であるか、基本的な仕組みや概念）
・主な特徴（他と差別化される主要な機能や特性）
・利用シーン（実際にどのような場面で使われるか、具体例）
・メリット・デメリット（利点と欠点、トレードオフ）
・関連技術・代替案（類似技術との比較、選択基準）`
  },

  'implementation': {
    type: 'implementation',
    systemPrompt: '実装レポート記事として分析してください。',
    analysisPoints: [
      '作成したものの概要',
      '使用した技術スタック',
      '実装上の工夫や特徴',
      '直面した課題と解決方法',
      '学びや今後の改善点'
    ],
    outputFormat: `詳細要約:
以下の要素をプロジェクト報告として箇条書きで記載（各項目は「・」で開始）：
・作ったもの（プロジェクトの概要、目的、機能）
・使用技術・ツール（技術スタック、フレームワーク、ライブラリ）
・工夫点・特徴（独自の実装、アーキテクチャの決定、UI/UXの工夫）
・課題・改善点（直面した問題、現在の制限、将来の改善案）
・学び・感想（プロジェクトを通じて得た知見、振り返り）`
  }
};

/**
 * 記事タイプに応じたプロンプトを生成
 * @param type 記事タイプ
 * @param title 記事タイトル
 * @param content 記事内容
 * @returns 生成されたプロンプト
 */
export function generatePromptForArticleType(
  type: ArticleType,
  title: string,
  content: string
): string {
  const promptTemplate = ARTICLE_TYPE_PROMPTS[type];
  
  return `以下の技術記事を詳細に分析してください。
${promptTemplate.systemPrompt}

タイトル: ${title}
内容: ${content.substring(0, 4000)}

【分析観点】
${promptTemplate.analysisPoints.map((point, index) => `${index + 1}. ${point}`).join('\n')}

【回答形式】
※重要: 各セクションのラベル（要約:、詳細要約:、タグ:）のみ記載し、それ以外の説明や指示文は一切含めないでください。
※絶対に守るべきルール：
- 「タイトルから判断すると」「記事の主題は」「この記事は」「本記事は」などの前置き文言を使わない
- 要約は直接的で簡潔に、内容そのものから始める
- 詳細要約も同様に、前置きなしで直接内容を記載する
- 詳細要約は必ず箇条書き形式（各項目は「・」で開始し、改行で区切る）

要約:
記事の要点を150-180文字で直接的に要約。主要な内容と価値を明確に伝える。前置き文言は一切使わず、内容から始める。句点で終了。文字数厳守。

${promptTemplate.outputFormat}

重要: 詳細要約は必ず以下の形式で出力してください：
・項目1の内容（改行）
・項目2の内容（改行）
・項目3の内容（改行）
※各項目は必ず改行で区切り、1行にまとめないでください。

タグ:
技術名,フレームワーク名,カテゴリ名,概念名

【タグの例】
JavaScript, React, フロントエンド, 状態管理`;
}

/**
 * 記事タイプのセクション定義を取得
 * @param type 記事タイプ
 * @returns セクション定義
 */
export function getArticleTypeSections(type: ArticleType) {
  const sections: Record<ArticleType, Array<{ key: string; title: string; icon: string }>> = {
    'release': [
      { key: 'overview', title: '新機能の概要', icon: '🚀' },
      { key: 'features', title: '主な機能・特徴', icon: '✨' },
      { key: 'usage', title: '利用方法・手順', icon: '📖' },
      { key: 'usecase', title: '対象ユーザー・ユースケース', icon: '👥' },
      { key: 'limitations', title: '料金・制約事項', icon: '⚠️' }
    ],
    'problem-solving': [
      { key: 'background', title: '技術的背景', icon: '📋' },
      { key: 'problem', title: '解決する問題', icon: '❓' },
      { key: 'solution', title: '解決策', icon: '💡' },
      { key: 'implementation', title: '実装方法', icon: '🔧' },
      { key: 'effects', title: '期待される効果', icon: '📈' },
      { key: 'cautions', title: '注意点', icon: '⚠️' }
    ],
    'tutorial': [
      { key: 'goal', title: '学習内容・ゴール', icon: '🎯' },
      { key: 'prerequisites', title: '前提知識・環境', icon: '📚' },
      { key: 'steps', title: '実装手順', icon: '📝' },
      { key: 'examples', title: 'コード例・デモ', icon: '💻' },
      { key: 'next', title: '次のステップ', icon: '➡️' }
    ],
    'tech-intro': [
      { key: 'overview', title: '技術概要', icon: '🔍' },
      { key: 'features', title: '主な特徴', icon: '⭐' },
      { key: 'usecases', title: '利用シーン', icon: '🎯' },
      { key: 'comparison', title: 'メリット・デメリット', icon: '⚖️' },
      { key: 'alternatives', title: '関連技術・代替案', icon: '🔄' }
    ],
    'implementation': [
      { key: 'what', title: '作ったもの', icon: '🛠️' },
      { key: 'tech', title: '使用技術・ツール', icon: '⚡' },
      { key: 'features', title: '工夫点・特徴', icon: '✨' },
      { key: 'challenges', title: '課題・改善点', icon: '🔧' },
      { key: 'learnings', title: '学び・感想', icon: '💭' }
    ]
  };
  
  return sections[type];
}

/**
 * 統一フォーマット用のセクション定義を取得
 * @returns 統一セクション定義
 */
export function getUnifiedSections() {
  return [
    { key: 'topic', title: '主要トピック', icon: '📋' },
    { key: 'problem', title: '課題・問題点', icon: '❓' },
    { key: 'solution', title: '解決策・アプローチ', icon: '💡' },
    { key: 'implementation', title: '実装詳細', icon: '🔧' },
    { key: 'effects', title: '期待効果・メリット', icon: '📈' }
  ];
}