# Workflow Common Rules

3フェーズ（INVESTIGATE / PLAN / IMPLEMENT）共通のルール・テンプレート。

---

## 最終出力のステータス語彙（全コマンド共通）

| status | 意味 | 使用場面 |
|--------|------|---------|
| `SUCCESS` | 正常完了、次フェーズへ進行可 | 全コマンド |
| `FAILURE` | 失敗、修正が必要 | 全コマンド |
| `PARTIAL` | 一部完了・一部失敗 | pr-fix等 |
| `BLOCKED` | 前提条件不足で進行不可（nextで戻り先を指定） | plan, implement等 |
| `PENDING` | 外部の応答待ち | pr-review-response等 |

新規コマンド作成時はこの語彙から選択すること。

---

## フェーズ間ファイル引き継ぎ

### 入力ファイルの選択基準

前フェーズの出力ファイルが複数存在する場合:

1. **ユーザーが指定した場合**: 指定されたファイルを使用
2. **直前のフェーズで出力されたファイル名がコンソールに表示されている場合**: そのファイルを使用
3. **上記いずれでもない場合**: 最新のタイムスタンプのファイルを使用し、選択したファイル名をユーザーに通知

### 出力ファイルの命名

- タイムスタンプ取得: `date +%Y%m%d_%H%M%S_%3N`
- 出力ファイル名は必ずコンソールに表示すること

---

## ブランチライフサイクル

| フェーズ | ブランチ操作 |
|---------|-------------|
| INVESTIGATE | 確認のみ（作成しない） |
| PLAN | 確認のみ（作成しない）。計画書にブランチ名を記載 |
| IMPLEMENT | feature ブランチを作成（未作成の場合）。main直接作業禁止 |

---

## フェーズ別の禁止事項

| フェーズ | 禁止事項 |
|---------|---------|
| INVESTIGATE | コード修正、ブランチ作成、テスト実行・修正 |
| PLAN | コード修正、ブランチ作成、テスト実行 |
| IMPLEMENT | main直接作業 |

---

## タスク種別判定

### フロントエンドタスク
- 画面・ページの新規作成
- UIコンポーネントの追加・修正
- スタイル・レイアウトの変更
- デザインシステム・テーマ関連

### バックエンドタスク
- API新規作成・修正
- DB設計・スキーマ変更
- 認証・認可の実装
- サーバーサイドロジック

### 複合タスク（FE+BE）
- 上記の両方にまたがる場合
- INVESTIGATE/PLAN: 両方の観点で調査・設計
- IMPLEMENT: Agent Teams駆動（モード3）を検討

---

## コンテキスト管理

**調査・レビュー・実装作業はサブエージェントに委任し、メインセッションのコンテキストを節約すること。**

### メイン直接実行（例外）
- 単一ファイルの確認（Serena `find_symbol` / `get_symbols_overview`）
- 既に場所が特定されているコードの読解
- 10行以下の軽微な修正（IMPLEMENTフェーズのみ）

### 「関連するコードは全て読む」の解釈
全コードを把握する必要があるが、その作業自体はサブエージェントに委任する。
メインでは結果のサマリーを受け取り、判断に使う。

---

## 共通注意事項

- ファイルへの記述において絵文字を使用してはいけない
- 現在日付をミリ秒まで正確に取得: `date +%Y%m%d_%H%M%S_%3N`
- Context7 MCPを用いて最新のAPI/ライブラリ/ドキュメント情報を取得
- 必要であればSerena MCPを用いてプロジェクトの全体概要を確認

---

## CodexMCP相談記録フォーマット（使用時のみ）

各フェーズの出力ファイル末尾に以下を追記:

```markdown
## CodexMCP相談記録

### 日時
[date +%Y%m%d_%H%M%S_%3N で取得]

### 相談内容
[調査 / 設計レビュー / 実装方針 等]

### CodexMCPの回答
[回答内容を記録]

### 対応結果
[回答を踏まえた対応内容]
```

---

## 振り返り・継続的改善

### タスク完了時の必須アクション

1. **自己レビュー**: フェーズ中に発生したミスや非効率な点を振り返る
2. **知見の記録**: 重要な学びがあれば以下に記録
   - critical_rulesメモリ: 全セッションで守るべきルール
   - 関連するCLAUDE.md/設定ファイル: ルール・手順の明確化
3. **設定更新**: 同じミスを繰り返さないよう、必要に応じて設定を更新

### 記録フォーマット（各フェーズの出力ファイル末尾に追記）

```markdown
## 振り返り（YYYY-MM-DD）

### 発生したミス/非効率
- [内容]

### 原因
- [原因分析]

### 改善アクション
- [更新したファイル/ルール]
```

---

## 並列実行の判断基準

### 並列化の3条件

以下の3条件を **全て満たす** タスク同士のみ並列実行可能:

| # | 条件 | NG例 |
|---|------|------|
| 1 | **出力独立性**: Aの出力がBの入力に不要 | 調査結果を踏まえた設計（A→Bの依存） |
| 2 | **ファイル非競合**: 同一ファイルを編集しない | 同じコンポーネントのスタイルとロジックを別タスク |
| 3 | **論理非依存**: 実行順序が結果に影響しない | DBマイグレーション → それを使うAPI実装 |

### 並列化すべきでない例

- 認証バグ調査（auth code + tests + API）→ 全て関連するため1タスク
- FE/BEが密結合な設計（API仕様がUI構造に直結）→ 分割すると整合性リスク
- 同一ファイルのリファクタリング → ファイル競合

