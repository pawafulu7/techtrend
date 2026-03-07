import { TrendPeriodType } from '@prisma/client';

import type { TopArticleInfo, CategoryInfo, TagInfo } from './types';

/**
 * Period type to Japanese label mapping.
 */
export const PERIOD_LABELS: Record<TrendPeriodType, string> = {
  [TrendPeriodType.DAILY]: '本日',
  [TrendPeriodType.WEEKLY]: '今週',
  [TrendPeriodType.MONTHLY]: '今月',
};

/**
 * Period type to comparison basis label mapping.
 */
export const BASIS_LABELS: Record<TrendPeriodType, string> = {
  [TrendPeriodType.DAILY]: '前日',
  [TrendPeriodType.WEEKLY]: '前週',
  [TrendPeriodType.MONTHLY]: '前期間',
};

/**
 * Build the structured v2 prompt for AI summary generation.
 */
export function buildStructuredPrompt(
  periodLabel: string,
  input: Record<string, unknown>
): string {
  return `あなたは技術ニュースの編集長 兼 アナリストです。与えられたデータ（記事タイトル・タグ・カテゴリ・前期間差分）のみを根拠に、${periodLabel}の「意味のある分析」を作成してください。

## 目的（重要）
- 統計の言い換えではなく「何が起きているか」を言語化する
- 各記事にはdetailedSummary（記事要約、最大500文字）が含まれる。記事のdetailedSummaryから技術的な具体内容を読み取り、whatHappenedやwhyItMattersに反映してください。タイトルの言い換えではなく、要約から得られる技術的知見を含めてください。
- 類似記事を束ねて「潮流（テーマ）」として説明する
- 読むべき記事を、具体的理由つきで推薦する
- 前期間比の量的変化はtrendChangesセクションのみで扱う（core/keyTopics/actionsでは量の増減に言及しない）

## 絶対禁止（違反したら失格）
- 「X件あるから注目」「Y%を占める」など、数字だけを根拠に重要と言う
- 記事タイトルを並べるだけ（列挙）
- 「注目を集めています」「トレンドです」「学ぶべきです」など、具体性のない断定
- 同義語・類似表現の繰り返し（例: 「AI/ML分野」と「AI関連」、「減少」と「激減」を同じ文で使う）
- 冗長な言い回し（簡潔に1回で伝える）
- セクション間の同一視点での言い換え重複: core/keyTopics/trendChanges/actionsで同じ事象を同じ切り口で繰り返さない（同一テーマを別視点で扱うのは可）
- keyTopicsで記事数の増減に言及しない（量的変化はtrendChangesの責務）
- coreに「減少」「増加」「急増」等の量的変化の語を使わない

## 出力ルール
- 返答はJSONオブジェクトのみ（前後に文章・コードブロック・Markdownを付けない）
- versionは必ず "trend_ai_summary_v2"
- 指定キー以外を出力しない（追加キー禁止）
- 記事の根拠は evidenceArticleIds / actions.articleIds に入力の topArticles[].ref 値（A1〜A10）を入れて示す
- 文章フィールドでは「件」「%」「割合」「占める」などの統計言い換えをしない（数値は deltaCount や numbers に逃がす）

## 出力形式（厳守）
- keyTopicsは必ず3件以上6件以内で出力すること（入力記事が十分にある場合）
- actionsは必ず3件以上6件以内で出力すること
- evidenceArticleIds / articleIds には入力JSONの topArticles[].ref 値（A1〜A10）を使うこと（架空IDや実IDではなく、必ずref値を使用）
{
  "version": "trend_ai_summary_v2",
  "core": "今日の核心を固有名詞で1文（例: Gemini 2.0発表でマルチモーダルAI開発が加速）。量的変化（増減）は書かない。",
  "overview": "テック系ブログのリード文調で書く（250-350文字）。NG表現:「浮上しています」「求められています」「集約されています」「不可欠です」「注目を集めています」。OK表現:「〜が中心で」「〜を後押し」「〜が広がっています」「〜してみてください」「〜しましょう」。具体的なプロダクト名を挙げながら話題を自然につなぎ、「まずは〜から試してみてください」「〜で一歩リードしましょう」のような呼びかけで締める。例: '3月1日のAI話題は、Claudeのメモリー機能やプラグイン進化が中心で、業務自動化の可能性を広げています。...AIの波に乗り遅れず、さらなる活用で競争力を強化しましょう。'",
  "keyTopics": [
    {
      "topic": "具体的な技術・ツール・手法（固有名詞、10文字以内）",
      "whatHappened": "記事の中身から読み取れる技術的な動き。量的変化は書かない。禁止語: 増加/減少/急増/急減/増えた/減った/拡大/縮小。何が議論・発表・提案されているかを説明する。60-100文字程度で2-3文。",
      "whyItMatters": "whatHappenedとは異なる切り口で、実務者が得られる示唆を具体的に。whatHappenedの言い換えにしない。禁止語: 増加/減少/急増/急減/増えた/減った/拡大/縮小。60-100文字程度で2-3文。",
      "evidenceArticleIds": ["A1", "A3"]
    }
  ],
  "trendChanges": {
    "available": true,
    "basis": { "periodLabel": "前日", "date": "YYYY-MM-DD" },
    "new": [{ "topic": "トピック名", "deltaCount": 3, "reason": "なぜそう言えるか（タイトル/タグ変化から）を1文で。" }],
    "rising": [{ "topic": "トピック名", "deltaCount": 2, "reason": "具体的な変化を1文で。" }],
    "falling": [{ "topic": "トピック名", "deltaCount": -2, "reason": "具体的な変化を1文で。" }],
    "summary": "前期間比の量的変化の全体像を1-2文で。これが量的変化を扱う唯一のセクション。available=falseなら『前期間データなし』を明記。"
  },
  "actions": [
    {
      "action": "読む/試す/設計に反映する等、実行可能な指示を短く",
      "reason": "なぜそれが有効か（何が得られるか）を具体的に。",
      "articleIds": ["A1", "A5"]
    }
  ],
  "numbers": [{ "label": "補助指標（任意）", "value": "例: トップ記事score 123 / 記事総数 42" }],
  "notes": ["任意。制約や前提（例: comparisonがない等）"]
}

## 良い例・悪い例

### keyTopicsの例
悪い例（短すぎる）:
- topic: "AI設計プロトコル"
- whatHappened: "AIとの対話を通じて小さな合意を積み重ね、設計を進めるためのプロトコルが提案されています。"
- whyItMatters: "AIエージェント開発において、複雑なタスクを分解し、一貫性を保ちながら進めるための具体的な設計指針となります。"

良い例（適切な長さ）:
- topic: "AI設計プロトコル"
- whatHappened: "AIとの対話を通じて小さな合意を積み重ね、設計を進めるためのプロトコルが複数の記事で提案されています。これは、AIエージェントがユーザーの意図をより正確に理解し、段階的に目標を達成するための手法です。特にLLMを活用した開発で有効とされています。"
- whyItMatters: "AIエージェント開発において、複雑なタスクを分解し、一貫性を保ちながら進めるための具体的な設計指針となります。コーディングエージェントやLLMを活用した開発で、ユーザーとAI間の認識齟齬を減らし、より効率的な協働が可能になります。"

### actionsの例
悪い例: "TypeScriptの型安全性に関する知見を深めることが推奨されます"
良い例: "as const satisfiesをテストのフィクスチャ定義に適用し、破壊的変更をコンパイル時に検知できるようにする"

### セクション間重複の例
悪い例（3箇所で同じ事象を繰り返し）:
- core: "AI/ML分野の記事数が大幅に減少し、新たなテーマが登場"
- keyTopics[0].whatHappened: "AI/ML関連の話題が減少傾向にある一方..."
- trendChanges.summary: "AI/MLカテゴリの記事が大幅に減少..."

良い例（各セクションが異なる切り口で補完）:
- core: "Bedrock AgentCoreとSoftware Engineering自動化が新たな焦点に"
- keyTopics[0].whatHappened: "AWS Bedrock AgentCoreの実装パターンに関する記事が複数登場。エージェントのオーケストレーションとメモリ管理の手法が具体的に解説されている。"
- trendChanges.summary: "AI/MLカテゴリが前日比で縮小し、代わりにOpen SourceとSoftware Engineeringが拡大。"

## 入力データ
${JSON.stringify(input)}`;
}

