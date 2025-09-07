#!/bin/bash

echo "E2Eテスト実行開始..."

# 1. ヘルスチェック
echo "環境のヘルスチェックを実行中..."
npx tsx scripts/health-check-e2e.ts
if [ $? -ne 0 ]; then
  echo "ヘルスチェック失敗。環境を確認してください"
  echo "セットアップが必要な場合は ./scripts/setup-e2e-local.sh を実行してください"
  exit 1
fi

echo ""
echo "テスト実行モードを選択してください:"
echo "1. 個別実行（デバッグ用）"
echo "2. 全体実行"
echo -n "選択 (1/2): "
read mode

if [ "$mode" = "1" ]; then
  echo ""
  echo "個別テスト実行順序:"
  echo "1. regression-test.spec.ts - 基本機能の回帰テスト"
  echo "2. infinite-scroll.spec.ts - 無限スクロール"
  echo "3. source-filter-cookie.spec.ts - ソースフィルター"
  echo "4. tag-filter.spec.ts - タグフィルター"
  echo "5. search-clear.spec.ts - 検索クリア"
  echo "6. multiple-source-filter.spec.ts - 複数ソースフィルター"
  echo "7. digest.spec.ts - ダイジェスト機能"
  echo ""
  
  # 各テストを個別実行
  echo "regression-test.spec.ts を実行中..."
  npm run test:e2e -- regression-test.spec.ts
  
  echo ""
  echo "次のテストを実行しますか? (y/n): "
  read continue_test
  if [ "$continue_test" = "y" ]; then
    echo "infinite-scroll.spec.ts を実行中..."
    npm run test:e2e -- infinite-scroll.spec.ts
  fi
  
  echo ""
  echo "次のテストを実行しますか? (y/n): "
  read continue_test
  if [ "$continue_test" = "y" ]; then
    echo "source-filter-cookie.spec.ts を実行中..."
    npm run test:e2e -- source-filter-cookie.spec.ts
  fi
  
  echo ""
  echo "残りのテストも実行しますか? (y/n): "
  read continue_test
  if [ "$continue_test" = "y" ]; then
    echo "tag-filter.spec.ts を実行中..."
    npm run test:e2e -- tag-filter.spec.ts
    
    echo "search-clear.spec.ts を実行中..."
    npm run test:e2e -- search-clear.spec.ts
    
    echo "multiple-source-filter.spec.ts を実行中..."
    npm run test:e2e -- multiple-source-filter.spec.ts
    
    echo "digest.spec.ts を実行中..."
    npm run test:e2e -- digest.spec.ts
  fi
else
  echo ""
  echo "全E2Eテストを実行中..."
  npm run test:e2e
fi

echo ""
echo "E2Eテスト実行完了"