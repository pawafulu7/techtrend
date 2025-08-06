# TechTrend プロジェクト概要（2025年2月更新版）

## プロジェクト基本情報
- **プロジェクト名**: TechTrend
- **目的**: 複数の技術系サイトから記事を自動収集し、AI要約とタグ付けを行って提供するWebアプリケーション
- **開発環境**: WSL2 (Linux) on Windows
- **リポジトリ状態**: Git管理、メインブランチ（main）

## 技術スタック
### フロントエンド
- **フレームワーク**: Next.js 15.4.4 (App Router)
- **UI**: React 19.1.0 + TypeScript
- **スタイリング**: Tailwind CSS v4 + shadcn/ui
- **状態管理**: React Query (TanStack Query)

### バックエンド
- **API**: Next.js API Routes
- **データベース**: SQLite + Prisma ORM v6.12.0
- **キャッシュ**: Redis (ioredis v5.7.0)

### AI/ML
- **要約生成**: Google Generative AI (Gemini)
- **補完要約**: Claude Code統合（対話的処理）
- **記事分類**: 5タイプ（release/problem-solving/tutorial/tech-intro/implementation）

### インフラ・運用
- **プロセス管理**: PM2
- **スケジューラー**: node-cron
- **テスト**: Jest v30
- **開発ツール**: tsx, ESLint v9, Prettier

## 主要機能
1. **記事収集**: 17以上のソースから自動収集
2. **AI要約**: 日本語60-80文字の簡潔な要約生成
3. **品質管理**: 0-100点のスコアリングシステム
4. **タグ管理**: 自動タグ生成とカテゴリ分類
5. **検索機能**: 全文検索（FTS5）+ 詳細フィルタリング
6. **キャッシュ**: Redis による高速化とN+1問題対策
7. **読書リスト**: ユーザー個別の記事管理
8. **トレンド分析**: キーワード・ソース別の傾向分析

## プロジェクト構造
```
techtrend/
├── app/                  # Next.js App Router
│   ├── api/             # APIエンドポイント
│   ├── components/      # UIコンポーネント
│   └── (pages)/        # ページコンポーネント
├── lib/                 # 共通ライブラリ
│   ├── ai/             # AI関連（Gemini, Claude）
│   ├── cache/          # Redisキャッシュ実装
│   ├── cli/            # CLIツール
│   ├── fetchers/       # 記事フェッチャー
│   └── utils/          # ユーティリティ
├── prisma/              # データベース定義
├── scripts/             # 管理スクリプト
├── tests/               # テストファイル
└── docs/                # ドキュメント
```

## 運用ルール
1. **要約生成**: フェッチャーでは`summary: undefined`、別プロセスで生成
2. **品質基準**: 各ソースで適切なフィルタリング（反応数、ストック数等）
3. **更新頻度**: RSS系1時間毎、スクレイピング系12時間毎
4. **メモリ管理**: PM2で1GB制限、自動再起動
5. **コミット**: 機能追加・修正時は都度コミット

## 最新の実装状況（2025年2月）
- ✅ Redisキャッシュ実装完了（Phase 3）
- ✅ N+1問題対策（バッチ取得、分散ロック）
- ✅ メモリ最適化（MemoryOptimizer）
- ✅ サーキットブレーカー実装
- ✅ Claude Code統合（補完的要約生成）
- ✅ 17ソースのフェッチャー実装
- ✅ 品質スコアリングシステム稼働
- ✅ FTS5による全文検索