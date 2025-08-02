# Fetcher アーキテクチャ

## 基底クラス
**BaseFetcher** (lib/fetchers/base.ts)
- 抽象クラスとして全フェッチャーの基盤を提供
- 共通機能:
  - retry機能（maxRetries: 3, retryDelay: 1000ms）
  - safeFetch: エラーハンドリング
  - normalizeUrl: URL正規化
  - extractThumbnail: サムネイル抽出
  - sanitizeText: テキストのサニタイズ

## フェッチャー実装（13個）

### RSS系フェッチャー
- PublickeyFetcher
- StackOverflowBlogFetcher
- RailsReleasesFetcher
- GoogleDevBlogFetcher
- ThinkITFetcher
- SREFetcher
- AWSFetcher
- HatenaExtendedFetcher (はてなブックマーク)
- ZennExtendedFetcher (複数トピック対応)

### API系フェッチャー
- DevToFetcher (Dev.to API使用)
- QiitaPopularFetcher (Qiita trend API使用)

### スクレイピング系フェッチャー
- SpeakerDeckFetcher (Cheerio使用)

## createFetcher ファクトリー関数
lib/fetchers/index.ts で定義
- ソース名からフェッチャーインスタンスを生成

## 共通パターン
1. 全フェッチャーがBaseFetcherを継承
2. fetchInternal()メソッドを実装
3. FetchResult型を返す
4. 品質フィルタリングは各フェッチャーで実装