### 実行方法の選択

- 独立タスクが2つ以上 → Agent Teams または同一メッセージ内の複数Task tool並列呼び出し
- 1タスクのみ → サブエージェント単発
- **コスト意識**: Agent Teamsはトークンコスト3-4倍。変更規模が小さい場合（~50行以下）は単発サブエージェントを優先

### 禁止事項

- `run_in_background: true` は絶対に使用しない（完了通知をユーザー回答と誤認するリスク）
- 過剰分割の禁止（目安: 2-4タスク。迷ったら分割しない）

---

## フロントエンド関連のフェーズ別役割分担

| フェーズ | 目的 | スキル/エージェント | 成果物 |
|---------|------|-------------------|--------|
| INVESTIGATE | 現状の問題把握 | frontend-architect（現状分析） | Anti-Patterns検出結果、現状の問題リスト |
| PLAN | デザイン方針決定 | ui-ux-pro-max, frontend-design-system, frontend-architect（設計レビュー） | Frontend Design Decisions セクション |
| IMPLEMENT | 実装・検証 | frontend-design-system-implementer | 実装コード、Design System Compliance チェック |

### Anti-Patterns（全フェーズ共通の参照リスト）
- 汎用フォント（Inter, Roboto等）の過剰使用
- 紫→ピンクグラデーション等の「AIっぽい」デザイン
- 50/50均等分割のヒーローセクション
- デフォルトTailwindカラーそのままの使用

**フェーズ別の扱い:**
- INVESTIGATE: 既存UIでこれらが該当するかを検出・報告
- PLAN: 回避方針を設計し、代替案を選定
- IMPLEMENT: 実装時のチェックリストとして使用
# INVESTIGATE フェーズ

## 重要: INVESTIGATEフェーズの原則

**このフェーズでは調査のみを行う。コードの修正は一切行わない。**

### フェーズの役割分担
| フェーズ | 役割 | 行うこと |
|---------|------|----------|
| INVESTIGATE | 調査のみ | コードを読む、分析、根本原因特定、文書化 |
| PLAN | 計画のみ | 設計、修正手順、テスト計画の策定（writing-plans活用） |
| IMPLEMENT | 実作業 | ブランチ作成、コード修正、テスト実行（実行モード選択あり） |

### INVESTIGATEフェーズで行うこと
- 問題の再現確認（ユーザーに依頼）
- エラーメッセージ・ログの収集
- 関連コードの読解・分析
- 根本原因の特定
- 影響範囲の調査
- 調査結果の文書化

### INVESTIGATEフェーズで行わないこと
- コードの修正・編集
- ブランチの作成（IMPLEMENTで実施）
- 修正コードの記述（概要レベルの方針のみ可）
- テストの実行・修正

### スキル使用時の注意
- systematic-debugging等のスキルを使う場合も、INVESTIGATEフェーズ内では調査（Phase 1-3）までに留める
- Implementation（Phase 4）には進まない
- 修正はPLAN → IMPLEMENTの流れで実施

---

## 共通ルール参照
`.claude/rules/workflow-common.md` を参照（フェーズ間引き継ぎ、コンテキスト管理、共通注意事項等）

---

## 思考モード
このフェーズでは十分に検討して実行すること。

# ユーザの入力
#$ARGUMENTS

## 目的
背景・要件・制約の把握を行い、実装の方向性を決定する。

---

## 調査開始前チェック（superpowers:brainstorming）

以下のいずれかに該当する場合は、技術調査の前に brainstorming を実施:

| 条件 | 例 |
|------|-----|
| 要件が抽象的 | 「改善して」「良くして」「使いやすく」等 |
| 複数の実装アプローチが考えられる | 「認証を追加」→ OAuth? パスワード? SSO? |
| 新規概念・エンティティの導入が必要 | 「管理者機能」→ 管理者とは何か？ |
| 「そもそも〜とは何か」という問いが立てられる | 設計判断が必要なケース |
| ユーザーの真の意図が不明確 | 表面的な要求と本質的なニーズの乖離 |

**該当する場合（必須）:**
```
Skill tool: skill="superpowers:brainstorming"
```

brainstorming では以下を明確化:
- ユーザーの真の意図・目的
- 解決すべき本質的な問題
- 検討すべき設計オプション
- 各オプションのトレードオフ

**注意**: brainstorming をスキップして後から設計変更が必要になるケースを防ぐため、
判断に迷った場合は実施することを推奨。

---

## バグ調査時の手順（superpowers:systematic-debugging）

バグ・テスト失敗・予期しない動作の調査時は、systematic-debugging スキルを使用:

```
Skill tool: skill="superpowers:systematic-debugging"
```

**INVESTIGATEフェーズでは Phase 1-3 のみ実施:**
- Phase 1: Root Cause Investigation（根本原因調査）
- Phase 2: Pattern Analysis（パターン分析）
- Phase 3: Hypothesis and Testing（仮説検証）

**Phase 4: Implementation は IMPLEMENT フェーズで実施**

---

## タスク種別判定

タスク種別の定義と判定基準は `.claude/rules/workflow-common.md` の「タスク種別判定」を参照。
フロントエンド・バックエンド・複合タスク（FE+BE）の3種を判定する。

---

## 専門エージェントの活用

