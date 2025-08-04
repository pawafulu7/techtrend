# TechTrend プロジェクト詳細情報 (2025年2月調査版)

## プロジェクト構造詳細

### ディレクトリ構成
```
techtrend/
├── app/                    # Next.js App Router
│   ├── (dashboard)/       # ダッシュボード関連
│   ├── analytics/         # 分析ページ
│   ├── api/              # APIエンドポイント
│   └── [その他ページ]    # articles, favorites, search等
├── components/            # Reactコンポーネント
├── lib/                   # ビジネスロジック
│   ├── ai/               # AI関連（要約生成）
│   ├── cache/            # キャッシュ処理
│   ├── cli/              # CLIツール実装
│   ├── config/           # 設定
│   ├── database/         # DB接続
│   ├── fetchers/         # 記事フェッチャー（17種類）
│   ├── redis/            # Redisクライアント
│   └── utils/            # ユーティリティ
├── prisma/               # Prisma ORM
│   ├── schema.prisma     # スキーマ定義
│   └── migrations/       # マイグレーション
├── scripts/              # 実行スクリプト
├── tests/                # テストファイル
└── types/                # TypeScript型定義

```

### 主要設定ファイル
- `package.json`: プロジェクト依存関係・スクリプト定義
- `ecosystem.config.js`: PM2設定（scheduler-v2.ts管理）
- `next.config.ts`: Next.js設定
- `tsconfig.json`: TypeScript設定
- `jest.config.js`: 単体テスト設定
- `jest.config.integration.js`: 統合テスト設定
- `scheduler-v2.ts`: スケジューラー本体

## 技術スタック詳細

### フロントエンド
- **フレームワーク**: Next.js 14+ (App Router)
- **UI**: React 18+, TypeScript
- **スタイリング**: Tailwind CSS, shadcn/ui
- **アイコン**: Radix UI Icons

### バックエンド
- **API**: Next.js API Routes
- **ORM**: Prisma 6.12.0
- **データベース**: SQLite（開発）/ PostgreSQL（本番想定）
- **キャッシュ**: Redis（ローカル環境）

### AI・外部サービス
- **要約生成**: Google Generative AI (Gemini)
- **プロセス管理**: PM2

### 開発ツール
- **テスト**: Jest（単体・統合テスト）
- **リンター**: ESLint（Next.js設定）
- **型チェック**: TypeScript（tsc --noEmit）

## フェッチャー実装詳細

### BaseFetcherクラス
すべてのフェッチャーの基底クラス：
- リトライ機能（maxRetries: 3）
- エラーハンドリング（safeFetch）
- URL正規化（normalizeUrl）
- テキストサニタイズ（sanitizeText）
- サムネイル抽出（extractThumbnail）

### フェッチャー種別（17種類）

#### RSS系（1時間ごと更新）
1. **DevToFetcher**: Dev.to API使用、反応数10以上、読了時間2分以上
2. **QiitaPopularFetcher**: Qiita API、ストック数10以上、24時間以内
3. **ZennExtendedFetcher**: Zennトレンドフィード、複数トピック対応
4. **HatenaExtendedFetcher**: はてなブックマーク、テクノロジーカテゴリ
5. **PublickeyFetcher**: Publickey RSS
6. **StackOverflowBlogFetcher**: Stack Overflow Blog RSS
7. **ThinkITFetcher**: Think IT RSS
8. **InfoQJapanFetcher**: InfoQ Japan RSS
9. **GoogleAIFetcher**: Google AI Blog RSS
10. **GoogleDevBlogFetcher**: Google Developers Blog RSS
11. **HuggingFaceFetcher**: Hugging Face Blog RSS
12. **AWSFetcher**: AWS公式ブログ RSS
13. **SREFetcher**: SRE Weekly RSS
14. **RailsReleasesFetcher**: Rails Releases RSS
15. **CorporateTechBlogFetcher**: 企業技術ブログ（メルカリ、LINE等）

#### スクレイピング系（12時間ごと更新）
16. **SpeakerDeckFetcher**: Speaker Deck日本語プレゼン、Views数フィルタリング

## CLI管理ツール（npm run techtrend）

### サブコマンド構成
```
feeds/          # フィード管理
  - collect     # 記事収集
  - sources     # ソース一覧
  - stats       # 統計情報

summaries/      # 要約管理
  - generate    # 要約生成
  - regenerate  # 再生成
  - check       # 状態確認

quality-scores/ # 品質スコア管理
  - calculate   # スコア計算
  - fix         # 修正
  - stats       # 統計

cleanup/        # クリーンアップ
  - articles    # 古い記事削除
  - tags        # 未使用タグ削除
  - stats       # 統計

tags/           # タグ管理
  - list        # 一覧表示
  - stats       # 統計
  - clean       # クリーンアップ
  - categorize  # カテゴリ分類
```

