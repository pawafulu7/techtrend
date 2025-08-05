# TechTrend プロジェクトアーキテクチャ詳細（2025年2月調査）

## プロジェクト概要
TechTrendは技術記事の収集・要約・表示を行うWebアプリケーションです。複数のソースから技術記事を自動収集し、AI（Google Generative AI）を使用して日本語要約を生成、品質スコアリングと難易度判定を行い、ユーザーに提供します。

## 技術スタック
- **フロントエンド**: Next.js 15.4.4, React 19.1.0, TypeScript
- **スタイリング**: Tailwind CSS v4, shadcn/ui
- **データベース**: SQLite + Prisma ORM v6.12.0
- **キャッシュ**: Redis (ioredis v5.7.0)
- **AI**: Google Generative AI (Gemini)
- **プロセス管理**: PM2
- **テスト**: Jest v30
- **開発ツール**: tsx, ESLint v9, Prettier

## データベース構造
### Article（記事）
- id: CUID
- title: タイトル
- url: URL（ユニーク）
- summary: 要約（AI生成）
- thumbnail: サムネイル画像
- content: 本文
- publishedAt: 公開日時
- sourceId: ソースID
- bookmarks: ブックマーク数
- qualityScore: 品質スコア（0-100）
- userVotes: ユーザー投票数
- difficulty: 難易度レベル
- detailedSummary: 詳細要約
- articleType: 記事タイプ（release/problem-solving/tutorial/tech-intro/implementation）
- summaryVersion: 要約バージョン
- tags: タグ（多対多）

### Source（記事ソース）
- id: CUID
- name: ソース名
- type: タイプ
- url: URL
- enabled: 有効/無効フラグ

### Tag（タグ）
- id: CUID
- name: タグ名
- category: カテゴリ

## アーキテクチャ構成

### 1. フェッチャーシステム（lib/fetchers/）
全てのフェッチャーは`BaseFetcher`クラスを継承し、以下の機能を実装：
- リトライ機能（最大3回）
- URL正規化
- テキストサニタイズ
- サムネイル抽出

#### 主要フェッチャー
- **DevToFetcher**: Dev.toから記事取得（反応数10以上、読了時間2分以上）
- **QiitaPopularFetcher**: Qiitaの人気記事（ストック数10以上、24時間以内）
- **ZennExtendedFetcher**: Zennのトレンド記事（複数トピック対応）
- **SpeakerDeckFetcher**: プレゼンテーション資料（日本語、スクレイピング）
- その他: はてなブックマーク、Publickey、Stack Overflow Blog等

**重要なルール**: 
- フェッチャーで`summary: undefined`を設定（要約は別プロセスで生成）
- 品質フィルタリングを各フェッチャーで実装

### 2. スケジューラーシステム（scheduler-v2.ts）
PM2で管理される定期実行システム：

#### RSS系ソース（1時間ごと更新）
- はてなブックマーク
- Zenn
- Dev.to
- Qiita（通常）
- Publickey
- Stack Overflow Blog
- Think IT
- Rails Releases
- AWS
- SRE
- Google Developers Blog
- Corporate Tech Blog
- Hugging Face Blog
- Google AI Blog
- InfoQ Japan

#### Qiitaポピュラー（2回/日 - 5:05、17:05）
人気記事の定期取得

#### スクレイピング系ソース（12時間ごと更新 - 0時、12時）
- Speaker Deck

#### 更新パイプライン
1. フィード収集（collect-feeds.ts）
2. 要約生成（manage-summaries.ts）
3. 品質スコア計算（manage-quality-scores.ts）
4. 難易度レベル判定（calculate-difficulty-levels.ts）

### 3. AI要約システム（lib/ai/）
- **GeminiClient**: Google Generative AIのラッパー
- **記事タイプ判定**: 5つのタイプに分類
  - release: 新機能・アップデート情報
  - problem-solving: 問題解決・デバッグ
  - tutorial: チュートリアル・ハウツー
  - tech-intro: 技術紹介・概要説明
  - implementation: 実装例・コードサンプル
- **タイプ別要約プロンプト**: 記事タイプに応じた最適な要約生成

### 4. APIエンドポイント（app/api/）
#### 記事関連
- GET/POST `/api/articles` - 記事一覧取得・作成
- GET `/api/articles/[id]` - 記事詳細
- POST `/api/articles/[id]/vote` - 投票
- GET `/api/articles/[id]/related` - 関連記事
- GET `/api/articles/popular` - 人気記事
- GET `/api/articles/favorites` - お気に入り
- GET `/api/articles/search` - 検索

#### ソース関連
- GET `/api/sources` - ソース一覧
- GET/PUT/DELETE `/api/sources/[id]` - ソース詳細操作

#### タグ関連
- GET `/api/tags/cloud` - タグクラウド
- GET `/api/tags/stats` - タグ統計
- GET `/api/tags/new` - 新規タグ

#### その他
- GET `/api/trends/analysis` - トレンド分析
- GET `/api/trends/keywords` - キーワードトレンド
- POST `/api/ai/summarize` - AI要約生成
- GET `/api/health` - ヘルスチェック
- GET `/api/stats` - 統計情報

### 5. フロントエンド構成（app/）
#### ページ構成
- `/` - ホームページ（記事一覧）
- `/articles/[id]` - 記事詳細
- `/sources` - ソース一覧
- `/sources/[id]` - ソース別記事
- `/tags` - タグページ
- `/search` - 検索
- `/search/advanced` - 詳細検索
- `/popular` - 人気記事
- `/trends` - トレンド分析
- `/stats` - 統計情報
- `/analytics` - アナリティクス
- `/favorites` - お気に入り
- `/reading-list` - 読書リスト

#### コンポーネント構成
- **UI基盤**: shadcn/uiベース（components/ui/）
- **記事関連**: article/card.tsx、detailed-summary-*.tsx
- **検索**: SearchBar、SearchFilters、SearchResults
- **タグ**: TagCloud、TagStats
- **共通**: pagination、filters、mobile-filters

### 6. キャッシュ戦略
- Redis使用（lib/redis/）
- キャッシュキー例：
  - 記事一覧: `articles:${条件のハッシュ}`
  - 記事詳細: `article:${id}`
  - タグクラウド: `tags:cloud`

### 7. 品質管理システム
#### 品質スコア計算
- 基本スコア（0-40点）: ブックマーク数、投票数
- コンテンツスコア（0-30点）: 要約・コンテンツの有無
- 鮮度スコア（0-20点）: 公開からの経過時間
- エンゲージメントスコア（0-10点）: ユーザー活動

#### 低品質記事の自動削除
- Dev.to: 反応数0の記事
- 全ソース: 3ヶ月以上前の記事

### 8. CLI機能（lib/cli/）
```bash
npm run techtrend -- [コマンド] [オプション]
```
各種管理タスクをCLIから実行可能

## 運用上の重要事項
1. **要約生成は必ず別プロセス**: フェッチャーで要約を生成しない
2. **品質フィルタリング**: 各ソースで適切な閾値設定
3. **スケジューラー管理**: PM2で監視・自動再起動
4. **メモリ制限**: 1GBで自動再起動
5. **ログ管理**: logs/ディレクトリに出力

## 開発フロー
1. 新フェッチャー追加時は`BaseFetcher`を継承
2. `summary: undefined`を必ず設定
3. スケジューラーへの登録（RSS系 or スクレイピング系）
4. 品質フィルタリングの実装
5. テスト作成と実行