/**
 * Build the repair prompt when initial generation fails validation.
 */
export function buildRepairPrompt(
  errors: string[],
  rawText: string,
  refMapInfo: string
): string {
  return `次のモデル出力を、必ず指定のJSONスキーマ（trend_ai_summary_v2）に厳密準拠するJSONオブジェクトへ修正してください。
返答はJSONのみ。追加の文章、コードブロック、コメント禁止。
指定キー（追加/欠落禁止）: version, core, overview, keyTopics, trendChanges, actions, numbers, notes
versionは必ず "trend_ai_summary_v2"。
文章フィールドでは統計の言い換え（"件" "%""割合""占める" 等）をしない（数値はdeltaCountに入れる）。
core/keyTopicsのwhatHappened/whyItMattersでは「増加」「減少」「急増」「急減」「増えた」「減った」「拡大」「縮小」の語を使わない。
core/keyTopics/trendChanges/actionsで同じ事象を同じ切り口で繰り返さない。
evidenceArticleIds / articleIds には参照キー（A1〜A10）を使うこと。

参照キーと実IDの対応: ${refMapInfo}

スキーマ例:
{
  "version": "trend_ai_summary_v2",
  "core": "…。",
  "overview": "ブログのリード文調で250-350文字。柔らかい口調で具体的なプロダクト名を挙げつつ話題をつなぎ、読者への呼びかけで締める。",
  "keyTopics": [{"topic":"…","whatHappened":"…。","whyItMatters":"…。","evidenceArticleIds":["A1"]}],
  "trendChanges": {"available": false, "basis": {"periodLabel":"前日","date":"YYYY-MM-DD"}, "new": [], "rising": [], "falling": [], "summary": "…。"},
  "actions": [{"action":"…","reason":"…","articleIds":["A2"]}],
  "numbers": [{"label":"…","value":"…"}],
  "notes": ["…"]
}

違反箇所: ${errors.join(' / ')}

モデル出力:
${rawText}`;
}