## データモデル詳細

### Article（記事）
- id, url, title, content
- summary（要約）
- qualityScore（品質スコア 0-100）
- publishedAt, createdAt, updatedAt
- sourceId（ソースへの参照）
- tags（多対多リレーション）

### Source（ソース）
- id, name, type
- isEnabled（有効/無効フラグ）
- articles（記事リレーション）

### Tag（タグ）
- id, name
- category（カテゴリ分類）
- articles（多対多リレーション）

### その他のエンティティ
- User（ユーザー）
- Favorite（お気に入り）
- ReadingList（読みリスト）
- ReadHistory（閲覧履歴）

## 重要な開発規約

### 1. 要約生成ルール
- **絶対守る**: フェッチャーでは `summary: undefined` を設定
- 要約は必ず `generate-summaries.ts` で日本語生成
- フェッチャー内で要約を生成しない（英語になるため）

### 2. 品質管理
- Dev.to: 反応数10以上、読了時間2分以上
- Qiita: ストック数10以上
- 低品質記事は定期的に削除（3ヶ月以上前）

### 3. コミット規約
- 機能追加・修正・削除後は都度コミット
- 作業内容を明確にメッセージに記載

### 4. エラーハンドリング
- フェッチャーは失敗してもスケジューラーを止めない
- 個別エラーをログ出力して続行

### 5. テスト実行
```bash
# 単体テスト
npm test

# 統合テスト（Redis必要）
npm run test:integration:docker

# カバレッジ
npm run test:coverage
```

## スケジューラー設定（scheduler-v2.ts）

### cronジョブ
- `0 * * * *`: RSS系ソース更新（毎時0分）
- `0 0,12 * * *`: スクレイピング系更新（0時・12時）
- `0 2 * * *`: 要約生成（毎日2時）
- `0 2 * * 0`: 品質スコア再計算（日曜2時）
- `0 3 * * *`: 低品質記事削除（毎日3時）
- `5 5,17 * * *`: Redis状態チェック（5時5分・17時5分）

### PM2管理
```bash
npm run scheduler:start    # 開始
npm run scheduler:stop     # 停止
npm run scheduler:restart  # 再起動
npm run scheduler:logs     # ログ表示
```

## デバッグ・開発用コマンド

### 記事収集テスト
```bash
# 特定ソースのみ
npx tsx scripts/collect-feeds.ts "Dev.to"

# 全ソース
npm run scripts:collect
```

### 要約生成
```bash
# ドライラン
npx tsx scripts/generate-summaries.ts --dry-run

# 実行
npm run scripts:summarize
```

### 品質チェック
```bash
# 品質スコア確認
npx tsx scripts/check-article-quality.ts

# 低品質記事削除
npx tsx scripts/delete-low-quality-articles.ts
```

### データベース操作
```bash
# マイグレーション
npm run prisma:migrate

# Prisma Studio起動
npm run prisma:studio

# スキーマ生成
npm run prisma:generate
```

## 既知の問題と対処法

### 1. 要約が英語になる
- 原因: フェッチャーで要約を生成している
- 対処: フェッチャーの `summary` を `undefined` に設定

### 2. Dev.toの要約が生成されない
- 原因: content フィールドが空
- 対処: `scripts/update-devto-content.ts` で詳細取得

### 3. 重複記事が発生
- 原因: URL正規化の不統一
- 対処: normalizeUrl関数の使用を徹底

### 4. PM2プロセスがクラッシュ
- 原因: メモリ不足、未処理エラー
- 対処: ecosystem.config.jsでmax_memory_restart設定

## パフォーマンス最適化

### キャッシュ戦略
- Redis使用（TTL設定）
- API応答のキャッシュヘッダー
- 静的コンテンツのISR（Incremental Static Regeneration）

### データベース最適化
- インデックス設定（URL、publishedAt）
- N+1問題対策（include使用）
- バッチ処理（createMany使用）

## セキュリティ考慮事項

### 環境変数
- `.env.local`で管理（gitignore済み）
- 必須: DATABASE_URL, GEMINI_API_KEY
- オプション: REDIS_URL（デフォルト: localhost:6379）

### APIセキュリティ
- Rate limiting検討
- 認証機能（NextAuth.js想定）
- CORS設定

## 今後の開発に向けて

### 改善余地のある領域
1. テストカバレッジの向上（現在不足）
2. エラーハンドリングの統一化
3. TypeScript型の厳密化
4. ドキュメントの充実
5. パフォーマンスモニタリング

### 拡張可能な機能
1. ユーザー認証・パーソナライゼーション
2. 記事推薦システム
3. APIレート制限
4. 多言語対応
5. モバイルアプリ対応

この情報は2025年2月の調査に基づいており、プロジェクトの最新状態を反映しています。