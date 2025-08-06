# TechTrend フェッチャー実装詳細（2025年2月）

## フェッチャーシステム概要
全フェッチャーは`BaseFetcher`クラスを継承し、統一されたインターフェースで記事収集を実現。

## BaseFetcher 基本機能
- **リトライ機能**: 最大3回、指数バックオフ
- **URL正規化**: 重複記事の防止
- **テキストサニタイズ**: HTMLタグ除去、文字参照デコード
- **サムネイル抽出**: og:image, twitter:imageから取得
- **エラーハンドリング**: 統一エラーログ出力

## 実装済みフェッチャー一覧（17ソース）

### 1. DevToFetcher（lib/fetchers/devto.ts）
- **ソース**: Dev.to
- **取得方法**: REST API
- **品質フィルタ**:
  - positive_reactions_count >= 10
  - reading_time_minutes >= 2
  - 日別トップ記事優先（top=1）
- **取得件数**: 最大30件/回
- **特記事項**: descriptionをcontentフィールドに保存

### 2. QiitaPopularFetcher（lib/fetchers/qiita-popular.ts）
- **ソース**: Qiita
- **取得方法**: Qiita API v2
- **品質フィルタ**:
  - ストック数10以上（stocks:>10）
  - 24時間以内の記事
- **取得件数**: 最大30件/回
- **更新頻度**: 2回/日（5:05, 17:05）

### 3. ZennExtendedFetcher（lib/fetchers/zenn-extended.ts）
- **ソース**: Zenn
- **取得方法**: RSS (daily-trend)
- **トピック**: 
  - javascript, react, nextjs, typescript
  - nodejs, python, go, rust
  - aws, docker, kubernetes
- **取得件数**: 最大30件/回
- **特記事項**: URLからタグ自動抽出

### 4. SpeakerDeckFetcher（lib/fetchers/speakerdeck.ts）
- **ソース**: Speaker Deck
- **取得方法**: Webスクレイピング（Cheerio）
- **品質フィルタ**: 日本語プレゼンテーション
- **取得件数**: 最大30件/回
- **更新頻度**: 12時間毎（0時、12時）
- **特記事項**: 
  - プレゼン詳細ページから説明文取得
  - 並列処理（5件ずつバッチ処理）
  - 100ms遅延でレート制限対策

### 5. HatenaExtendedFetcher（lib/fetchers/hatena-extended.ts）
- **ソース**: はてなブックマーク
- **取得方法**: RSS（テクノロジーカテゴリ）
- **取得件数**: 最大40件/回
- **特記事項**: ホットエントリー優先

### 6. PublickeyFetcher（lib/fetchers/publickey.ts）
- **ソース**: Publickey
- **取得方法**: RSS
- **カテゴリ**: クラウド、開発ツール、プログラミング言語

### 7. StackOverflowBlogFetcher（lib/fetchers/stackoverflow-blog.ts）
- **ソース**: Stack Overflow Blog
- **取得方法**: RSS
- **言語**: 英語記事（要約は日本語生成）

### 8. ThinkITFetcher（lib/fetchers/thinkit.ts）
- **ソース**: Think IT
- **取得方法**: RSS
- **カテゴリ**: エンジニア向け技術記事

### 9. RailsReleasesFetcher（lib/fetchers/rails-releases.ts）
- **ソース**: Rails公式
- **取得方法**: GitHub Releases API
- **内容**: Railsバージョンリリース情報

### 10. AWSFetcher（lib/fetchers/aws.ts）
- **ソース**: AWS Blog
- **取得方法**: RSS
- **カテゴリ**: AWSサービス、アップデート情報

### 11. SREFetcher（lib/fetchers/sre.ts）
- **ソース**: SRE関連ブログ
- **取得方法**: RSS
- **内容**: SRE、DevOps、インフラ関連

### 12. GoogleDevBlogFetcher（lib/fetchers/google-dev-blog.ts）
- **ソース**: Google Developers Blog
- **取得方法**: RSS
- **内容**: Google技術、API、フレームワーク

### 13. CorporateTechBlogFetcher（lib/fetchers/corporate-tech-blog.ts）
- **ソース**: 企業技術ブログ集約
- **取得方法**: RSS
- **企業**: 日本のテック企業ブログ

### 14. HuggingFaceFetcher（lib/fetchers/huggingface.ts）
- **ソース**: Hugging Face Blog
- **取得方法**: RSS
- **内容**: AI/ML、NLP、モデル関連

### 15. GoogleAIFetcher（lib/fetchers/google-ai.ts）
- **ソース**: Google AI Blog
- **取得方法**: RSS
- **内容**: AI研究、機械学習

### 16. InfoQJapanFetcher（lib/fetchers/infoq-japan.ts）
- **ソース**: InfoQ Japan
- **取得方法**: RSS
- **内容**: アーキテクチャ、開発手法

### 17. QiitaFetcher（基本版）
- **ソース**: Qiita（通常記事）
- **取得方法**: Qiita API v2
- **更新頻度**: 1時間毎

## 共通実装ルール

### 1. 要約生成の禁止
```typescript
// 全フェッチャーで必須
summary: undefined  // 要約は generate-summaries.ts で生成
```

### 2. エラーハンドリング
```typescript
try {
  // フェッチ処理
} catch (error) {
  console.error(`[${this.source.name}] エラー:`, error);
  return [];  // 空配列を返す
}
```

### 3. 記事オブジェクト構造
```typescript
interface Article {
  title: string;
  url: string;
  summary: undefined;  // 必須
  thumbnail?: string;
  content?: string;
  publishedAt: Date;
  sourceId: string;
  bookmarks: number;
  qualityScore: number;
  tags?: string[];
}
```

### 4. リトライ戦略
- 初回: 即座に実行
- 1回目: 1秒待機
- 2回目: 2秒待機
- 3回目: 4秒待機

## フェッチャー登録（lib/fetchers/index.ts）
`createFetcher`関数でソース名に応じたフェッチャーインスタンスを生成。

## スケジューラー統合（scheduler-v2.ts）

### RSS系ソース（1時間毎）
```javascript
const RSS_SOURCES = [
  'はてなブックマーク',
  'Zenn',
  'Dev.to',
  'Publickey',
  // ... 他11ソース
];
```

### スクレイピング系（12時間毎）
```javascript
const SCRAPING_SOURCES = ['Speaker Deck'];
```

### Qiita Popular（1日2回）
```javascript
const QIITA_POPULAR_SOURCE = 'Qiita Popular';
// 5:05, 17:05 に実行
```

## パフォーマンス最適化
1. **並列処理**: 複数ソースを同時フェッチ
2. **バッチ処理**: SpeakerDeckは5件ずつ処理
3. **キャッシュ活用**: 重複チェックにRedis使用
4. **レート制限対応**: 適切な遅延とリトライ

## 品質管理
1. **重複防止**: URL正規化による重複チェック
2. **品質フィルタ**: 各ソース固有の品質基準
3. **データ検証**: 必須フィールドの存在確認
4. **エラーログ**: 詳細なエラー情報記録

## 今後の拡張予定
- GitHub Blog（実装済み、無効化中）
- Microsoft Developer Blog（実装済み、無効化中）
- 他の企業技術ブログの追加