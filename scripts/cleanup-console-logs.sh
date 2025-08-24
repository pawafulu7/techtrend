#!/bin/bash

# console文のクリーンアップスクリプト
# 本番コードからconsole.log/error/warnを削除

echo "🧹 console文のクリーンアップを開始します..."

# 対象外ディレクトリ
EXCLUDE_DIRS="node_modules|.next|.git|dist|build|coverage"

# console文を削除（テストファイル以外）
find . -type f \( -name "*.ts" -o -name "*.tsx" \) \
  -not -path "*/node_modules/*" \
  -not -path "*/.next/*" \
  -not -path "*/__tests__/*" \
  -not -path "*/test/*" \
  -not -path "*.test.*" \
  -not -path "*.spec.*" \
  -exec grep -l "console\.\(log\|error\|warn\|info\|debug\)" {} \; | while read file; do
    
    # スクリプトファイルはスキップ
    if [[ "$file" == *"/scripts/"* ]]; then
        continue
    fi
    
    # console文をコメントアウトまたは削除
    sed -i.bak '/console\.\(log\|error\|warn\|info\|debug\)/d' "$file"
    
    # バックアップファイルを削除
    rm "${file}.bak"
    
    echo "✅ クリーンアップ: $file"
done

echo "🎉 console文のクリーンアップが完了しました！"

# 残っているconsole文の数をカウント
remaining=$(find . -type f \( -name "*.ts" -o -name "*.tsx" \) \
  -not -path "*/node_modules/*" \
  -not -path "*/.next/*" \
  -not -path "*/__tests__/*" \
  -not -path "*/test/*" \
  -not -path "*.test.*" \
  -not -path "*.spec.*" \
  -not -path "*/scripts/*" \
  -exec grep -c "console\.\(log\|error\|warn\|info\|debug\)" {} + | \
  awk '{sum += $1} END {print sum}')

echo "📊 残りのconsole文: ${remaining:-0}件"