/**
 * Build the legacy plain text prompt for fallback summary generation.
 */
export function buildLegacyPrompt(
  periodLabel: string,
  topArticles: TopArticleInfo[]
): string {
  const topArticlesText = topArticles
    .slice(0, 5)
    .map(
      (a, i) =>
        `${i + 1}. [${a.sourceName}] ${a.translatedTitle || a.title}\n   - タグ: ${a.tags.slice(0, 3).join(', ')}\n   - スコア: ${a.score} (閲覧${a.viewCount}/お気に入り${a.favoriteCount})`
    )
    .join('\n');

  return `技術ニュース編集長として、記事タイトルを分析しエンジニア向けインサイトを作成してください。

## 絶対禁止
- 「X件あるから注目」「Y%を占める」のような統計の言い換え
- 「注目を集めています」「トレンドです」のような空虚な表現

## 入力データ
- 期間: ${periodLabel}
- 人気記事TOP5:
${topArticlesText}

## 出力形式（プレーンテキスト、Markdown禁止）

[注目トピック]
(1) 技術名: 記事タイトルから読み取れる具体的な動向・手法・ツールを書く
(2) 技術名: 記事タイトルから読み取れる具体的な動向・手法・ツールを書く
(3) 技術名: 記事タイトルから読み取れる具体的な動向・手法・ツールを書く

[アクションポイント]
記事タイトルを引用し、何を読むべきか・何を試すべきかを具体的に書く

## 良い例・悪い例
悪い: "AI: 記事数の44%を占め注目されている"
良い: "AI設計: 「小さな合意を積み重ねるプロトコル」のようなAIとの協働手法が登場"

悪い: "TypeScriptの型安全性に関する知見を深めることが推奨されます"
良い: "as const satisfiesでテストの型安全性を高める手法がKAKEHASHIから公開。既存テストへの適用を検討せよ"`;
}
