# フェッチャーアーキテクチャ

## 基本設計
- **BaseFetcher**: 全フェッチャーの抽象基底クラス
  - エラーハンドリング、リトライ機能、ログ出力を統一
  - `safeFetch()`: 共通のラッパーメソッド
  - `fetchInternal()`: 各フェッチャーが実装する抽象メソッド

## フェッチャー一覧
1. **RSS系フェッチャー** (1時間ごと更新)
   - HatenaExtendedFetcher: はてなブックマーク
   - QiitaPopularFetcher: Qiita人気記事 
   - ZennExtendedFetcher: Zenn複数トピック
   - DevToFetcher: Dev.to
   - PublickeyFetcher: Publickey
   - StackOverflowBlogFetcher: Stack Overflow Blog
   - ThinkITFetcher: Think IT
   - AWSFetcher: AWS公式
   - SREFetcher: SRE関連
   - GoogleDevBlogFetcher: Google開発者ブログ
   - RailsReleasesFetcher: Rails公式リリース

2. **スクレイピング系フェッチャー** (12時間ごと更新)
   - SpeakerDeckFetcher: Speaker Deck日本語プレゼン

## 品質管理
各フェッチャーで独自の品質フィルタリング実装：
- Dev.to: 反応数10以上、読了時間2分以上
- Qiita: ストック数10以上、24時間以内
- はてな: ブックマーク数によるフィルタ

## 注意点
- 全フェッチャーで `summary: undefined` を設定（要約はgenerate-summaries.tsで別途生成）
- URLの正規化とサニタイズ処理実装
- エラー時のリトライ機能（最大3回）