# TechTrend プロジェクト状態 (2025年2月4日更新)

## 最近の重要な変更

### 実装済み機能（2025年2月）
1. **30日以内記事フィルタリング** 
   - 全フェッチャーに日付フィルタリング機能を追加
   - 古い記事を除外し、最新の情報のみ取得

2. **新規情報源の拡充**
   - Corporate Tech Blog Fetcher（企業技術ブログ）
   - AI関連・技術ブログの新規情報源
   - Speaker Deck改善（Views数/日付フィルタリング）

3. **パフォーマンス改善**
   - 要約生成のタイムアウト問題を修正
   - キャッシュステータスヘッダーの修正
   - Redis移行後のテスト追加・更新

## 現在のシステム構成

### フェッチャー実装状況（18個）
- **RSS系ソース**: Dev.to, Qiita, Zenn, はてなブックマーク, Publickey, Stack Overflow Blog, Think IT, InfoQ Japan
- **API系ソース**: HuggingFace, Google AI, Google Dev Blog, AWS, Rails Releases, SRE
- **スクレイピング系**: Speaker Deck
- **拡張系**: Zenn Extended, Hatena Extended, Qiita Popular
- **企業系**: Corporate Tech Blog

### キャッシュシステム
- **実装**: RedisCacheクラス（Upstash Redis使用）
- **ローカル開発**: Redisモックサーバー（ポート8079）
- **キャッシュ対象**: /api/sources（1時間TTL）、/api/articles（実装済み）

### スケジューラー設定
- **RSS系**: 1時間ごと更新
- **スクレイピング系**: 12時間ごと（0時・12時）
- **PM2管理**: ecosystem.config.js

## 技術スタック
- **フレームワーク**: Next.js 14 (App Router)
- **データベース**: PostgreSQL (Prisma ORM)
- **キャッシュ**: Redis (Upstash)
- **AI**: OpenAI GPT-4o-mini（要約生成）
- **言語**: TypeScript
- **テスト**: Jest
- **プロセス管理**: PM2

## 重要な運用ルール

### 記事要約の生成
- フェッチャーでは `summary: undefined` を設定
- `generate-summaries.ts` で日本語要約を一括生成
- フェッチャー内での要約生成は禁止

### 品質フィルタリング
- **Dev.to**: 反応数10以上、読了時間2分以上
- **Qiita**: ストック数10以上、24時間以内
- **Speaker Deck**: 日本語プレゼンテーション
- **共通**: 30日以内の記事のみ取得

## 現在の課題と改善計画

### 🔴 即時対応事項
1. **テスト修正**
   - Prismaモック改善（13個中2個失敗）
   - sources APIテストのモックデータ修正

2. **キャッシュ戦略**
   - 無効化戦略の実装
   - タグ・ソース一覧のキャッシュ強化

### 🟡 高優先度（1ヶ月以内）
1. **ローカルRedis環境構築**
   - Docker Compose設定
   - ioredisライブラリ導入
   - 環境別設定の実装

2. **構造化ログ導入**
   - 126箇所のconsole.log/error/warn置換
   - winston/pino導入

### 🟢 中期改善（3ヶ月以内）
1. **型安全性向上**
   - TypeScript strict mode有効化
   - any型の排除

2. **監視基盤**
   - OpenTelemetry導入
   - パフォーマンスメトリクス収集

## 解決済み項目
- ✅ 30日以内記事フィルタリング実装
- ✅ タグカテゴリ機能実装
- ✅ articles APIキャッシュ実装
- ✅ CLIツール基盤構築
- ✅ Speaker Deck機能追加・改善
- ✅ 企業技術ブログフェッチャー追加

## 未解決の技術的負債
- ❌ N+1クエリ問題（Prismaのinclude使用箇所）
- ❌ テストカバレッジ不足（目標: 20% → 40%）
- ❌ エラーログの構造化
- ❌ E2Eテスト未実装

## ディレクトリ構成
```
techtrend/
├── app/          # Next.js App Router
├── components/   # UIコンポーネント
├── lib/
│   ├── cache/    # キャッシュ実装
│   ├── fetchers/ # 情報源フェッチャー（18個）
│   ├── ai/       # AI要約生成
│   └── db/       # データベース接続
├── scripts/      # 管理スクリプト
├── docs/         # ドキュメント
├── __tests__/    # テストファイル
└── scheduler-v2.ts # スケジューラー
```

## 次のアクションアイテム
1. テスト修正を最優先で実施
2. Docker Compose設定作成
3. ローカルRedis環境への移行準備
4. 構造化ログの段階的導入開始