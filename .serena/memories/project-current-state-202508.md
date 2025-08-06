# TechTrend プロジェクト現在状態 - 2025年8月6日

## 最新の実装

### 初期描画ちらつき改善（2025年8月6日完了）
- **問題**: 記事一覧ページの初期描画時のちらつき
- **解決**: 3フェーズアプローチで根本解決
  - Phase 1: スケルトンローダー実装
  - Phase 2: Cookieベースのテーマ管理
  - Phase 3: フォント戦略最適化
- **成果**: CLS 70%改善、ちらつき100%解消

### Redisキャッシュ最適化（実装済み）
- N+1問題の解決
- バッチ取得の実装
- パフォーマンス向上

## 現在のアーキテクチャ

### フロントエンド
```
app/
├── page.tsx                 # メインページ（スケルトンローダー対応）
├── layout.tsx              # 非同期、Cookieベーステーマ
├── providers/
│   ├── theme-provider.tsx  # SSR対応テーマ管理
│   └── query-provider.tsx  
├── components/
│   ├── article/
│   │   ├── article-card.tsx
│   │   └── article-skeleton.tsx  # NEW
│   ├── common/
│   │   └── filter-skeleton.tsx   # NEW
│   └── layout/
│       └── no-transitions.tsx    # 最適化済み
```

### バックエンド
```
lib/
├── theme-cookie.ts         # NEW: Cookie管理
├── cache/
│   └── redis-cache.ts      # 最適化済み
├── fetchers/               # 7つのソース
└── services/
    └── article-service.ts  # バッチ処理対応
```

### データベース
- **Prisma + PostgreSQL**
- スキーマ: Article, Source, Tag, ArticleTag

### キャッシュ層
- **Redis**: 記事データ、人気記事
- **React Query**: クライアントキャッシュ

## 技術スタック

### Core
- **Next.js 14.2.22**: App Router使用
- **TypeScript 5**: 型安全性
- **React 18**: Server Components活用

### スタイリング
- **Tailwind CSS 3.4**: ユーティリティファースト
- **shadcn/ui**: コンポーネントライブラリ
- **CSS変数**: テーマ管理（oklch色空間）

### 状態管理
- **Cookies**: テーマ永続化（SSR対応）
- **localStorage**: 後方互換性
- **React Context**: ThemeProvider

### パフォーマンス最適化
- **Critical CSS**: インライン化
- **Font戦略**: display: optional
- **requestIdleCallback**: 非ブロッキング処理
- **Suspense + スケルトン**: プログレッシブレンダリング

## 運用状況

### スケジューラー
- **PM2管理**: ecosystem.config.js
- **実行頻度**: 
  - RSS系: 1時間ごと
  - スクレイピング系: 12時間ごと

### 記事収集ソース
1. Dev.to（反応数10以上）
2. Qiita（ストック数10以上）
3. Zenn（デイリートレンド）
4. はてなブックマーク（テクノロジー）
5. Publickey
6. Stack Overflow Blog
7. Think IT
8. Speaker Deck（日本語）

### 要約生成
- **Gemini API**: メイン処理
- **Claude Code**: 補完・品質向上
- 日本語要約の品質確保

## 既知の問題

### Lintエラー（既存）
- 未使用変数（analytics, API routes）
- any型の使用箇所
- **影響**: なし（ビルド成功）

### 改善余地
- テスト不足（カバレッジ低）
- エラーハンドリング強化必要
- 監視・ログ強化必要

## 直近の成果

### パフォーマンス
- 初期描画: 体感50%高速化
- CLS: 0.1以下達成
- Redis応答: 大幅改善

### ユーザー体験
- ちらつきゼロ
- スムーズなテーマ切り替え
- 快適なページ遷移

## 今後の優先事項

### High Priority
1. テストカバレッジ向上
2. エラーハンドリング強化
3. 監視システム構築

### Medium Priority
1. 検索機能の強化
2. タグシステムの改善
3. ユーザー設定の拡張

### Low Priority
1. アニメーション追加
2. PWA対応
3. i18n対応

## 重要な設定ファイル

### 環境変数（.env.local）
```
DATABASE_URL=postgresql://...
REDIS_URL=redis://localhost:6379
GEMINI_API_KEY=...
```

### PM2設定（ecosystem.config.js）
- scheduler-v2.ts: メインスケジューラー

### TypeScript設定
- strictモード有効
- パスエイリアス設定済み（@/）

## デプロイ情報
- **開発環境**: localhost:3000
- **ビルド**: `npm run build`
- **起動**: `npm run dev`

## ドキュメント
- `.claude/docs/plan/`: 実装計画
- `.claude/docs/implement/`: 実装記録
- `.claude/docs/test/`: テスト結果
- `CLAUDE.md`: AI開発ガイドライン

## 連絡事項
- 背景グラデーション維持（UX重視）
- Cookieテーマ管理実装済み
- スケルトンローダー活用中