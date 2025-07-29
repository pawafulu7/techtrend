# コードメンテナンスガイド

このガイドは、TechTrendプロジェクトの修正作業を行う際に、影響範囲を正確に把握し、関連箇所も含めて確実に修正するための手順書です。

## 1. 修正前の確認事項

### 1.1 影響範囲の特定

修正を行う前に、以下のコマンドで影響範囲を確認します：

```bash
# 関数・変数の使用箇所を検索
grep -r "関数名" --include="*.ts" --include="*.tsx" .

# インポート関係を確認
grep -r "from.*ファイル名" --include="*.ts" --include="*.tsx" .

# データベーススキーマの依存関係確認
grep -r "フィールド名" prisma/schema.prisma
```

### 1.2 関連ファイルマップ

以下の関連性を必ず確認してください：

```
フェッチャー関連：
├── lib/fetchers/*.ts         # 各ソースのフェッチャー
├── lib/sources.ts            # ソース定義
├── scheduler-v2.ts           # スケジューラー設定
├── scripts/collect-feeds.ts  # 手動収集スクリプト
└── scripts/generate-summaries.ts # 要約生成

データベース関連：
├── prisma/schema.prisma     # スキーマ定義
├── lib/database.ts          # DB接続
├── app/api/*/route.ts       # APIエンドポイント
└── app/*/page.tsx           # ページコンポーネント

品質管理関連：
├── lib/utils/quality-score.ts    # 品質スコア計算
├── scripts/fix-quality-scores.ts # 品質スコア修正
└── scripts/calculate-quality-scores.ts # 品質スコア再計算
```

## 2. よくある問題と修正パターン

### 2.1 要約・タグ付けの問題

**問題パターン：**
- 英語の要約が生成される
- 要約が本文の切り抜きになる
- タグが適切に付与されない

**確認手順：**
```bash
# フェッチャーの要約設定を確認
grep -n "summary:" lib/fetchers/*.ts

# 要約生成スクリプトの動作確認
npx tsx scripts/generate-summaries.ts --dry-run
```

**修正チェックリスト：**
- [ ] すべてのフェッチャーで `summary: undefined` が設定されているか
- [ ] `generate-summaries.ts` で日本語プロンプトが使用されているか
- [ ] 環境変数 `GEMINI_API_KEY` が正しく設定されているか

### 2.2 記事取得処理の問題

**問題パターン：**
- 新しい記事が取得されない
- 品質の低い記事が混入する
- 重複記事が発生する

**確認手順：**
```bash
# 最新記事の確認
sqlite3 prisma/dev.db "SELECT COUNT(*), source.name FROM Article JOIN Source ON Article.sourceId = Source.id WHERE publishedAt > datetime('now', '-1 day') GROUP BY source.name;"

# 品質スコアの分布確認
sqlite3 prisma/dev.db "SELECT qualityScore/10*10 as range, COUNT(*) FROM Article GROUP BY range;"
```

**修正チェックリスト：**
- [ ] フェッチャーの品質フィルタリング条件は適切か
- [ ] RSSフィールドマッピングは正しいか（例：`hatena:bookmarkcount` vs `bookmarkcount`）
- [ ] URLの正規化処理は一貫しているか
- [ ] 重複チェックロジックは機能しているか

### 2.3 スケジューラー関連の問題

**問題パターン：**
- 定期更新が動作しない
- PM2プロセスがクラッシュする

**確認手順：**
```bash
# PM2の状態確認
pm2 status

# ログ確認
pm2 logs tech-trend-scheduler --lines 100
```

**修正チェックリスト：**
- [ ] `ecosystem.config.js` の設定は正しいか
- [ ] `scheduler-v2.ts` のcron式は適切か
- [ ] エラーハンドリングは実装されているか

## 3. 修正時の必須確認事項

### 3.1 データベース変更時

1. **スキーマ変更前：**
   ```bash
   # 現在のデータをバックアップ
   cp prisma/dev.db prisma/dev.db.backup
   ```

2. **スキーマ変更後：**
   ```bash
   # マイグレーション実行
   npx prisma migrate dev
   
   # 型定義の更新
   npx prisma generate
   ```

3. **影響確認：**
   - [ ] すべてのAPIエンドポイントでエラーが出ないか
   - [ ] フロントエンドの型エラーが出ないか
   - [ ] 既存データとの互換性は保たれているか

### 3.2 フェッチャー修正時

1. **単体テスト：**
   ```bash
   # 特定ソースのみテスト
   npx tsx scripts/collect-feeds.ts "ソース名"
   ```

2. **影響確認：**
   - [ ] 記事が正しく取得されるか
   - [ ] フィールドマッピングは正しいか
   - [ ] 品質フィルタリングは機能しているか

3. **関連修正：**
   - [ ] スケジューラーの設定も更新が必要か
   - [ ] 要約生成スクリプトの調整が必要か

