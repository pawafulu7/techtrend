# Vercel自動マイグレーション設定ガイド

## ✅ 既に自動化されています！

`package.json`の`vercel-build`コマンドで既に設定済み：
```json
"vercel-build": "prisma generate && prisma migrate deploy && next build"
```

## 必要な設定（Vercelダッシュボード）

### 1. 環境変数の設定

Vercelプロジェクトの Settings → Environment Variables で設定：

```
DATABASE_URL = postgres://[ユーザー]:[パスワード]@db.prisma.io:5432/postgres?sslmode=require
```

### 2. 設定確認方法

#### オプション1: Vercel CLI
```bash
# インストール
npm i -g vercel

# ログイン
vercel login

# プロジェクトリンク
vercel link

# 環境変数確認
vercel env ls
```

#### オプション2: Webダッシュボード
1. https://vercel.com/dashboard
2. プロジェクト選択
3. Settings → Environment Variables
4. DATABASE_URLが存在することを確認

## 動作フロー

1. **GitHubにプッシュ**
   ```bash
   git push origin main
   ```

2. **Vercelが自動検知**
   - mainブランチへのプッシュを検知
   - 自動ビルド開始

3. **vercel-buildコマンド実行**
   - `prisma generate` - クライアント生成
   - `prisma migrate deploy` - **マイグレーション自動適用** ✅
   - `next build` - アプリビルド

4. **デプロイ完了**
   - マイグレーション適用済み
   - 新しいコードがデプロイ

## マイグレーション作成から自動適用まで

### Step 1: マイグレーション作成（ローカル）
```bash
# スキーマ変更後
npx prisma migrate dev --name add_new_feature
```

### Step 2: コミット＆プッシュ
```bash
git add prisma/migrations/
git commit -m "feat: 新機能のマイグレーション追加"
git push origin main
```

### Step 3: 自動適用（Vercel）
- 何もする必要なし！
- Vercelが自動的に処理
- デプロイログで確認可能

## トラブルシューティング

### マイグレーションが適用されない場合

1. **環境変数の確認**
   - DATABASE_URLが正しく設定されているか
   - Production環境に設定されているか

2. **ビルドコマンドの確認**
   - Settings → General → Build & Output Settings
   - Build Command: `npm run vercel-build`

3. **デプロイログの確認**
   - Deployments → 該当デプロイ → Building
   - エラーメッセージを確認

### エラー時の対処

#### "relation already exists"エラー
```bash
# ローカルで解決
DATABASE_URL="本番URL" npx prisma migrate resolve --applied [migration_name]
```

#### ロールバック
```bash
# Vercel CLIでロールバック
vercel rollback

# または管理画面から
Deployments → 成功した過去のデプロイ → Promote to Production
```

## セキュリティ注意事項

1. **DATABASE_URLは必ずVercel環境変数で管理**
   - コードに直接記載しない
   - .envファイルはコミットしない

2. **プレビューデプロイでの注意**
   - 別のDBを使用することを推奨
   - 本番DBを共有しない

3. **破壊的変更の確認**
   - DROP、DELETE、TRUNCATEを含むマイグレーションは慎重に
   - 必ずバックアップを取得

## まとめ

- ✅ **既に自動化設定済み**
- ✅ **追加作業不要**
- ✅ **マイグレーションは自動適用される**

必要なのは：
1. Vercelに`DATABASE_URL`が設定されていること
2. マイグレーションファイルをGitにプッシュすること

以上で、本番環境へのマイグレーション自動適用が実現されます！