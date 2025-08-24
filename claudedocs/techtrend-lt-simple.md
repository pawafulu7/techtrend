---
marp: true
theme: default
paginate: true
---

# TechTrend

エンジニアのための技術記事キュレーションプラットフォーム

17のソースから毎日収集・AI要約生成

---

# 解決したい課題

- **情報の分散**: Qiita、Zenn、Dev.to、はてブ...
- **言語の壁**: 海外の良質な記事を日本語で読みたい
- **情報の質**: ノイズを除いて価値ある記事だけ

---

# プロジェクト規模

- **記事数**: 13,895件
- **情報源**: 17サイト
- **日次増加**: 200-300件
- **要約生成**: 全自動
- **品質スコア**: 65/100

---

# システム構成

```
Next.js 15.4.4 (App Router)
    ↓
PostgreSQL + Redis Cache
    ↓
Gemini API / Claude API
    ↓
17の技術情報サイト
```

---

# 主要機能

1. **自動収集**: RSS/API/スクレイピング
2. **AI要約**: 日本語統一要約（2段階）
3. **パーソナライズ**: お気に入り・閲覧履歴・推薦
4. **検索・分析**: タグクラウド・トレンド分析

---

# 情報源（TOP 10）

1. はてなブックマーク (975件)
2. Zenn (560件)
3. AWS Blog (256件)
4. Dev.to (193件)
5. Speaker Deck (172件)
6. Qiita (139件)
7. Corporate Tech Blog (112件)
8. SRE (108件)
9. Stack Overflow Blog (55件)
10. Docswell (54件)

---

# AI要約システム

**一覧用要約（100-150文字）**
```
TypeScriptの型安全性を向上させる
実践的なテクニック...
```

**詳細要約（箇条書き）**
```
• 型推論の活用方法と注意点
• Conditional Typesの実践例
• Template Literal Typesの応用
```

---

# 技術スタック

- **Frontend**: Next.js 15, React 19, TypeScript
- **Backend**: Prisma, PostgreSQL, Redis
- **AI**: Gemini API, Claude API
- **Test**: Jest (98.1%), Playwright (91.7%)

---

# 成果

## コード品質
- TypeScriptエラー: 52.5%削減
- ESLint違反: 89.7%削減
- any型使用: 81%削減

## パフォーマンス
- API応答: 200ms
- キャッシュヒット: 85%

---

# 今後の展望

- **短期**: TypeScriptエラー0件
- **中期**: バンドルサイズ30%削減
- **長期**: AIエージェント機能

---

# まとめ

**TechTrendの価値**

1. 情報の一元化（17サイト → 1箇所）
2. 言語の壁を越える（英語 → 日本語）
3. 質の高い情報を効率的に

エンジニアの情報収集を変える

---

# ありがとうございました！

GitHub: (プライベートリポジトリ)
使用技術: Next.js 15 + PostgreSQL + AI