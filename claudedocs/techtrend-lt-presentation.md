---
marp: true
theme: default
paginate: true
backgroundColor: #1e1e2e
color: #cdd6f4
style: |
  section {
    font-family: 'Noto Sans JP', sans-serif;
  }
  h1 {
    color: #89b4fa;
  }
  h2 {
    color: #94e2d5;
  }
  h3 {
    color: #f9e2af;
  }
  code {
    background-color: #313244;
    color: #cdd6f4;
  }
  .columns {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 20px;
  }
---

# TechTrend
## エンジニアのための技術記事キュレーションプラットフォーム

**17のソースから毎日収集・AI要約生成**

2025年1月 | Next.js 15 + PostgreSQL + Redis

---

# 📊 プロジェクト規模

<div class="columns">
<div>

## 現在の数値
- **記事数**: 13,895件
- **情報源**: 17サイト
- **タグ**: 4,561種類
- **ユーザ**: 6名+
- **品質スコア**: 65/100

</div>
<div>

## 日次増加
- 新規記事: 200-300件/日
- 要約生成: 全自動
- タグ付け: AI自動分類
- 品質チェック: 自動評価

</div>
</div>

---

# 🎯 解決したい課題

## エンジニアの情報収集の悩み

1. **情報の分散** 
   - Qiita、Zenn、Dev.to、はてブ...
   - 毎日チェックするのは大変

2. **言語の壁**
   - 海外の良質な記事を読みたい
   - でも英語を読むのは時間がかかる

3. **情報の質**
   - ノイズが多い
   - 本当に価値ある記事を見つけたい

---

# 🏗️ システムアーキテクチャ

```
┌─────────────────────────────────────────┐
│            Next.js 15.4.4               │
│    (App Router / React 19 / TypeScript) │
├─────────────────────────────────────────┤
│             API Routes                  │
├────────────┬────────────┬───────────────┤
│   Prisma   │   Redis    │   Auth.js     │
│    ORM     │   Cache    │   認証        │
├────────────┴────────────┴───────────────┤
│         PostgreSQL 15                   │
└─────────────────────────────────────────┘

外部連携:
- Gemini API (要約生成)
- Claude API (高品質要約)
- 17の技術情報サイト
```

---

# 🚀 主要機能

<div class="columns">
<div>

## 記事収集・表示
- 17ソースから自動収集
- RSS/API/スクレイピング
- リアルタイム更新
- 無限スクロール

## AI要約生成
- 日本語で統一要約
- 2段階要約（一覧/詳細）
- 品質スコアリング
- タグ自動生成

</div>
<div>

## ユーザ機能
- お気に入り管理
- 閲覧履歴
- パーソナライズ推薦
- ソースフィルター

## 検索・分析
- 複数キーワード検索
- タグクラウド
- トレンド分析
- ソース別統計

</div>
</div>

---

# 📦 情報源（17サイト）

<div class="columns">
<div>

## 国内 (9)
- はてなブックマーク (975件)
- Zenn (560件)
- Qiita Popular (139件)
- Publickey
- Think IT
- Corporate Tech Blog
- Speaker Deck (172件)
- Docswell (54件)
- InfoQ Japan

</div>
<div>

## 海外 (8)
- Dev.to (193件)
- AWS Blog (256件)
- Stack Overflow Blog
- Google Developers Blog
- Google AI Blog
- Hugging Face Blog
- Rails Releases
- SRE (108件)

</div>
</div>

---

# 🤖 AI要約システム

## 統一フォーマット (summaryVersion 7)

```typescript
// 一覧用要約（100-150文字）
summary: "TypeScriptの型安全性を向上させる
実践的なテクニック。Genericやユーティリティ
型を活用した堅牢なコード設計手法を解説。"

// 詳細要約（箇条書き）
detailedSummary: `
• 型推論の活用方法と注意点
• Conditional Typesの実践例
• Template Literal Typesの応用
• 型ガードによる安全な型の絞り込み
`
```

**Gemini + Claude のハイブリッド構成**

---

# 💡 技術的な工夫

