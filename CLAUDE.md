# TechTrend - CLAUDE.md

このファイルは、Claude Codeがこのプロジェクトで作業する際の重要な注意事項とガイドラインです。

**重要: 修正作業を行う前に、必ず `CODE-MAINTENANCE-GUIDE.md` を確認してください。**
このガイドには、影響範囲の把握方法、関連箇所の確認手順、検証方法が詳しく記載されています。

## 🚨 最重要: 要約生成プロセスの変更時の注意事項

### 絶対に守るべきルール

**要約生成はこのプロジェクトの中核機能です。変更時は以下を必ず実施してください：**

1. **既存データへの影響確認（必須）**
   - 変更前に必ず影響を受ける記事数を確認: `SELECT COUNT(*) FROM Article WHERE ...`
   - 1件でも影響がある場合は、サンプルデータで動作確認を実施
   - 大量のデータに影響する場合は、段階的な移行計画を立てる

2. **データフォーマットの保持（必須）**
   - 一覧要約: 改行不要、1行のテキスト
   - 詳細要約: **改行必須**、箇条書き形式を保持
   - cleanupText関数とcleanupDetailedSummary関数は別処理として扱う

3. **変更前後の比較テスト（必須）**
   ```bash
   # 変更前のデータを保存
   echo "SELECT id, summary, detailedSummary FROM Article LIMIT 5" | sqlite3 prisma/dev.db > before.txt
   
   # 変更実施
   
   # 変更後の生成テスト
   npx tsx scripts/test/test-unified-summary.ts
   
   # 表示確認（最重要）
   npm run dev でブラウザで実際の表示を確認
   ```

4. **テストの実行（必須）**
   - 単体テスト: `npm test`
   - 統一要約テスト: `npx tsx scripts/test/test-unified-summary.ts`
   - 手動での表示確認: 必ずブラウザで詳細要約の表示を確認

### 過去の失敗事例（2025年1月）

**問題**: cleanupText関数を詳細要約にも適用し、改行が削除される重大なバグを発生させた
- 影響: 1238件の既存記事の詳細要約が1行になり読みづらくなった
- 原因: 基本的な確認不足、テスト不足、影響範囲の考慮不足
- 教訓: データフォーマットの違いを理解し、適切な処理を適用する

### チェックリスト

要約生成関連の変更時は以下を確認：
- [ ] 既存データへの影響を数値で把握したか？
- [ ] 一覧要約と詳細要約で異なる処理が必要か確認したか？
- [ ] 改行の扱いを正しく理解しているか？
- [ ] テストデータで動作確認したか？
- [ ] ブラウザで実際の表示を確認したか？
- [ ] 大量データへの影響を考慮したか？

## 検索機能の仕様

### 複数キーワード検索（2025年1月11日実装）

TechTrendの検索機能は、半角スペースまたは全角スペースで区切られた複数キーワードのAND検索をサポートしています。

**動作仕様：**
- 単一キーワード: タイトルまたは要約のいずれかに含まれる記事を検索（OR検索）
- 複数キーワード: すべてのキーワードを含む記事を検索（AND検索）
  - 例: 「TypeScript React」→ TypeScriptとReactの両方を含む記事
  - 例: 「JavaScript　Vue」（全角スペース）→ JavaScriptとVueの両方を含む記事

**技術実装：**
- `app/api/articles/route.ts`: 検索ロジックの実装
- キャッシュキー: キーワードをソートして正規化
- Prismaクエリ: `AND`演算子で複数条件を構築

## Serena MCP優先利用（TechTrendプロジェクト専用）

### 必須: プロジェクト作業時のSerena MCP使用

**すべての作業でSerena MCPを優先的に使用すること**

#### 1. 作業開始時（必須）
```
1. mcp__serena__check_onboarding_performed を実行
2. mcp__serena__list_memories でメモリ確認
3. 関連メモリを mcp__serena__read_memory で読み込み
```

#### 2. 主要メモリファイル
- `techtrend_project_overview_*`: プロジェクト全体概要
- `techtrend_recent_improvements_*`: 最近の改善内容
- `source_stats_cache_implementation_*`: 統計情報キャッシュ実装
- `techtrend_database_schema_*`: データベース構造
- `techtrend_api_endpoints_*`: APIエンドポイント一覧
- `techtrend_fetchers_implementation_*`: フェッチャー実装詳細