タスク種別や状況に応じて、適切な専門エージェントに調査を委任する。
エージェント選定は `agent-rules.md` の条件に従う。

**INVESTIGATEでの原則**: 現状把握が目的。方針決定・代替案選定はPLANフェーズで行う。

| 条件 | エージェント | 調査観点 |
|------|-------------|---------|
| FEタスク | frontend-architect | 現状分析、Anti-Patterns検出、a11y |
| BEタスク | backend-architect | API/DB現状分析 |
| セキュリティ関連 | security-engineer | 脆弱性、認証・認可 |
| パフォーマンス関連 | performance-engineer | ボトルネック、キャッシュ |
| 原因不明バグ | root-cause-analyst | 根本原因調査 |
| 要件が曖昧 | requirements-analyst | 要件整理・仕様定義 |

独立した調査対象が複数ある場合は、workflow-common.md の並列化基準に従って並列実行を検討する。

---

## コンテキスト管理（必須）

`.claude/rules/workflow-common.md` の「コンテキスト管理」を参照。

---

## 調査ツール

### Serena MCP（単一ファイル向け）
1. `get_symbols_overview`: ファイル全体のシンボル構造を把握
2. `find_symbol`: 特定のシンボル（クラス、関数等）を検索
3. `search_for_pattern`: パターンマッチングで柔軟に検索

### Context7 MCP
- 最新のAPI/ライブラリ/ドキュメント情報を取得

### CodexMCP相談（推奨）
- 複雑な事象を解析する場合は `mcp__codex-mcp__codex` に依頼
- 相談結果は investigate.md 末尾に記録（フォーマットは workflow-common.md 参照）

---

## 完了条件

調査完了時に以下が全て満たされていること:

- 問題の根本原因または実装方針が特定され、具体的なファイル・関数・データを根拠として示せている
- 影響範囲が関連ファイル・機能のリストとして明確になっている
- 次フェーズ（PLAN）への推奨事項が、選択肢とトレードオフを含む形で提示されている
- 調査結果が `.claude/docs/investigate/investigate_{TIMESTAMP}_{調査内容}.md` に文書化されている
- 出力ファイル名がコンソールに表示されている

## 注意事項
- 共通注意事項は `.claude/rules/workflow-common.md` を参照
- **コードの修正は行わない（調査のみ）**
- **ブランチ作成は行わない（IMPLEMENTフェーズで実施）**

---

## 出力ファイル
- `.claude/docs/investigate/investigate_{TIMESTAMP}_{調査内容}.md`

## 最終出力形式

### 調査完了（実装推奨）の場合
```
status: SUCCESS
next: PLAN
output: ".claude/docs/investigate/investigate_{TIMESTAMP}_{調査内容}.md"
details: "調査完了。PLANフェーズで実装計画を策定すること。"
```

### 調査完了（実装不要）の場合
```
status: SUCCESS
next: NONE
output: ".claude/docs/investigate/investigate_{TIMESTAMP}_{調査内容}.md"
details: "調査完了。既存機能で対応可能。実装・変更は不要。"
```

---

## 振り返り・継続的改善

`.claude/rules/workflow-common.md` の「振り返り・継続的改善」を参照。
investigate.md 末尾に記録フォーマットに従って追記する。
# PLAN フェーズ

## 重要: PLANフェーズの原則

**このフェーズでは計画策定のみを行う。コードの修正・テストの実行は行わない。**

---

## 共通ルール参照
`.claude/rules/workflow-common.md` を参照（フェーズ間引き継ぎ、コンテキスト管理、共通注意事項等）

---

## 思考モード
このフェーズでは十分に検討して実行すること。

# ユーザの入力
#$ARGUMENTS

## 目的
実装方針の決定、タスク分解、ファイル変更計画、テスト方針を策定する。

## 必要な入力ファイル
- `.claude/docs/investigate/investigate_{TIMESTAMP}_{調査内容}.md` - 調査結果
- 入力ファイルの選択基準は `.claude/rules/workflow-common.md` の「フェーズ間ファイル引き継ぎ」を参照

---

## 計画策定

3ステップ以上の実装やアーキテクチャ変更を伴う場合は、superpowers:writing-plans スキルを活用する。
プラン策定完了後は `/implement` へ移行すること（writing-plansの「Execution Handoff」は無視）。

---

## 実行モード推奨（IMPLEMENTフェーズへの申し送り）

計画書に「推奨実行モード」セクションを含め、以下の判定基準で推奨を記載:

| タスク構成 | 推奨モード |
|-----------|----------|
| 単一ファイル・10行以下・ロジック変更なし | モード1: 直接実行 |
| ロジック変更を伴う修正（順次実行） | モード2: バッチ実行 |
| 並列タスク2+（独立 or FE+BE） | モード3: Agent Teams駆動 |

**最終的なモード選択はIMPLEMENTフェーズで確定する。**

---

## 設計レビュー

計画書ドラフト作成後、タスク種別に応じた専門エージェントに設計レビューを依頼する。
エージェント選定は `agent-rules.md` の条件に従う。

**PLANでの原則**: 設計レビューが目的。コード生成は不要。

| タスク種別 | レビュー観点 |
|-----------|-------------|
| FEタスク | デザイン方針（ui-ux-pro-max, frontend-design-system活用）、Anti-Patterns回避、a11y |
| BEタスク | API/DB設計、大規模変更時はシステム全体への影響 |
| セキュリティ関連 | 認証・認可設計、脆弱性リスク |
| パフォーマンス関連 | ボトルネック予測、キャッシュ戦略 |

