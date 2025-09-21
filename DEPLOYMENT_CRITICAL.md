# 🚨 本番デプロイ必須事項

## 重要: CURSOR_SECRET 環境変数（2025年9月以降必須）

DB最適化フェーズ3（2025年9月）以降、本番環境で以下の環境変数が**必須**となりました。

### 必須環境変数

```bash
CURSOR_SECRET="32文字以上のランダム文字列"
```

### 生成方法

```bash
# 方法1: OpenSSL使用
openssl rand -hex 32

# 方法2: Node.js使用
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### 設定場所

#### Vercel
1. Project Settings → Environment Variables
2. `CURSOR_SECRET` を追加
3. Production環境にチェック
4. 生成した値を設定

#### その他のホスティング
`.env.production` または環境変数設定画面で設定

### 設定しない場合

本番環境で以下のエラーが発生し、**サイト全体が動作しません**：

```
Error: CURSOR_SECRET is required in production
```

### なぜ必要か

- カーソルベースページネーションのセキュリティ強化
- ページネーショントークンのHMAC署名検証
- トークン改ざん防止

### 影響範囲

- 記事一覧ページ（ページネーション使用）
- API: `/api/articles/list`
- その他ページネーション機能を使用する全ての箇所

---

## その他の必須環境変数

詳細は `.env.example` を参照してください。

- `DATABASE_URL`: PostgreSQLデータベース接続
- `NEXTAUTH_SECRET`: 認証用秘密鍵
- その他オプション設定