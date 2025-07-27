# TechTrend - 技術記事アグリゲーター

技術系ブログやニュースサイトから記事を自動収集し、日本語要約を生成して表示するWebアプリケーションです。

## 機能

- 複数の技術系サイトから記事を自動収集
- Gemini APIを使用した日本語要約の自動生成
- ソース別・タグ別のフィルタリング
- キーワード検索
- レスポンシブデザイン
- 自動更新スケジューラー

## 対応サイト

### RSS系（1時間ごとに更新）
- はてなブックマーク（テクノロジーカテゴリ）
- Qiita（トレンド記事）
- Zenn（トレンド記事）
- Dev.to（人気技術記事）
- Publickey
- Stack Overflow Blog
- Think IT

### スクレイピング系（12時間ごとに更新：0時・12時）
- Speaker Deck（日本語プログラミングトレンド）

## セットアップ

### 環境変数

`.env.local`ファイルを作成し、以下の環境変数を設定してください：

```
GEMINI_API_KEY=your-api-key-here
```

### インストール

```bash
npm install
```

### データベースのセットアップ

```bash
npm run prisma:migrate
npm run prisma:seed
```

### 開発サーバーの起動

```bash
npm run dev
```

## 自動更新スケジューラー

### 開発環境での実行

```bash
npm run scheduler:dev
```

### PM2を使用した本番環境での実行

```bash
# スケジューラーの開始
npm run scheduler:start

# スケジューラーの停止
npm run scheduler:stop

# スケジューラーの再起動
npm run scheduler:restart

# ログの確認
npm run scheduler:logs
```

### 手動実行

```bash
# 全ソースから記事を収集
npm run scripts:collect

# 特定のソースのみ収集
npx tsx scripts/collect-feeds.ts "Speaker Deck"

# 要約を生成
npm run scripts:summarize
```

## 技術スタック

- Next.js 15
- TypeScript
- Prisma（SQLite）
- Tailwind CSS
- shadcn/ui
- Gemini API
- node-cron（スケジューラー）

## プロジェクト構造

```
├── app/                  # Next.js App Router
├── components/           # Reactコンポーネント
├── lib/
│   ├── fetchers/        # 各サイト用フェッチャー
│   ├── config/          # 設定ファイル
│   └── types/           # TypeScript型定義
├── scripts/             # バッチ処理スクリプト
├── prisma/              # データベーススキーマ
└── scheduler-v2.ts      # 自動更新スケジューラー
```