FEタスク時は計画書に「Frontend Design Decisions」セクションを含める（テンプレートは後述）。
独立したレビューが複数ある場合は、workflow-common.md の並列化基準に従って並列実行を検討する。

---

## テスト方針

計画書に以下の方針レベルで記載する（具体的なコマンドはIMPLEMENTフェーズで決定）:

- **テスト種別の選定**: エンドポイントテスト / 統合テスト / E2Eテスト
- **テスト対象**: 変更影響を受けるファイル・機能のリスト
- **新規テスト作成**: テストが存在しない箇所の特定
- **実行環境**: Docker環境での実行を前提

---

## コンテキスト管理（必須）

`.claude/rules/workflow-common.md` の「コンテキスト管理」を参照。
PLANフェーズでもコード読解やレビューをサブエージェントに委任し、コンテキストを節約する。

---

## 完了条件

計画策定完了時に以下が全て満たされていること:

- 実装方針・タスク分解・ファイル変更計画・テスト方針が文書化されている
- 推奨実行モードとリスク分析が記載されている
- 設計レビュー（該当するエージェント）が実施済み
- DB変更を含む場合、既存データのバックアップ方針が記載されている
- Codexレビューが実施済み（推奨）
- 計画書が `.claude/docs/plan/plan_{TIMESTAMP}_{計画内容}.md` に保存され、ファイル名がコンソール出力されている

## 注意事項
- 共通注意事項は `.claude/rules/workflow-common.md` を参照
- **コードの修正は行わない（計画策定のみ）**
- **ブランチ作成は行わない（IMPLEMENTフェーズで実施。計画書にブランチ名を記載）**

---

## 出力ファイル
- `.claude/docs/plan/plan_{TIMESTAMP}_{計画内容}.md`

## 最終出力形式

### プラン策定完了の場合
```
status: SUCCESS
next: IMPLEMENT
output: ".claude/docs/plan/plan_{TIMESTAMP}_{計画内容}.md"
details: "実装プラン策定完了。実装フェーズに移行。"
```

### 情報不足で進行不可の場合
```
status: BLOCKED
next: INVESTIGATE
output: ".claude/docs/plan/plan_{TIMESTAMP}_{計画内容}.md"
details: "情報不足。追加調査が必要。"
```

---

## 追加セクションテンプレート

### Frontend Design Decisions（フロントエンドタスク時）
```markdown
## Frontend Design Decisions

### Typography
- Heading: [選定フォント] (理由: ...)
- Body: [選定フォント] (理由: ...)

### Color Palette
- Primary: [色コード] - [用途]
- Accent: [色コード] - [用途]

### Layout Pattern
- [選定パターン] (理由: ...)

### Animation Strategy
- 高影響度ポイント: [適用箇所]
```

### 推奨実行モード
```markdown
## 推奨実行モード

- モード: [モード1: 直接実行 / モード2: バッチ実行 / モード3: Agent Teams駆動]
- 理由: [判定基準に基づく理由]
- タスク数: [N]
- 並列可能タスク数: [N]
- 領域: [FE / BE / FE+BE]
- 依存関係: [あり/なし - 概要]
```

### Specialist Agent Requests（複数エージェント依頼時）
```markdown
## Specialist Agent Requests

| Priority | Agent | Trigger | Request Date | Output |
| --- | --- | --- | --- | --- |
| P1 | frontend-architect | UI設計レビュー | {Date} | レビュー完了 |
| P2 | security-engineer | 認証変更 | {Date} | `.claude/docs/plan/.../security-review.md` |
```

---

## 振り返り・継続的改善

`.claude/rules/workflow-common.md` の「振り返り・継続的改善」を参照。
plan.md 末尾に記録フォーマットに従って追記する。
# IMPLEMENT フェーズ

# ユーザの入力
#$ARGUMENTS

## 目的
plan.mdに基づきタスク単位で実装を行う。

---

## 共通ルール参照
`.claude/rules/workflow-common.md` を参照（フェーズ間引き継ぎ、コンテキスト管理、共通注意事項等）

---

## コンテキスト管理（必須）

`.claude/rules/workflow-common.md` の「コンテキスト管理」を参照。
コード修正はサブエージェントに委任し、メインセッションのコンテキストを節約すること。

---

## 実行モード選択

plan.mdの「推奨実行モード」を参考に、最適な実行モードを確定する。
モード判定基準は plan.md と同じテーブルを参照。

### モード1: 直接実行（小規模のみ）

**適用条件**: 単一ファイル・10行以下・ロジック変更なしの場合のみ。

### モード2: バッチ実行（executing-plans スキル）

順次実行が必要なタスク、ユーザー確認が重要な変更に最適。

### モード3: Agent Teams駆動

**発動条件**: 並列実行可能な独立タスクが2つ以上、またはユーザーが明示的に要望。

並列化の判断基準は workflow-common.md を参照。トークンコストは約3-4倍だが、壁時計時間短縮とメインコンテキスト節約がメリット。

**制約**:
- 同一ファイルへの同時編集は禁止（共有ファイルはLeadが調整）
- `run_in_background: true` は使用禁止

### 最終処理

全タスク完了後、いずれのモードでも:

```
Skill tool: skill="superpowers:finishing-a-development-branch"
```

これにより:
- テスト全パス確認
- 完了オプション提示（merge/PR/continue）
- 選択実行

