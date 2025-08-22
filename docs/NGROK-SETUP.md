# Ngrok External Access Setup

TechTrendアプリケーションを一時的に外部公開するための設定ガイド

## 🚀 クイックスタート

### 1. ngrokのインストール

```bash
# Snap経由（推奨）
sudo snap install ngrok

# または直接ダウンロード
wget https://bin.equinox.io/c/bNyj1mQVY4c/ngrok-v3-stable-linux-amd64.tgz
tar xvzf ngrok-v3-stable-linux-amd64.tgz
sudo mv ngrok /usr/local/bin/
```

### 2. ngrokアカウントの設定

1. [ngrok.com](https://ngrok.com) でアカウント作成
2. ダッシュボードからAuth Tokenを取得
3. トークンを設定:
   ```bash
   ngrok config add-authtoken YOUR_AUTH_TOKEN
   ```

### 3. アプリケーションの起動

```bash
# 開発サーバーを起動
npm run dev

# 別のターミナルでngrokトンネルを起動
./scripts/setup-ngrok-tunnel.sh
```

## 🔐 Basic認証

デフォルトで以下の認証情報が設定されます：
- **ユーザー名**: admin
- **パスワード**: ランダム生成（起動時に表示）

### カスタム認証情報の設定

環境変数で認証情報をカスタマイズできます：

```bash
# 環境変数を設定して起動
NGROK_USERNAME=myuser NGROK_PASSWORD=mypassword ./scripts/setup-ngrok-tunnel.sh

# または.envファイルを作成
cp .env.ngrok.example .env.ngrok
# .env.ngrokを編集して認証情報を設定
source .env.ngrok
./scripts/setup-ngrok-tunnel.sh
```

## 📝 使用方法

1. スクリプト実行後、ngrokが提供するURLが表示されます
   ```
   Forwarding: https://xxxx-xxx-xxx.ngrok.io -> http://localhost:3000
   ```

2. ブラウザでURLにアクセス
3. Basic認証のダイアログが表示されるので、ユーザー名とパスワードを入力
4. TechTrendアプリケーションにアクセス可能

## ⚠️ セキュリティ注意事項

- **一時的な使用のみ**: 本番環境での使用は推奨しません
- **強力なパスワード**: 外部公開時は必ず強力なパスワードを設定
- **使用後は停止**: 不要になったら必ずCtrl+Cで停止
- **URLの共有**: Basic認証があっても、URLは必要な人のみに共有

## 🛠️ トラブルシューティング

### ngrokが起動しない
- Auth Tokenが設定されているか確認
- ポート3000でアプリケーションが起動しているか確認

### Basic認証が機能しない
- 環境変数が正しく設定されているか確認
- ブラウザのキャッシュをクリア

### 接続が遅い
- ngrokの無料プランには制限があります
- 有料プランへのアップグレードを検討

## 📊 ngrok管理画面

ngrokの管理画面で以下が確認できます：
- アクティブなトンネル
- リクエストログ
- 接続統計

管理画面: http://localhost:4040

## 🔄 代替手段

ngrok以外の選択肢：
- **localtunnel**: `npx localtunnel --port 3000`
- **Cloudflare Tunnel**: より安定した接続
- **Tailscale**: VPNベースの安全な接続