#### 3. コード調査時
```
# ファイル構造の把握
mcp__serena__get_symbols_overview relative_path="lib/fetchers"

# 特定シンボルの検索
mcp__serena__find_symbol name_path="BaseFetcher"

# 依存関係の確認
mcp__serena__find_referencing_symbols name_path="calculateSourceStats"

# パターン検索
mcp__serena__search_for_pattern substring_pattern="summary.*undefined"
```

#### 4. コード修正時
```
# シンボル単位の修正
mcp__serena__replace_symbol_body name_path="getAllSources"

# 正規表現による修正
mcp__serena__replace_regex regex="avgQualityScore: 0"

# 新規コードの挿入
mcp__serena__insert_after_symbol name_path="constructor"
```

#### 5. 作業完了時
```
# 変更内容をメモリに保存
mcp__serena__write_memory memory_name="{feature}_implementation_{YYYYMM}"

# 完了確認
mcp__serena__think_about_whether_you_are_done
```

## データベース接続

**重要: 必ず以下のデータベースパスを使用すること**
- 正しいDBパス: `prisma/dev.db`
- SQLiteコマンド例: `sqlite3 prisma/dev.db`
- 間違い: `techtrend.db`、`.prisma/dev.db`（これらは存在しない）

```bash
# 正しい使用例
echo "SELECT COUNT(*) FROM Article;" | sqlite3 prisma/dev.db

# テーブル一覧確認
echo ".tables" | sqlite3 prisma/dev.db

# スキーマ確認
echo ".schema Article" | sqlite3 prisma/dev.db
```

## 重要な運用ルール

### 1. 記事要約の生成

**絶対に守るべきルール：**
- すべてのフェッチャーで `summary: undefined` を設定すること
- 要約は必ず `generate-summaries.ts` スクリプトで日本語生成すること
- フェッチャー内で要約を生成してはいけない（英語要約や本文切り抜きになるため）

**影響を受けるフェッチャー：**
- `lib/fetchers/devto.ts` - ✅ 修正済み
- `lib/fetchers/zenn.ts` - ✅ 修正済み
- `lib/fetchers/qiita.ts` - ✅ 修正済み
- その他すべてのフェッチャー

### 2. 記事品質フィルタリング と 取得件数

**Dev.to:**
- 反応数（positive_reactions_count）10以上
- 読了時間（reading_time_minutes）2分以上
- 日別トップ記事（top=1）を優先取得
- 最大30件/回

**Qiita:**
- ストック数10以上（stocks:>10）
- 24時間以内の記事
- 最大30件/回

**Zenn:**
- デイリートレンドフィード使用
- 複数トピックから取得（ZennExtendedFetcher使用時）
- 最大30件/回

**はてなブックマーク:**
- テクノロジーカテゴリ
- 最大40件/回

**Speaker Deck:**
- 日本語プレゼンテーション
- トレンドページから最大30件/回

### 3. スケジューラー設定

**RSS系ソース（1時間ごと更新）:**
- はてなブックマーク
- Qiita
- Zenn
- Dev.to
- Publickey
- Stack Overflow Blog
- Think IT

**スクレイピング系ソース（12時間ごと更新 - 0時・12時）:**
- Speaker Deck

設定ファイル: `scheduler-v2.ts`
PM2設定: `ecosystem.config.js`

### 4. 記事コンテンツの保存

**Dev.to:**
- `description` を `content` フィールドに保存
- APIから個別記事の詳細取得が可能（`scripts/update-devto-content.ts`）

### 5. データベース管理

**低品質記事の削除基準:**
- Dev.to: 反応数0の記事
- 全ソース: 3ヶ月以上前の記事

削除スクリプト: `scripts/delete-low-quality-articles.ts`

### 6. イベント記事除外機能

**Corporate Tech Blogのイベント記事フィルタリング:**
- 環境変数: `EXCLUDE_EVENT_ARTICLES` (デフォルト: false)
- 除外対象: 登壇、イベント、セミナー、勉強会、カンファレンス、meetup、参加募集などを含む記事
- 例外: 「振り返り」「レポート」「技術解説」「まとめ」を含む記事は除外しない
- 設定方法: `.env`ファイルに `EXCLUDE_EVENT_ARTICLES=true` を追加

動作確認: `EXCLUDE_EVENT_ARTICLES=true npx tsx scripts/test-event-filter.ts`