その後 `/verify` へ移行。

---

## 必要な入力ファイル
- `.claude/docs/plan/plan_{TIMESTAMP}_{計画内容}.md` - 実装計画書
- 入力ファイルの選択基準は `.claude/rules/workflow-common.md` の「フェーズ間ファイル引き継ぎ」を参照
- 関連する既存ファイル・コード

---

## スキル活用

| 状況 | スキル | 適用 |
|------|--------|------|
| 新機能実装 | superpowers:test-driven-development | 必須（Red→Green→Refactor） |
| バグ修正・リファクタリング | superpowers:test-driven-development | 推奨 |
| エラー・テスト失敗・予期しない動作 | superpowers:systematic-debugging | 必須（推測修正の前に実施） |

---

## エージェント・スキル呼び出し（ユーザー確認不要）

### フロントエンドタスク時

frontend-design-system-implementer エージェントで実装。PLANの Frontend Design Decisions との整合性を確認する。

**実装後セルフチェック**:
- タイポグラフィ: 見出しと本文に異なるフォント
- カラー: 5色以上の調和したパレット
- アニメーション: 1-2の高影響度ポイントのみ
- 一貫性: Plan段階で決定したデザインシステムへの準拠

### 条件別呼び出し

| 条件 | 呼び出し | タイミング |
|------|---------|-----------|
| 大規模リファクタリング（3ファイル以上 OR 100行以上） | refactoring-expert | 開始前 |
| セキュリティ関連実装 | security-engineer | 実装前レビュー |
| パフォーマンス関連実装 | performance-engineer | 実装前レビュー |
| 複雑なテスト作成 | quality-engineer | テスト設計時 |
| エラー・障害発生時 | root-cause-analyst | 問題発生時 |

---

## 実装後レビュー（必須）

3ファイル以上の変更またはロジック変更を含む場合、以下のレビューを実施:

| 順序 | ツール | 実施 |
|------|--------|------|
| 1 | cross-review スキル | 必須（Codex+Gemini+Claude並列） |
| 2 | CodeRabbit CLI | 推奨（`coderabbit review --plain -t uncommitted`） |
| 3 | code-reviewer + silent-failure-hunter | 必須（並列実行） |

**条件付きレビュー**:

| 条件 | エージェント |
|------|-------------|
| 新規型の追加 | pr-review-toolkit:type-design-analyzer |
| コード簡略化が必要 | pr-review-toolkit:code-simplifier |

---

## Serena MCP編集フロー

1. `get_symbols_overview`: ファイル全体のシンボル構造を把握
2. `find_symbol`: 特定のシンボル（クラス、関数等）を検索
3. `find_referencing_symbols`: 依存関係を把握
4. `replace_symbol_body`: 安全なシンボル置換

**注意**: 探索が3ステップ以上になる場合は `Task(subagent_type="Explore")` を使用（コンテキスト節約）

---

## 個別テスト実行ガイドライン

変更ファイルに応じた推奨テストコマンド:

**テストファイルを修正した場合、必ず `npm run docker:build:ci` を実行**

```bash
# lib/services/*.ts 変更時
export TEST_FILE="__tests__/lib/services/対象サービス.test.ts" && npm run docker:test:file

# app/api/*/route.ts 変更時
export TEST_FILE="__tests__/api/対象API.test.ts" && npm run docker:test:file

# components/**/*.tsx 変更時
export TEST_FILE="__tests__/components/対象コンポーネント.test.tsx" && npm run docker:test:file

# lib/hooks/*.ts 変更時
export TEST_FILE="__tests__/lib/hooks/対象フック.test.ts" && npm run docker:test:file
```

- 複数ファイル変更時: 各ファイルの個別テストを順次実行
- 影響範囲が広い場合: /test-full フェーズで全体テスト実施を推奨

---

## 完了条件

実装完了時に以下が全て満たされていること:

- feature ブランチで作業している（main直接作業禁止）
- plan.md のタスクが全て実装されている
- 変更した機能に対するテストが作成・更新され、全てパスしている
- 実装後レビュー（cross-review + code-reviewer + silent-failure-hunter）が実施済み
- レビュー指摘事項が対応済み
- 適切な粒度でコミットされている
- 実装内容が `.claude/docs/implement/implement_{TIMESTAMP}_{実装内容}.md` に記録され、ファイル名がコンソール出力されている

## 注意事項
- 共通注意事項は `.claude/rules/workflow-common.md` を参照
- 変更対応した箇所に対してのテストはもれなく作成すること
- パフォーマンス/セキュリティ面を触る実装は、それぞれのエージェントにレビュー依頼してからテスト着手

## ブランチ・コミット規則
- コミットメッセージ: 同ガイドラインに従う
- 小粒コミット: タスク単位で適切に分割

---

## 出力ファイル
- `.claude/docs/implement/implement_{TIMESTAMP}_{実装内容}.md` - 実装詳細記録

## 最終出力形式

### 実装完了の場合
```
status: SUCCESS
next: VERIFY
output: ".claude/docs/implement/implement_{TIMESTAMP}_{実装内容}.md"
details: "実装完了。verifyフェーズへ移行。"
```

### 進行不可の場合
```
status: BLOCKED
next: IMPLEMENT or PLAN
output: ".claude/docs/implement/implement_{TIMESTAMP}_{実装内容}.md"
details: "進行不可の理由と、戻り先フェーズ（IMPLEMENT: 追加実装が必要 / PLAN: 設計変更が必要）"
```