## 1. スケーラビリティ
- Redis キャッシュ（5分〜1時間）
- 段階的データ取得（無限スクロール）
- バッチ処理による要約生成

## 2. 品質管理
- 記事品質の自動評価（100点満点）
- 低品質記事の自動フィルタリング
- タグ正規化（698行のルール）

## 3. 開発効率
- TypeScript strictモード準備中
- 依存性注入（DI）パターン
- Serena MCP による開発支援

---

# 📈 成果と数値

<div class="columns">
<div>

## コード品質改善
- **TypeScriptエラー**
  1,396件 → 663件（52.5%削減）
- **ESLint違反**
  3,774件 → 389件（89.7%削減）
- **any型使用**
  75箇所 → 14箇所（81%削減）

</div>
<div>

## テスト・パフォーマンス
- **テスト成功率**
  単体: 98.1% / E2E: 91.7%
- **API応答時間**
  平均200ms
- **キャッシュヒット率**
  85%

</div>
</div>

---

# 🔧 技術スタック詳細

<div class="columns">
<div>

## Frontend
- Next.js 15.4.4
- React 19.0.0
- TypeScript 5.6.3
- Tailwind CSS 4
- Radix UI

## Backend
- Prisma 6.12.0
- PostgreSQL 15
- Redis (ioredis)
- Auth.js 5.0

</div>
<div>

## AI/ML
- Google Generative AI
- Anthropic Claude
- cheerio (スクレイピング)

## DevOps
- PM2 (スケジューラー)
- Docker
- ESLint / Jest
- Playwright

</div>
</div>

---

# 🎮 デモ

## 主要画面の紹介

1. **トップページ**
   - 記事一覧・無限スクロール
   - ソースフィルター

2. **記事詳細**
   - AI生成の詳細要約
   - 関連記事表示

3. **検索・フィルター**
   - 複数キーワード検索
   - タグクラウド

4. **パーソナライズ**
   - お気に入り管理
   - 閲覧履歴

---

# 🚧 現在の課題と対策

<div class="columns">
<div>

## 技術的課題
- TypeScriptエラー 663件
  → 段階的削減中
- バンドルサイズ 1.1GB
  → 最適化予定
- E2Eテスト 91.7%
  → 100%目標

</div>
<div>

## 運用課題
- 要約品質のばらつき
  → 品質チェック強化
- スクレイピング安定性
  → エラーハンドリング改善
- データ量増加
  → インデックス最適化

</div>
</div>

---

# 🔮 今後の展望

## 短期（1-2週間）
- TypeScriptエラー 500件以下
- ESLintエラー 100件以下
- E2Eテスト 100%達成

## 中期（1ヶ月）
- TypeScript strictモード
- バンドルサイズ 30%削減
- パフォーマンス最適化

## 長期（3ヶ月）
- AIエージェント機能
- 自動カテゴリ分類
- マルチ言語対応

---

# 📊 学びと振り返り

## 技術的な学び
- **Next.js 15 App Router** の実践投入
- **Prisma + PostgreSQL** の大規模運用
- **AI API** の効率的な活用方法

## プロジェクト管理
- 段階的な品質改善の重要性
- テスト駆動開発の効果
- 継続的なリファクタリング

## 今後活かしたいこと
- 型安全性を最初から意識
- パフォーマンスの早期測定
- ドキュメントの継続的更新

---

# 🎯 まとめ

## TechTrend の価値

1. **情報の一元化**
   17サイトを1箇所でチェック

2. **言語の壁を越える**
   英語記事も日本語要約で読める

3. **質の高い情報を効率的に**
   AI要約 + 品質スコアリング

**エンジニアの情報収集を変える**
プラットフォームを目指して

---

# 📝 リポジトリ・連絡先

## プロジェクト情報

🔗 **GitHub**: (プライベートリポジトリ)
📧 **Contact**: [メールアドレス]
🐦 **Twitter**: [@ハンドル]

## 使用技術の詳細

- Next.js 15.4.4 (App Router)
- PostgreSQL + Prisma
- Redis Cache
- Gemini API / Claude API
- TypeScript / React 19

**ご清聴ありがとうございました！**