## よくある問題と対処法

### 問題1: 要約が英語になる / 本文がそのまま表示される

**原因:** フェッチャーで要約を生成している
**対処:** フェッチャーの `summary` を `undefined` に設定

### 問題2: Dev.toの要約が「記事内容が提示されていない」となる

**原因:** content フィールドが空
**対処:** `scripts/update-devto-content.ts` で記事詳細を取得

### 問題3: 低品質な記事が混入する

**原因:** フィルタリング条件が緩い
**対処:** 各フェッチャーの品質フィルタリング条件を強化

## 開発時の注意事項

1. 新しいフェッチャーを追加する際は、必ず `summary: undefined` を設定
2. 要約生成は `generate-summaries.ts` に任せる
3. スケジューラーに新ソースを追加する際は、RSS系かスクレイピング系かを判断
4. 品質フィルタリングを適切に設定する
5. **重要：機能の追加・修正・削除を行った場合は、作業内容の保持のため都度コミットする**

## 🔴 コード修正時の必須ルール（2025年1月の失敗事例より）

### 絶対に守るべき修正プロセス

**以下のルールを守らなかった結果、修正が絡み合って収拾がつかなくなる事態が発生しました。**
**二度と同じ失敗を繰り返さないため、これらのルールは最上位優先度で遵守すること。**

#### 1. 修正前の影響調査（必須）
```bash
# 修正対象の関数・クラスの使用箇所を完全に把握
mcp__serena__find_referencing_symbols name_path="対象関数名"

# 依存関係の洗い出し
grep -r "対象関数名" --include="*.ts" --include="*.tsx"

# 現在の動作状態を記録
echo "修正前の動作確認" > modification_log.txt
npm test >> modification_log.txt
```

#### 2. 最小単位での修正とコミット（必須）
- **一つの問題 = 一つの修正 = 一つのコミット**
- 複数の問題を同時に修正することは絶対禁止
- 各修正後は必ずテストを実行してからコミット

```bash
# 良い例
git add specific_file.ts
git commit -m "fix: 特定の問題を修正"
npm test  # 必須
```

#### 3. 作業ブランチの使用（必須）
```bash
# 必ず作業用ブランチを作成
git checkout -b fix/specific-issue

# mainブランチでの直接修正は禁止
# 問題が発生してもmainは安全な状態を保持
```

#### 4. 修正前の完全な状態記録（必須）
```bash
# 現在動作している機能のリスト作成
echo "動作確認済み機能:" > working_features.txt
echo "- 記事一覧表示 ✓" >> working_features.txt
echo "- 要約生成 ✓" >> working_features.txt

# 既知の問題リスト作成
echo "既知の問題:" > known_issues.txt
echo "- 問題1: 詳細説明" >> known_issues.txt
```

#### 5. 問題発生時の即座の停止（必須）
- 修正によって新たな問題が発生した場合、即座に作業を停止
- 絶対に「ついでに直す」をしない
- 問題の連鎖を防ぐため、一旦立ち止まって状況を整理

### チェックリスト（修正作業前に必ず確認）

修正作業を開始する前に、以下のすべてにチェックを入れること：

- [ ] 修正対象の影響範囲を完全に把握したか？
- [ ] 作業用ブランチを作成したか？
- [ ] 現在の動作状態を記録したか？
- [ ] 修正を最小単位に分割したか？
- [ ] テスト実行環境は整っているか？
- [ ] 問題が発生した場合の撤退計画はあるか？

### 失敗パターン（絶対に避けること）

1. **❌ 複数の問題を同時に修正する**
   - 「ついでにこれも直そう」は厳禁
   - 問題が絡み合って原因特定が困難になる

2. **❌ テストなしでの連続修正**
   - 各修正後のテストをスキップしない
   - 問題の早期発見が遅れる

3. **❌ mainブランチでの直接作業**
   - 退路を断つ行為
   - 問題発生時に元に戻せなくなる

4. **❌ 影響範囲の調査不足**
   - 「たぶん大丈夫」での修正は禁止
   - 必ず依存関係を完全に把握する

5. **❌ 問題発生後の強行突破**
   - 修正が失敗したら一旦停止
   - 状況を整理してから再開

### 復旧手順（問題が発生した場合）