---

## 追加セクションテンプレート

### Frontend Implementation Notes（フロントエンドタスク時）
```markdown
## Frontend Implementation Notes

### Applied Patterns
- Button: [パターン名]
- Card: [パターン名]
- Layout: [パターン名] (理由: ...)

### Anti-Patterns Avoided
- [回避したパターン1]
- [回避したパターン2]

### Design System Compliance
- [ ] タイポグラフィ: 見出し/本文に異なるフォント使用
- [ ] カラー: 独自パレット適用
- [ ] レイアウト: 非対称/独自グリッド
- [ ] アニメーション: 高影響度ポイントのみ
- [ ] アクセシビリティ: コントラスト比4.5:1以上
```

### Specialist Reviews（レビュー実施時）
```markdown
## Specialist Reviews

### code-reviewer
- Requested: {Date}
- Result: [結果サマリ]

### silent-failure-hunter
- Requested: {Date}
- Result: [結果サマリ]
```

---

## 振り返り・継続的改善

`.claude/rules/workflow-common.md` の「振り返り・継続的改善」を参照。
implement.md 末尾に記録フォーマットに従って追記する。
# PR修正フェーズ

# ユーザの入力
#$ARGUMENTS

## 目的
PRのレビューコメント（自動レビューツール含む）を解析し、指摘内容に従ってコードを修正する。

## 使用方法
```bash
/pr-fix <PR番号> [レビューID または レビューURL]
```

### 例
```bash
/pr-fix 177                                                                    # 全コメント取得
/pr-fix 177 3418892442                                                        # 特定レビューIDのコメントのみ
/pr-fix https://github.com/owner/repo/pull/177#pullrequestreview-3418892442   # レビューURL指定
```

---

## コメント取得戦略

### 取得対象（全て取得する）

| API | 取得内容 |
|-----|---------|
| `/pulls/{pull_number}/reviews` | レビュー一覧（Approve, Request changes, Comment） |
| `/pulls/{pull_number}/comments` | Review comments（コード上の特定行へのコメント） |
| `/issues/{issue_number}/comments` | Issue comments（PR全体へのコメント、自動レビューツール含む） |

### 自動レビューツール（CodeRabbit等）のコメント分類

Issue comments 内のマークダウンから以下のセクションを抽出:

| セクション | 優先度 | 説明 |
|-----------|--------|------|
| **Actionable comments** | P1（必須） | 実際にアクションが必要なコメント |
| **Outside diff range comments** | P2（推奨） | diff範囲外だが関連する指摘 |
| **Nitpick comments** | P3（推奨） | 軽微な指摘（スタイル等）※基本対応 |

---

## コメント取得

3種類全てのAPIを呼ぶこと（1つでも欠けるとnitpick等を取りこぼす）:

```bash
gh api repos/$REPO_INFO/pulls/$PR_NUMBER/reviews
gh api repos/$REPO_INFO/pulls/$PR_NUMBER/comments
gh api repos/$REPO_INFO/issues/$PR_NUMBER/comments  # CodeRabbit等のnitpickはここにある
```

### 6. コード修正実行

コード修正はサブエージェントに委任する（context-management.md参照）。

- 異なるファイルへの独立した修正が2つ以上 → 並列実行（workflow-common.md参照）
- それ以外 → 単発サブエージェント
- 単一ファイル・10行以下・ロジック変更なし → メイン直接実行可

修正後は必ず `npx tsc --noEmit` と `npm run lint` で確認すること。

### 7. 修正完了レポート

```
[修正完了レポート]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
OK P1-1: path/to/file.ts - エラーハンドリングを追加
OK P1-2: path/to/file.ts - 型定義を修正
OK P2-1: path/to/related.ts - 関連箇所を修正
SKIP P3-1: path/to/file.ts - 指摘が不適切（理由: 既存パターンと矛盾）
OK Review-1: path/to/file.ts - ロジックを改善
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

対応: 4/5 (80%)
スキップ理由: P3-1 は指摘が不適切（既存パターンと矛盾するため）
```

### 8. テスト実行

修正したファイルに関連するテストを実行する。

```bash
# 修正ファイルに対応するテストファイルを特定
# テストファイル変更時は先にCIイメージをリビルド
npm run docker:build:ci

# 関連テストを実行
TEST_FILE="__tests__/対象テスト.test.ts" npm run docker:test:file
```

- 修正ファイルごとに対応テストを実行
- テスト失敗時: 修正してから次へ進む

### 9. Verify実行（pushの前提条件）

**pushする前に必ず`/verify`相当のチェックを通すこと。**

```bash
npm run lint        # 0 errors, 0 warnings 必須
npm run type-check  # 型エラー0件
```

- lint warningが残っている場合: 修正してから再実行
- 失敗時: 修正してから再実行

### 10. Git操作（verify通過後のみ）

```bash
git add .
git commit -m "fix: PR #$PR_NUMBER のレビューコメントを反映

- P1: Actionable comments x2
- P2: Outside diff range x1
- Review comments x1"
git push origin $(git rev-parse --abbrev-ref HEAD)
```

**重要: テスト実行とverify通過を確認してからpushすること。pushは最後のステップ。**

---

## 注意事項

