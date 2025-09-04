#!/bin/bash

# Git追跡状態監査スクリプト
# 重要なテストファイルが正しくGitに追跡されているか確認

echo "========================================="
echo "Git追跡状態監査レポート"
echo "========================================="
echo ""

# 色定義
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 1. E2E関連ファイルの追跡状態確認
echo "1. E2Eテスト関連ファイル"
echo "-----------------------------------------"

e2e_files=(
    "__tests__/e2e/utils/e2e-helpers.ts"
    "__tests__/e2e/setup-test-user.ts"
    "__tests__/e2e/global-setup.ts"
    "__tests__/e2e/constants/selectors.ts"
)

for file in "${e2e_files[@]}"; do
    if git ls-files --error-unmatch "$file" >/dev/null 2>&1; then
        echo -e "${GREEN}✓${NC} $file (追跡されています)"
    else
        echo -e "${RED}✗${NC} $file (追跡されていません！)"
    fi
done

echo ""

# 2. test-プレフィックスファイルの確認
echo "2. test-プレフィックスを持つファイル"
echo "-----------------------------------------"

# Gitで追跡されているtest-*.tsファイル
tracked_test_files=$(git ls-files "**test-*.ts" "**test-*.tsx" 2>/dev/null)
if [ -n "$tracked_test_files" ]; then
    echo "追跡されているtest-プレフィックスファイル:"
    echo "$tracked_test_files" | while read -r file; do
        echo -e "${GREEN}  ✓${NC} $file"
    done
else
    echo "追跡されているtest-プレフィックスファイル: なし"
fi

echo ""

# 未追跡のtest-*.tsファイル
untracked_test_files=$(git ls-files --others --exclude-standard "**test-*.ts" "**test-*.tsx" 2>/dev/null)
if [ -n "$untracked_test_files" ]; then
    echo -e "${YELLOW}警告:${NC} 未追跡のtest-プレフィックスファイル:"
    echo "$untracked_test_files" | while read -r file; do
        echo -e "${YELLOW}  !${NC} $file (gitignoreされています)"
    done
else
    echo "未追跡のtest-プレフィックスファイル: なし"
fi

echo ""

# 3. __tests__ディレクトリ内の全テストファイル統計
echo "3. テストファイル統計"
echo "-----------------------------------------"

# 追跡されているテストファイル数
tracked_count=$(git ls-files "__tests__/**/*.ts" "__tests__/**/*.tsx" 2>/dev/null | wc -l)
echo "追跡されているテストファイル: $tracked_count 件"

# specファイル数
spec_count=$(git ls-files "__tests__/**/*.spec.ts" "__tests__/**/*.spec.tsx" 2>/dev/null | wc -l)
echo "  - *.spec.ts(x): $spec_count 件"

# testファイル数
test_count=$(git ls-files "__tests__/**/*.test.ts" "__tests__/**/*.test.tsx" 2>/dev/null | wc -l)
echo "  - *.test.ts(x): $test_count 件"

# その他のテスト関連ファイル
other_count=$((tracked_count - spec_count - test_count))
echo "  - その他: $other_count 件"

echo ""

# 4. 重要ディレクトリの確認
echo "4. 重要ディレクトリの追跡状態"
echo "-----------------------------------------"

important_dirs=(
    "__tests__/e2e"
    "__tests__/unit"
    "__tests__/integration"
    "__tests__/components"
    "__tests__/api"
)

for dir in "${important_dirs[@]}"; do
    if [ -d "$dir" ]; then
        file_count=$(git ls-files "$dir" 2>/dev/null | wc -l)
        if [ "$file_count" -gt 0 ]; then
            echo -e "${GREEN}✓${NC} $dir/ ($file_count ファイル追跡中)"
        else
            echo -e "${YELLOW}!${NC} $dir/ (ディレクトリ存在するがファイル未追跡)"
        fi
    else
        echo -e "  $dir/ (存在しません)"
    fi
done

echo ""

# 5. gitignoreパターンの影響分析
echo "5. .gitignoreパターンの影響"
echo "-----------------------------------------"

# 現在のgitignoreパターンで除外される可能性のあるパターン
echo "テスト関連のgitignoreパターン:"
grep -E "test|spec|__tests__" .gitignore 2>/dev/null | grep -v "^#" | while read -r pattern; do
    echo "  - $pattern"
done

echo ""
echo "========================================="
echo "監査完了"
echo "========================================="

# 問題がある場合は終了コード1を返す
if [ -n "$untracked_test_files" ]; then
    echo ""
    echo -e "${YELLOW}警告: 未追跡のtest-プレフィックスファイルが存在します。${NC}"
    echo "これらのファイルが重要な場合は、ファイル名を変更するか、"
    echo ".gitignoreパターンを調整してください。"
    exit 1
fi

exit 0