### 3.3 UI/UX修正時

1. **コンポーネント依存関係：**
   ```bash
   # コンポーネントの使用箇所を確認
   grep -r "ComponentName" app/ --include="*.tsx"
   ```

2. **スタイル影響：**
   - [ ] レスポンシブデザインは崩れていないか
   - [ ] ダークモード対応は維持されているか
   - [ ] アクセシビリティは損なわれていないか

## 4. 修正後の検証手順

### 4.1 基本動作確認

```bash
# 開発サーバー起動
npm run dev

# 基本ページの確認
- http://localhost:3000 （ホーム）
- http://localhost:3000/analytics （分析）
- http://localhost:3000/sources （ソース管理）
- http://localhost:3000/search/advanced （高度な検索）
```

### 4.2 データ整合性確認

```bash
# 記事数の確認
sqlite3 prisma/dev.db "SELECT COUNT(*) FROM Article;"

# 要約の有無確認
sqlite3 prisma/dev.db "SELECT COUNT(*) FROM Article WHERE summary IS NULL OR summary = '';"

# 品質スコアの確認
sqlite3 prisma/dev.db "SELECT COUNT(*) FROM Article WHERE qualityScore = 0;"
```

### 4.3 パフォーマンス確認

- [ ] ページロード時間は許容範囲内か
- [ ] 検索レスポンスは高速か
- [ ] メモリリークは発生していないか

## 5. トラブルシューティング

### 5.1 よくあるエラーと対処法

**エラー: "Cannot find module"**
```bash
# 依存関係の再インストール
rm -rf node_modules package-lock.json
npm install
```

**エラー: "Database is locked"**
```bash
# PM2プロセスを一時停止
pm2 stop tech-trend-scheduler
# 作業完了後に再開
pm2 start tech-trend-scheduler
```

**エラー: "Prisma Client is not generated"**
```bash
npx prisma generate
```

### 5.2 ロールバック手順

1. **コードのロールバック：**
   ```bash
   git checkout HEAD~1
   ```

2. **データベースのロールバック：**
   ```bash
   cp prisma/dev.db.backup prisma/dev.db
   ```

3. **PM2の再起動：**
   ```bash
   pm2 restart tech-trend-scheduler
   ```

## 6. 具体的な問題事例と解決策

### 6.1 はてなブックマーク記事が更新されない問題

**原因：** RSSパーサーのフィールド名不一致（`hatena:bookmarkcount` → `bookmarkcount`）

**影響ファイル：**
- `lib/fetchers/hatena-extended.ts`

**確認コマンド：**
```bash
# フィールド名の確認
grep -n "bookmarkcount" lib/fetchers/hatena-extended.ts

# 記事取得のテスト
npx tsx scripts/collect-feeds.ts "はてなブックマーク"
```

### 6.2 品質スコア0の記事が表示されない問題

**原因：** ホームページのフィルタリング条件（qualityScore >= 30）

**影響ファイル：**
- `app/page.tsx` - 品質フィルタ
- `scripts/fix-quality-scores.ts` - スコア修正
- `lib/utils/quality-score.ts` - スコア計算ロジック

**確認コマンド：**
```bash
# 品質スコア0の記事数確認
sqlite3 prisma/dev.db "SELECT COUNT(*) FROM Article WHERE qualityScore = 0;"

# 表示される記事数の確認
sqlite3 prisma/dev.db "SELECT COUNT(*) FROM Article WHERE qualityScore >= 30;"
```

### 6.3 要約が英語になる問題

**原因：** 
1. フェッチャーで要約を生成している
2. 英語ソースの記事に対して日本語要約が生成されていない

**影響ファイル：**
- すべての `lib/fetchers/*.ts`
- `scripts/generate-summaries.ts`
- `scripts/fix-english-summaries.ts`

**確認コマンド：**
```bash
# 英語要約の検出
sqlite3 prisma/dev.db "SELECT COUNT(*) FROM Article WHERE summary NOT LIKE '%。%' AND summary NOT LIKE '%、%';"

# フェッチャーの要約設定確認
grep -B2 -A2 "summary:" lib/fetchers/*.ts | grep -v "undefined"
```

## 7. コミュニケーション

### 7.1 修正内容の記録

修正を行った際は、以下の情報を必ず記録してください：

- 修正した問題の概要
- 影響を受けたファイル一覧
- 実施した検証内容
- 今後の注意点

### 7.2 定期メンテナンス

- 週次：低品質記事の削除（`scripts/delete-low-quality-articles.ts`）
- 月次：品質スコアの再計算（`scripts/calculate-quality-scores.ts`）
- 随時：要約の再生成（必要に応じて）

---

このガイドは継続的に更新してください。新しい問題パターンや解決策を発見した場合は、このドキュメントに追記することで、将来の作業効率を向上させることができます。