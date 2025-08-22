#!/bin/bash

# 最新のngrok認証情報を表示するスクリプト

# 色付き出力
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${GREEN}=== Ngrok認証情報の確認 ===${NC}"
echo ""

# 最新の認証情報ファイルを探す
AUTH_FILE=$(ls -t /tmp/ngrok-auth-*.txt 2>/dev/null | head -n1)

if [ -z "$AUTH_FILE" ]; then
    echo -e "${RED}認証情報ファイルが見つかりません。${NC}"
    echo "まず ./scripts/setup-ngrok-tunnel.sh を実行してください。"
    exit 1
fi

echo -e "${YELLOW}最新の認証情報ファイル:${NC}"
echo "$AUTH_FILE"
echo ""
echo -e "${GREEN}内容:${NC}"
cat "$AUTH_FILE"

# ngrokが実行中か確認
if pgrep -x "ngrok" > /dev/null; then
    echo ""
    echo -e "${GREEN}ngrokは実行中です${NC}"
    echo ""
    echo -e "${YELLOW}公開URLを確認するには:${NC}"
    echo "1. ブラウザで http://localhost:4040 にアクセス"
    echo "2. または: curl -s http://localhost:4040/api/tunnels | jq -r '.tunnels[0].public_url'"
else
    echo ""
    echo -e "${RED}ngrokは実行されていません${NC}"
    echo "起動するには: ./scripts/setup-ngrok-tunnel.sh"
fi