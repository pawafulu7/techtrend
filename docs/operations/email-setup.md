# メール認証設定ガイド

## 問題点
- Resend無料プランは登録メールアドレスにしか送信できない
- 実用的なメール認証には別の方法が必要

## 推奨設定

### Option 1: Gmail（推奨）

最も簡単で実用的な方法です。

#### 設定手順

1. **Googleアカウントの2段階認証を有効化**
   - https://myaccount.google.com/security
   - 「2段階認証」を有効にする

2. **アプリパスワードを生成**
   - https://myaccount.google.com/apppasswords
   - アプリ: 「メール」を選択
   - デバイス: 「その他」を選択し「TechTrend」と入力
   - 生成された16文字のパスワードをコピー

3. **.envファイルを編集**
```env
# メール認証設定（Gmail）
EMAIL_FROM=noreply@techtrend.com
GMAIL_USER=あなたのメール@gmail.com
GMAIL_APP_PASSWORD=xxxx xxxx xxxx xxxx  # スペースは不要
```

4. **開発サーバーを再起動**
```bash
npm run dev
```

### Option 2: SendGrid

プロフェッショナルなメール配信サービス。

1. https://sendgrid.com でアカウント作成
2. APIキーを生成
3. .envに設定
```env
SENDGRID_API_KEY=SG.xxxxxxxxxxxxx
```

### Option 3: Mailgun

1. https://mailgun.com でアカウント作成
2. ドメイン認証
3. .envに設定
```env
MAILGUN_API_KEY=key-xxxxx
MAILGUN_DOMAIN=mg.yourdomain.com
```

### Option 4: 開発環境では認証をスキップ

開発時のみメール認証を無効化する方法。

```typescript
// lib/auth/utils.ts に追加
export async function createUser({
  email,
  password,
  name,
}: {
  email: string;
  password: string;
  name?: string;
}) {
  // 開発環境では自動的にメール認証済みにする
  const emailVerified = process.env.NODE_ENV === 'development' 
    ? new Date() 
    : null;
    
  // ... 既存のコード
}
```

## トラブルシューティング

### Gmailが送信されない
- 2段階認証が有効か確認
- アプリパスワードが正しいか確認
- 「安全性の低いアプリ」の設定は不要（アプリパスワード使用時）

### Resendの制限
- 無料プラン: 登録メールアドレスのみ
- 解決策: ドメイン認証（有料）またはGmail使用

### 送信制限
- Gmail: 500通/日
- SendGrid: 100通/日（無料）
- Resend: 100通/日（無料、制限あり）

## セキュリティ注意事項

- アプリパスワードは`.env`ファイルに保存
- `.env`ファイルは絶対にGitにコミットしない
- 本番環境では環境変数で管理

## 参考リンク

- [Gmail アプリパスワード](https://support.google.com/accounts/answer/185833)
- [SendGrid Documentation](https://docs.sendgrid.com/)
- [Nodemailer Documentation](https://nodemailer.com/)