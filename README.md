# TechTrend

複数の技術情報源から最新記事を収集し、AIによる要約・分析を提供する技術情報アグリゲーター

## 🚀 特徴

- **15種類の情報源**から自動的に技術記事を収集
- **AI要約**による60-80文字の日本語要約生成
- **品質スコアリング**（0-100点）による記事の自動評価
- **マルチタグフィルタリング**（AND/OR検索対応）
- **トレンド分析**による急上昇キーワードの可視化
- **難易度判定**（初級・中級・上級）

## 📋 必要要件

- Node.js 18.0以上
- npm または yarn
- SQLite3
- Gemini API Key（[Google AI Studio](https://aistudio.google.com/app/apikey)で取得）

## 🛠️ セットアップ

### 1. リポジトリのクローン

```bash
git clone https://github.com/yourusername/techtrend.git
cd techtrend
```

### 2. 依存関係のインストール

```bash
npm install
```

### 3. 環境変数の設定

`.env.local`ファイルを作成し、以下の内容を記述：

```env
DATABASE_URL="file:./prisma/dev.db"
GEMINI_API_KEY="your-gemini-api-key-here"
```

### 4. データベースのセットアップ

```bash
# データベースのマイグレーション
npm run prisma:migrate

# 初期データの投入
npm run prisma:seed
```

### 5. 開発サーバーの起動

```bash
# Webアプリケーション
npm run dev

# スケジューラー（別ターミナルで）
npm run scheduler:v2
```

http://localhost:3000 でアプリケーションにアクセスできます。

## 📁 プロジェクト構成

```
techtrend/
├── app/                    # Next.js App Router
│   ├── api/               # API Routes
│   ├── components/        # UIコンポーネント
│   ├── stats/            # 統計ページ
│   └── trends/           # トレンド分析ページ
├── lib/                   # ライブラリ・ユーティリティ
│   ├── ai/              # AI関連（Gemini API）
│   ├── fetchers/        # 各情報源のフェッチャー
│   └── utils/           # ユーティリティ関数
├── prisma/               # データベース設定
├── scripts/              # メンテナンススクリプト
├── docs/                 # ドキュメント
└── scheduler-v2.ts       # スケジューラー
```

## 📚 ドキュメント

- [システム仕様書](docs/SPECIFICATION.md) - 詳細な技術仕様
- [機能詳細](docs/FEATURES.md) - 実装済み機能の詳細
- [APIリファレンス](docs/API_REFERENCE.md) - API仕様

## 🔧 主な機能

### 記事収集
- 15種類の技術ブログ・フィードから自動収集
- 重複記事の自動検出・除外
- 非技術記事のフィルタリング

### AI処理
- Gemini APIによる日本語要約生成
- 記事内容に基づく技術タグの自動生成
- タグの正規化（例: javascript → JavaScript）
- Claude Code連携による高品質要約生成（インタラクティブモード）

### 品質管理
- 多角的な品質スコアリング（タグ、要約、ソース、新鮮さ、エンゲージメント）
- 低品質記事（30点未満）の自動フィルタリング
- ユーザー投票による品質向上

### ユーザー体験
- キーワード検索
- ソース別・タグ別・難易度別フィルタリング
- レスポンシブデザイン
- ページネーション（20件/ページ）

## 🏃 運用コマンド

```bash
# 本番環境でのビルド・起動
npm run build
npm run start

# PM2でスケジューラーを管理
npm run scheduler:start    # 起動
npm run scheduler:stop     # 停止
npm run scheduler:restart  # 再起動
npm run scheduler:logs     # ログ確認

# メンテナンスコマンド
npm run scripts:collect    # 手動で記事収集
npm run scripts:summarize  # 手動で要約生成

# Claude Code統合機能
npm run claude:summarize   # Claude Codeで対話的に要約生成
npm run claude:compare     # GeminiとClaudeの品質比較
```

## 🤝 コントリビューション

Issue や Pull Request は大歓迎です！

### 開発の流れ

1. Issueを作成して機能提案や不具合報告
2. フォークしてfeatureブランチを作成
3. 変更をコミット
4. Pull Requestを作成

### コーディング規約

- TypeScriptの型定義を活用
- ESLintの警告を解消
- コンポーネントは関数コンポーネントで記述
- Tailwind CSSでスタイリング

## 📄 ライセンス

MITライセンス

## 🙏 謝辞

このプロジェクトは以下の素晴らしいプロジェクト・サービスを利用しています：

- [Next.js](https://nextjs.org/)
- [Prisma](https://www.prisma.io/)
- [Google Gemini API](https://ai.google.dev/)
- [Tailwind CSS](https://tailwindcss.com/)
- 各技術情報源の皆様