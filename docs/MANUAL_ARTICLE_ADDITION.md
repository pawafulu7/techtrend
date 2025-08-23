# TechTrend 手動記事追加機能

## 概要

TechTrendに任意のURLから記事を手動で追加できるCLIツールです。
特定の良質な記事を即座にデータベースに追加し、自動的に要約を生成できます。

## インストール

プロジェクトの依存関係がインストール済みであることを確認してください：

```bash
npm install
```

## 使用方法

### 基本的な使用

```bash
# 記事を追加（要約も自動生成）
npm run add-article -- --url="https://speakerdeck.com/hik0107/how-to-reflect-value-of-data"

# カスタムタイトルで追加
npm run add-article -- --url="https://example.com/article" --title="カスタムタイトル"

# 要約生成をスキップ
npm run add-article -- --url="https://example.com/article" --skip-summary

# ドライラン（実際には保存しない）
npm run add-article -- --url="https://example.com/article" --dry-run
```

### バッチ処理

複数のURLを一括で追加する場合：

1. URLリストファイルを作成（各行に1つのURL）：

```text
# urls.txt
https://speakerdeck.com/example1
https://qiita.com/items/abc123
https://zenn.dev/articles/xyz789
# コメント行は無視されます
```

2. バッチ処理を実行：

```bash
npm run add-article -- --batch urls.txt
```

## オプション

| オプション | 短縮形 | 説明 | デフォルト |
|-----------|--------|------|------------|
| --url | -u | 追加する記事のURL（必須） | - |
| --title | -t | カスタムタイトル | 自動取得 |
| --skip-summary | - | 要約生成をスキップ | false |
| --skip-enrichment | - | エンリッチメント処理をスキップ | false |
| --dry-run | - | ドライラン（実際には保存しない） | false |
| --batch | -b | バッチ処理用のURLリストファイル | - |
| --help | -h | ヘルプを表示 | - |

## 対応サイト

以下のサイトは専用のエンリッチャーにより、より詳細な情報を取得できます：

### 高精度対応（専用エンリッチャー）
- Speaker Deck
- Qiita
- Zenn
- Dev.to
- はてなブックマーク
- Medium
- Google AI Blog
- Google Developers Blog
- Hugging Face
- InfoQ
- Publickey
- Think IT
- Stack Overflow Blog

### 企業技術ブログ
- サイボウズ
- メルカリ
- LINE
- DeNA
- 楽天
- Yahoo
- Cookpad
- freee
- マネーフォワード
- SmartHR
- GMOペパボ
- Sansan
- リクルート
- ZOZO

### その他のサイト
上記以外のサイトでも基本的なメタデータ（タイトル、OGP画像など）を自動取得します。

## 動作の流れ

1. **URL検証**: 有効なHTTP/HTTPSのURLかチェック
2. **重複チェック**: 既に同じURLの記事が存在しないか確認
3. **ソース判定**: URLからソース（サイト）を自動判定
4. **エンリッチメント**: 対応サイトの場合、専用エンリッチャーでコンテンツ取得
5. **記事保存**: データベースに記事情報を保存
6. **要約生成**: Gemini APIを使用して日本語要約を自動生成

## エラー処理

### よくあるエラーと対処法

#### 重複記事エラー
```
❌ 記事追加失敗
エラー: 既に同じURLの記事が存在します。
```
**対処**: URLが既にデータベースに存在します。別の記事を追加してください。

#### 無効なURL
```
❌ 記事追加失敗
エラー: 無効なURLです。http://またはhttps://で始まるURLを指定してください。
```
**対処**: 正しい形式のURLを指定してください。

#### 要約生成エラー
```
⚠️ 要約生成失敗: Rate limit exceeded
```
**対処**: Gemini APIのレート制限に達しました。時間を置いて再試行するか、`--skip-summary`オプションを使用してください。

## 実装例

### Speaker Deckの記事追加

```bash
npm run add-article -- --url="https://speakerdeck.com/hik0107/how-to-reflect-value-of-data"
```

出力例：
```
🚀 TechTrend 手動記事追加ツール

📍 URL: https://speakerdeck.com/hik0107/how-to-reflect-value-of-data

📍 ソース判定: Speaker Deck (信頼度: high)
🔍 エンリッチャー使用: SpeakerDeckEnricher
✅ エンリッチメント成功: 1500文字
✅ 記事保存完了: article-123
📝 要約生成中...
✅ 要約生成完了

============================================================
✅ 記事追加成功！

📄 タイトル: データをどう使うか？ーメルカリでの学び, デジタル庁の挑戦
🏷️ ソース: Speaker Deck
🆔 記事ID: article-123

📝 要約:
メルカリとデジタル庁でのデータ活用経験を共有。データドリブンな意思決定の重要性と実装方法を解説。

📋 詳細要約:
• データ活用の基本原則
• メルカリでの実装事例
• デジタル庁での取り組み
• 今後の展望

💬 記事を正常に追加しました
============================================================
👋 処理完了
```

### バッチ処理の例

```bash
# urls.txt ファイルを作成
cat > urls.txt << EOF
https://speakerdeck.com/example1
https://qiita.com/items/abc123
https://zenn.dev/articles/xyz789
EOF

# バッチ実行
npm run add-article -- --batch urls.txt
```

## 注意事項

1. **レート制限**: 要約生成にはGemini APIを使用するため、レート制限があります
2. **処理時間**: エンリッチメントと要約生成には時間がかかる場合があります（記事あたり10-30秒）
3. **コンテンツ取得**: 一部のサイトではコンテンツ取得に失敗する場合があります
4. **要約品質**: 自動生成された要約は必要に応じて手動で編集してください

## トラブルシューティング

### データベース接続エラー
```bash
# PostgreSQLが起動しているか確認
docker ps | grep postgres

# 起動していない場合
docker-compose -f docker-compose.dev.yml up -d
```

### 依存関係エラー
```bash
# 依存関係を再インストール
npm ci

# Prismaクライアントを再生成
npx prisma generate
```

### 権限エラー
```bash
# 実行権限を付与
chmod +x scripts/manual/add-article-manually.ts
```

## 開発者向け情報

### ファイル構成
```
lib/utils/
├── source-detector.ts       # URLからソース判定
├── article-manual-adder.ts  # 記事追加コアロジック
└── web-fetcher.ts           # Web取得ユーティリティ

scripts/manual/
└── add-article-manually.ts  # CLIスクリプト

__tests__/manual/
└── add-article.test.ts      # テストファイル
```

### テスト実行
```bash
npm test -- __tests__/manual/add-article.test.ts
```

### デバッグモード
```bash
# 詳細ログを表示
DEBUG=* npm run add-article -- --url="https://example.com"
```

## ライセンス

TechTrendプロジェクトのライセンスに準じます。

## サポート

問題が発生した場合は、GitHubのIssueで報告してください。