```bash
# 1. 現在の状態を一時保存
git stash

# 2. 直近の安定版まで戻る
git checkout <安定版のコミットハッシュ>

# 3. 新しいブランチで慎重に再開
git checkout -b fix/retry-carefully

# 4. 一つずつ確実に修正
# 5. 各ステップでテスト実行
```


## Claude Code統合機能

### 概要
Claude Codeを使用した要約生成・品質比較機能が利用可能です。Gemini APIのRate Limit問題を回避したい場合や、高品質な要約が必要な場合に使用してください。

### 使用方法

**1. Claude Code要約生成（対話的）**
```bash
npm run claude:summarize
```
- 記事一覧から選択して要約を生成
- Claude Codeが対話的に要約とタグを生成
- 生成結果をデータベースに保存

**2. 品質比較ツール**
```bash
npm run claude:compare
```
- GeminiとClaudeの要約品質を比較
- スコアリングシステム（100点満点）で評価
- 複数記事での平均品質を算出

### 運用ガイドライン

**推奨使用シーン：**
- Gemini APIがRate Limitエラーを返す場合
- 特定の重要記事に高品質な要約が必要な場合
- 要約品質の検証・改善を行いたい場合
- 少量の記事を即座に処理したい場合

**注意事項：**
- Claude Codeセッション中のみ動作
- 大量バッチ処理には不向き（対話的処理のため）
- 基本的な大量処理はGemini APIを使用

### ハイブリッドアプローチ

1. **通常運用**: Gemini API（自動バッチ処理）
2. **補完運用**: Claude Code（少量・高品質処理）

## 統一フォーマット要約の再生成

### コマンド

```bash
# 未処理記事のみ再生成（推奨）
npm run regenerate:all-unified

# 中断後の再開（処理済みをスキップ）
npm run regenerate:all-unified -- --continue

# 全記事を強制再生成（処理済みも含む）
npm run regenerate:all-unified -- --force

# ドライラン（実際の更新なし）
npm run regenerate:all-unified -- --dry-run

# 件数制限
npm run regenerate:all-unified -- --limit=100

# 組み合わせ
npm run regenerate:all-unified -- --continue --limit=50
```

### 処理済みフラグ
- `summaryVersion: 5` = 統一フォーマット処理済み
- `articleType: 'unified'` = 統一タイプ

### Rate Limit対策
- 通常: 5秒間隔で実行
- 100件ごと: 30秒の長期待機
- Rate Limitエラー時: 60秒待機して再試行
- 継続オプション: `--continue`で中断箇所から再開

## Claude Codeカスタムコマンド

### 概要
`.claude/commands/` ディレクトリに自然言語で記述したカスタムコマンドを配置。プロジェクトメンテナンスを効率化。

### 主要コマンド

**日常メンテナンス:**
```bash
/run quick-check        # 軽量チェック（1分）
/run daily-maintenance  # 日次メンテナンス（2-3分）
/run weekly-cleanup     # 週次クリーンアップ（5分）
```

**個別実行:**
```bash
/run update-serena-memory  # Serenaメモリ更新
/run analyze-code-quality  # コード品質分析
/run sync-project-docs     # ドキュメント同期
/run check-todo-items      # TODO管理
```

詳細: `.claude/docs/custom-commands-guide.md`

## テストコマンド

### E2Eテスト実行時の注意事項
**重要**: 開発サーバーは常時起動しています（http://localhost:3000）
- テスト実行前にサーバー起動は不要です
- `npm run dev`を実行する必要はありません
- テストは常にlocalhost:3000に対して実行されます

```bash
# E2Eテスト実行
npm run test:e2e              # 全ブラウザでテスト
npm run test:e2e:chromium      # Chromiumのみ
npm run test:e2e:debug         # デバッグモード
npm run test:e2e:ui            # UIモード（インタラクティブ）
npm run test:e2e:headed       # ブラウザ表示あり

# 単体テスト・統合テスト
npm run test                  # Jestテスト実行
npm run test:watch           # ウォッチモード
npm run test:coverage        # カバレッジ測定

# 特定ソースのみ収集
npx tsx scripts/collect-feeds.ts "Dev.to"

# 要約生成（Gemini API）
npm run scripts:summarize

# 要約生成（Claude Code）
npm run claude:summarize

# 品質比較
npm run claude:compare

# 記事品質チェック
npx tsx scripts/check-article-quality.ts

# 低品質記事削除
npx tsx scripts/delete-low-quality-articles.ts
```