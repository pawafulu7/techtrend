#!/bin/bash

# TechTrend Ngrok Tunnel Setup Script with Basic Authentication
# このスクリプトはngrokを使用してローカルサーバーを一時的に外部公開します

set -e

# 色付き出力
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# デフォルト設定
PORT=${PORT:-3000}
USERNAME=${NGROK_USERNAME:-admin}
PASSWORD=${NGROK_PASSWORD:-$(openssl rand -base64 12)}

echo -e "${GREEN}=== TechTrend Ngrok Tunnel Setup ===${NC}"
echo ""

# ngrokのインストール確認
if ! command -v ngrok &> /dev/null; then
    echo -e "${YELLOW}ngrokがインストールされていません。${NC}"
    echo ""
    echo "インストール方法:"
    echo ""
    echo "1. Snap経由（推奨）:"
    echo "   sudo snap install ngrok"
    echo ""
    echo "2. 直接ダウンロード:"
    echo "   wget https://bin.equinox.io/c/bNyj1mQVY4c/ngrok-v3-stable-linux-amd64.tgz"
    echo "   tar xvzf ngrok-v3-stable-linux-amd64.tgz"
    echo "   sudo mv ngrok /usr/local/bin/"
    echo ""
    echo "3. APT経由:"
    echo "   curl -s https://ngrok-agent.s3.amazonaws.com/ngrok.asc | sudo tee /etc/apt/trusted.gpg.d/ngrok.asc >/dev/null"
    echo "   echo \"deb https://ngrok-agent.s3.amazonaws.com buster main\" | sudo tee /etc/apt/sources.list.d/ngrok.list"
    echo "   sudo apt update && sudo apt install ngrok"
    echo ""
    echo "インストール後、ngrokアカウントを作成してトークンを設定してください:"
    echo "   ngrok config add-authtoken YOUR_AUTH_TOKEN"
    echo ""
    exit 1
fi

# 開発サーバーの起動確認
if ! curl -s http://localhost:$PORT > /dev/null 2>&1; then
    echo -e "${YELLOW}警告: localhost:$PORT でサーバーが起動していません。${NC}"
    echo "先に開発サーバーを起動してください:"
    echo "   npm run dev"
    echo ""
    read -p "続行しますか？ (y/n): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
fi

# Basic認証情報の表示と保存
echo -e "${GREEN}=====================================${NC}"
echo -e "${GREEN}Basic認証情報${NC}"
echo -e "${GREEN}=====================================${NC}"
echo -e "${YELLOW}ユーザー名:${NC} $USERNAME"
echo -e "${YELLOW}パスワード:${NC} $PASSWORD"
echo -e "${GREEN}=====================================${NC}"
echo ""

# 認証情報をファイルに保存
AUTH_FILE="/tmp/ngrok-auth-$(date +%Y%m%d-%H%M%S).txt"
cat > $AUTH_FILE << EOF
TechTrend Ngrok Basic認証情報
生成日時: $(date)
====================================
ユーザー名: $USERNAME
パスワード: $PASSWORD
====================================

この情報は以下のファイルに保存されています:
$AUTH_FILE

ngrok管理画面: http://localhost:4040
EOF

echo -e "${YELLOW}認証情報を以下のファイルに保存しました:${NC}"
echo "$AUTH_FILE"
echo ""
echo -e "${YELLOW}認証情報を確認するには:${NC}"
echo "cat $AUTH_FILE"
echo ""

# ngrok設定ファイルの作成
NGROK_CONFIG="/tmp/ngrok-techtrend.yml"
cat > $NGROK_CONFIG << EOF
version: "2"
authtoken: \$(ngrok config get authtoken | grep -oP 'authtoken:\s*\K.*')
tunnels:
  techtrend:
    proto: http
    addr: $PORT
    auth: "$USERNAME:$PASSWORD"
    inspect: true
    host_header: "localhost:$PORT"
EOF

echo -e "${GREEN}ngrokトンネルを起動しています...${NC}"
echo "Basic認証付きでポート $PORT を公開します"
echo ""
echo "停止するには Ctrl+C を押してください"
echo ""

# ngrokを起動（v3用のコマンド形式）
ngrok http --basic-auth="$USERNAME:$PASSWORD" $PORT