- Context7 MCPを用いて最新のAPI/ライブラリ/ドキュメント情報を取得
- Serena MCPを用いて最新のコードを取得し、シンボル単位で編集
- 十分に検討して作業を行うこと
- P1（Actionable）は必須対応、P3（Nitpick）も基本対応（指摘が不適切な場合のみスキップ可、理由を明記）
- 対応完了している指摘は「既に対応済み」としてスキップ
- エラーが発生した場合も、可能な限り他の修正を続行

---

## 最終出力形式

### 修正成功の場合
```
status: SUCCESS
next: VERIFY
details: "PR #177 のレビューコメント対応完了。対応: 4/5 (80%)"
```

### 一部修正失敗の場合
```
status: PARTIAL
next: IMPLEMENT
details: "PR #177 のレビューコメント一部対応。対応: 3/5 (60%)。失敗: P1-2"
```

### 修正失敗の場合
```
status: FAILURE
next: INVESTIGATE
details: "PR #177 のレビューコメント対応失敗。エラー: [エラー内容]"
```
# VERIFY フェーズ

# ユーザの入力
#$ARGUMENTS

## 目的
PR作成前の品質ゲート（必須）。lint/type-check/audit/buildの最終確認を行い、preventable errorsを事前に検出する。

## 注意事項
- Context7 MCPを用いて最新のAPI/ライブラリ/ドキュメント情報を取得
- 現在日付をミリ秒まで正確に取得: `date +%Y%m%d_%H%M%S_%3N`
- 絵文字は使用しない

---

## 原則

**証拠が先、主張は後（Evidence before assertions）**: 検証コマンドを実行し、出力を確認してから成功を宣言する。推測や記憶に基づく完了宣言は禁止。

---

## 実行内容（fail-fast）

以下の順序で実行し、失敗時は即座に停止:

  ### 1. Lint Check

  ```bash
  npm run lint
  ```

  - 実行時間: ~10秒
  - 目的: コードスタイル、ESLintルール違反の検出
  - **合格基準: 0 errors かつ 0 warnings**（warningも放置しない）
  - warningが残っている場合: 即座に停止し、warningを修正してから再実行
  - 失敗時: 即座に停止、エラー/warning詳細を報告

  ### 2. Type Check

  ```bash
  npm run type-check
  ```

  - 実行時間: ~15-30秒
  - 目的: TypeScript型安全性の検証
  - 失敗時: 即座に停止、エラー詳細を報告

  ### 3. Security Audit

  ```bash
  npm audit --production --audit-level=high
  ```

  - 実行時間: ~5-10秒
  - 目的: 本番依存関係の重大な脆弱性検出
  - 失敗時: 即座に停止、脆弱性詳細を報告

  ### 4. Build Verification

  ```bash
  npm run docker:build
  ```

  - 実行時間: ~30-60秒
  - 目的: 本番ビルドの成功確認
  - 失敗時: 即座に停止、ビルドエラーを報告

  ## 実行時間目標

  - 通常（Build含む）: ≤120秒（2分以内）
  - Build失敗等: 適宜調整

  ## 出力形式

### 5. 最終レビュー（オプション）

全チェック成功後、Codexによる最終レビューを実行:

```
Skill tool: skill="codex"
prompt: "PR作成前の最終確認として、直近の変更内容に問題がないかレビューしてください。セキュリティ、パフォーマンス、コード品質の観点から確認をお願いします。"
```

**実施条件:**
- 重要な機能変更時: **推奨**
- セキュリティ関連の変更: **推奨**
- 大規模な変更（5ファイル以上）: **推奨**

### 全チェック成功の場合

```
[VERIFY] Running lint...
[VERIFY] OK Lint PASSED - 0 errors, 0 warnings (10s)

[VERIFY] Running type-check...
[VERIFY] OK Type-check PASSED (25s)

[VERIFY] Running security audit...
[VERIFY] OK Audit PASSED (8s)

[VERIFY] Running build verification...
[VERIFY] OK Build PASSED (45s)

[VERIFY] Running final review (optional)...
[VERIFY] OK Final review completed

Total time: 88 seconds

status: SUCCESS
next: PR_CREATE
details: "All verification checks passed. Ready for PR creation."
```

### チェック失敗の場合

```
[VERIFY] Running lint...
[VERIFY] NG Lint FAILED

Error: 4 ESLint errors in app/search/agent/components/agent-answer-panel.tsx
  Line 198: react/no-unescaped-entities

status: FAILURE
next: IMPLEMENT
details: "Lint check failed. Fix errors before PR creation."
```

  ## 注意事項

  - 各チェックは順次実行（fail-fast: エラー発生時は即座に停止し、詳細を報告）
  - 全チェック成功後のみPR作成フェーズへ移行
  - Build Verification（ステップ4）はユーザーが明示的にスキップを指示した場合のみ省略可

  ## 使用例

  ```bash
  /verify
  ```

  実行すると、上記の4ステップチェックが順次実行されます。

---

## 振り返り・継続的改善

`.claude/rules/workflow-common.md` の「振り返り・継続的改善」を参照。
# PR作成フェーズ

# ユーザの入力
#$ARGUMENTS

## 目的
実装・テスト完了後、PRを作成する。

## 必要な入力ファイル
- 最新の `.claude/docs/implement/implement_{TIMESTAMP}_{実装内容}.md`
- 最新の `.claude/docs/test/test_{TIMESTAMP}_{テスト内容}.md`（存在する場合）

---

## 開発ブランチ完了判断

