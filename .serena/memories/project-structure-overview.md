# TechTrend プロジェクト構造概要

## 主要ディレクトリ構成

### /app - Next.js App Router
- api/ - APIエンドポイント
- components/ - ページ固有のUIコンポーネント
- [pages]/ - ルーティングページ

### /components - 共通UIコンポーネント
- ui/ - Radix UIベースの汎用コンポーネント

### /lib - ビジネスロジック
- **fetchers/** - 記事取得処理（13個のフェッチャー）
  - base.ts - 基底クラス
  - RSS系: publickey, stackoverflow-blog, rails-releases等
  - API系: devto, qiita-popular
  - スクレイピング系: speakerdeck
  
- **ai/** - AI関連処理
  - gemini-summarizer.ts - Gemini APIによる要約生成
  
- **utils/** - ユーティリティ関数
  - quality-score.ts - 品質スコア計算
  - tag-normalizer.ts - タグ正規化
  - duplicate-detection.ts - 重複検出
  - summary-parser.ts - 要約パース処理
  
- **database/** - DB接続
  - prisma.ts - Prismaクライアント

### /scripts - 管理スクリプト（60+ファイル）
- **core/** - コアスクリプト
  - manage-summaries.ts - 要約管理
  - manage-quality-scores.ts - 品質スコア管理
- 多数の一時的スクリプト（削除対象）

### /prisma - データベース
- schema.prisma - スキーマ定義
- dev.db - SQLiteデータベース
- backups/ - バックアップ保存先

### その他重要ファイル
- scheduler-v2.ts - 定期実行処理
- package.json - 依存関係とスクリプト定義
- ecosystem.config.js - PM2設定