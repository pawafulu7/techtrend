#!/bin/bash

# ngrokの公開URLを取得するスクリプト

# 色付き出力
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${GREEN}=== Ngrok公開URL情報 ===${NC}"
echo ""

# ngrokが実行中か確認
if ! pgrep -x "ngrok" > /dev/null; then
    echo -e "${RED}ngrokが実行されていません${NC}"
    echo "起動するには: ./scripts/setup-ngrok-tunnel.sh"
    exit 1
fi

# ngrok APIから情報取得
TUNNELS_JSON=$(curl -s http://localhost:4040/api/tunnels 2>/dev/null)

if [ -z "$TUNNELS_JSON" ]; then
    echo -e "${RED}ngrok APIにアクセスできません${NC}"
    echo "ngrokが正常に起動しているか確認してください"
    exit 1
fi

# jqがインストールされているか確認
if command -v jq &> /dev/null; then
    # jqで整形して表示
    PUBLIC_URL=$(echo "$TUNNELS_JSON" | jq -r '.tunnels[0].public_url')
    PROTO=$(echo "$TUNNELS_JSON" | jq -r '.tunnels[0].proto')
    
    echo -e "${BLUE}プロトコル:${NC} $PROTO"
    echo -e "${BLUE}公開URL:${NC} ${YELLOW}$PUBLIC_URL${NC}"
    echo ""
    echo -e "${GREEN}アクセス方法:${NC}"
    echo "1. ブラウザで上記URLにアクセス"
    echo "2. Basic認証ダイアログが表示されます"
    echo "3. 認証情報は ./scripts/show-ngrok-auth.sh で確認"
else
    # jqがない場合は簡易的な表示
    echo "$TUNNELS_JSON" | grep -o '"public_url":"[^"]*' | sed 's/"public_url":"/公開URL: /'
    echo ""
    echo -e "${YELLOW}jqをインストールすると見やすく表示されます:${NC}"
    echo "sudo apt-get install jq"
fi

echo ""
echo -e "${GREEN}その他の情報:${NC}"
echo "ngrok管理画面: http://localhost:4040"
echo "認証情報確認: ./scripts/show-ngrok-auth.sh"