PR作成前に finishing-a-development-branch スキルでブランチの完了状態と統合方法を確認する（必須）。

---

## PR説明文のレビュー（必須）

PR説明文作成後、codex MCPでレビューを実施する。

**確認ポイント**:
- 変更内容が正確に伝わるか
- 技術的な説明が適切か
- レビュアーが理解しやすい構成か

**注意**: コードレビューはimplementフェーズで実施済みのため、ここではPR説明文のみレビュー

---

## 完了条件

PR作成完了時に以下が全て満たされていること:

- 未コミットの変更がコミット済み（コンベンショナルコミット形式）
- ブランチがリモートにプッシュ済み
- PR説明文がcodex MCPでレビュー済み
- PRが作成され、URLがコンソール出力されている

## 注意事項
- コミットメッセージはコンベンショナルコミット形式（feat:, fix:, docs:, test:, refactor:, chore:）
- 絵文字は使用しない
- 現在日付をミリ秒まで正確に取得: `date +%Y%m%d_%H%M%S_%3N`
- 未コミットの変更がある場合は必ずコミット
- ブランチがリモートに存在しない場合は必ずプッシュ
- デフォルトは通常PR作成（自動レビューツールが動作する）
- Draft PRが必要な場合のみ --draft オプションを追加

---

## PR説明文フォーマット

```markdown
## Summary
<1-3 bullet points>

## Implementation Details
<implement.mdの要約>

## Test Results
<test.mdの要約>

## Checklist
- [ ] Tests passing
- [ ] Documentation updated
- [ ] No breaking changes

Generated with Claude Code
```

---

## 出力ファイル
- なし（PRのみ作成）

## 最終出力形式

### PR作成成功の場合
```
status: SUCCESS
next: PR_REVIEW
details: "PR作成完了。PR URL: https://github.com/..."
```

### PR作成失敗の場合
```
status: FAILURE
next: IMPLEMENT
details: "PR作成失敗。エラー: [エラー内容]"
```
# PR Review Response フェーズ

# ユーザの入力
#$ARGUMENTS

## 目的
PRに対するコードレビューフィードバックを受け取り、適切に対応する。

---

## コードレビュー対応（superpowers:receiving-code-review）

**重要**: レビューフィードバックを受け取ったら、まずこのスキルを実行。

```
Skill tool: skill="superpowers:receiving-code-review"
```

**このスキルが強制する原則:**
- パフォーマティブな同意（表面的な「おっしゃる通りです」）を禁止
- 盲目的な実装を禁止
- 技術的な厳密さと検証を要求
- 不明確・技術的に疑わしいフィードバックには確認を取る

**対応フロー:**
1. レビューコメントを全て読む
2. 各コメントを分類:
   - 明確な改善指摘 -> 実装
   - 技術的に疑わしい指摘 -> 検証してから対応
   - 不明確な指摘 -> 質問で明確化
   - 意見の相違 -> 根拠を示して議論
3. 対応内容をコミット
4. レビュアーに返信

---

## タスクに含まれるべきTODO

1. PRのレビューコメントを全て取得（`gh pr view --comments` または GitHub UI）
2. **【必須】superpowers:receiving-code-review を実行**
3. 各コメントを分類・分析
4. 技術的に疑わしい指摘は検証:
   - 本当にその問題が存在するか確認
   - 提案された修正が適切か検証
   - 必要に応じてテストで確認
5. 明確な改善指摘を実装
6. 不明確な点はレビュアーに質問
7. 変更をコミット
8. PRにレビュー対応を返信

## 注意事項

- **「おっしゃる通りです」で始めない** - 技術的な判断を示す
- **盲目的に実装しない** - 指摘が正しいか検証する
- **根拠を示す** - 同意する場合も反論する場合も理由を明確に
- レビュアーの指摘が間違っている場合は、丁寧に根拠を示して説明
- 現在日付をミリ秒まで正確に取得: `date +%Y%m%d_%H%M%S_%3N`

---

## 対応パターン

### 明確な改善指摘の場合

```markdown
指摘: "この関数は長すぎるので分割してください"
分析: コードを確認 -> 確かに50行を超えており、責務が複数ある
対応: 関数を分割して実装
返信: "ご指摘の通り責務が混在していたため、[関数A]と[関数B]に分割しました。"
```

### 技術的に疑わしい指摘の場合

```markdown
指摘: "ここはasync/awaitではなくPromise.allを使うべき"
分析: 実際の処理を確認 -> 順次実行が必要な依存関係がある
検証: 並列実行するとデータ不整合が発生することを確認
返信: "検証したところ、処理Aの結果を処理Bで使用するため順次実行が必要です。
      並列実行すると[具体的な問題]が発生します。"
```

### 不明確な指摘の場合

```markdown
指摘: "ここはもっと良くできそう"
返信: "具体的にどの点を改善すべきかご教示いただけますか？
      パフォーマンス、可読性、保守性のどの観点でしょうか？"
```

---

## 出力ファイル
- なし（PRへの返信のみ）

## 最終出力形式

### 対応完了の場合
```
status: SUCCESS
next: PR_REVIEW (再レビュー待ち)
details: "レビュー対応完了。[N]件の指摘に対応、[M]件は質問を返信。"
```

### 追加議論が必要な場合
```
status: PENDING
next: PR_REVIEW_RESPONSE
details: "技術的な議論が必要。[具体的な論点]についてレビュアーの回答待ち。"
```
