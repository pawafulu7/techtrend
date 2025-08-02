# TechTrend プロジェクト概要

## 概要
TechTrendは技術記事の収集・要約・表示を行うWebアプリケーション。Next.js 15 + TypeScript + Prisma + SQLiteで構築。

## 技術スタック
- **フロントエンド**: Next.js 15.4.4, React 19.1.0, TypeScript 5
- **UI**: Radix UI, Tailwind CSS, lucide-react
- **データベース**: SQLite + Prisma ORM
- **記事収集**: RSS Parser, Cheerio, Axios
- **AI要約**: Google Generative AI (Gemini)
- **プロセス管理**: PM2, node-cron

## プロジェクト構造
```
├── app/              # Next.js App Router
├── components/       # UIコンポーネント  
├── lib/             # ライブラリコード
│   ├── fetchers/    # 各ソースのフェッチャー
│   ├── ai/          # AI関連（要約生成）
│   ├── utils/       # ユーティリティ
│   └── database/    # DB接続
├── scripts/         # スクリプト群
├── prisma/          # データベーススキーマ
└── scheduler-v2.ts  # スケジューラー
```

## データベース構造
- **Article**: 記事データ（title, url, summary, qualityScore等）
- **Source**: 記事ソース情報（Dev.to, Qiita, Zenn等）
- **Tag**: タグ情報（カテゴリ付き）

## 主要機能
1. 複数ソースからの記事自動収集
2. AI（Gemini）による日本語要約生成
3. 品質スコアによるフィルタリング
4. タグベースの記事分類
5. 読書リスト・お気に入り機能