#!/bin/bash

# TechTrend Git Worktree Manager
# 並行開発を自動化するスクリプト

set -e

# 色付き出力
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 設定
BASE_DIR=$(dirname $(pwd))
BASE_PORT=3100
MAIN_BRANCH="main"  # or "master"

# ヘルプメッセージ
show_help() {
    echo "使用方法: ./worktree.sh [コマンド] [引数]"
    echo ""
    echo "コマンド:"
    echo "  auto <task-description>  - タスク説明から自動でworktree作成"
    echo "  create <branch-name>      - 指定したブランチ名でworktree作成"
    echo "  list                      - 既存のworktree一覧を表示"
    echo "  pr [title]                - 現在のブランチからPRを作成"
    echo "  finish                    - PR作成してworktreeをクリーンアップ"
    echo "  cleanup <name>            - 指定したworktreeを削除"
    echo ""
    echo "例:"
    echo "  ./worktree.sh auto \"認証機能を実装\""
    echo "  ./worktree.sh pr \"feat: 認証機能の追加\""
    echo "  ./worktree.sh cleanup auth-feature"
}

# タスク説明からブランチ名を生成
generate_branch_name() {
    local description="$1"
    local timestamp=$(date +%Y%m%d-%H%M%S)
    
    # 英語の簡単な変換（日本語対応）
    local branch_base=$(echo "$description" | \
        sed 's/を実装/implementation/g' | \
        sed 's/を修正/fix/g' | \
        sed 's/を追加/add/g' | \
        sed 's/を改善/improve/g' | \
        sed 's/バグ/bug/g' | \
        sed 's/機能/feature/g' | \
        sed 's/認証/auth/g' | \
        sed 's/ログイン/login/g' | \
        sed 's/[^a-zA-Z0-9-]/-/g' | \
        sed 's/--*/-/g' | \
        sed 's/^-//;s/-$//' | \
        tr '[:upper:]' '[:lower:]')
    
    # プレフィックスを決定
    local prefix="feature"
    if [[ "$description" =~ (修正|fix|bug|バグ) ]]; then
        prefix="fix"
    elif [[ "$description" =~ (改善|improve|performance|パフォーマンス) ]]; then
        prefix="improve"
    fi
    
    echo "${prefix}/${branch_base}-${timestamp}"
}

# 空いているポートを探す
find_available_port() {
    local port=$BASE_PORT
    while lsof -Pi :$port -sTCP:LISTEN -t >/dev/null 2>&1; do
        port=$((port + 1))
    done
    echo $port
}

# worktree作成（自動）
auto_create_worktree() {
    local description="$1"
    
    if [ -z "$description" ]; then
        echo -e "${RED}エラー: タスク説明を指定してください${NC}"
        show_help
        exit 1
    fi
    
    echo -e "${BLUE}タスク: $description${NC}"
    
    # ブランチ名を生成
    local branch_name=$(generate_branch_name "$description")
    local dir_name=$(echo "$branch_name" | sed 's/\//-/g')
    local worktree_path="$BASE_DIR/techtrend-$dir_name"
    
    echo -e "${BLUE}ブランチ名: $branch_name${NC}"
    echo -e "${BLUE}作業ディレクトリ: $worktree_path${NC}"
    
    # worktree作成
    create_worktree "$branch_name" "$worktree_path"
    
    # 環境情報を保存
    echo "$branch_name" > "$worktree_path/.worktree-info"
    echo "$description" >> "$worktree_path/.worktree-info"
    
    echo ""
    echo -e "${GREEN}✓ Worktree作成完了！${NC}"
    echo ""
    echo "次のコマンドで作業開始:"
    echo -e "${YELLOW}cd $worktree_path${NC}"
    echo ""
    echo "PRを作成する場合:"
    echo -e "${YELLOW}./worktree.sh pr \"$description\"${NC}"
}

# worktree作成（基本）
create_worktree() {
    local branch_name="$1"
    local worktree_path="$2"
    
    if [ -z "$worktree_path" ]; then
        local dir_name=$(echo "$branch_name" | sed 's/\//-/g')
        worktree_path="$BASE_DIR/techtrend-$dir_name"
    fi
    
    echo -e "${BLUE}Worktreeを作成中...${NC}"
    
    # ブランチが存在するか確認
    if git show-ref --verify --quiet "refs/heads/$branch_name"; then
        echo -e "${YELLOW}既存のブランチを使用${NC}"
        git worktree add "$worktree_path" "$branch_name"
    else
        echo -e "${YELLOW}新しいブランチを作成${NC}"
        git worktree add -b "$branch_name" "$worktree_path"
    fi
    
    # 環境セットアップ
    echo -e "${BLUE}環境をセットアップ中...${NC}"
    cd "$worktree_path"
    
    # ポート設定
    local port=$(find_available_port)
    echo "PORT=$port" > .env.local
    echo -e "${GREEN}ポート: $port${NC}"
    
    # 依存関係インストール
    if [ -f "package.json" ]; then
        echo -e "${BLUE}依存関係をインストール中...${NC}"
        npm install --silent
    fi
    
    # Prismaセットアップ
    if [ -f "prisma/schema.prisma" ]; then
        echo -e "${BLUE}Prismaクライアントを生成中...${NC}"
        npx prisma generate --silent
    fi
    
    cd - > /dev/null
}

# PR作成
create_pr() {
    local title="$1"
    local current_branch=$(git branch --show-current)
    
    if [ "$current_branch" = "$MAIN_BRANCH" ]; then
        echo -e "${RED}エラー: mainブランチからPRは作成できません${NC}"
        exit 1
    fi
    
    # タイトルが指定されていない場合
    if [ -z "$title" ]; then
        # .worktree-infoから読み取り
        if [ -f ".worktree-info" ]; then
            local task_desc=$(tail -n1 .worktree-info)
            title="feat: $task_desc"
        else
            title="feat: $current_branch"
        fi
    fi
    
    echo -e "${BLUE}PRを作成中...${NC}"
    echo "  ブランチ: $current_branch → $MAIN_BRANCH"
    echo "  タイトル: $title"
    
    # コミットされていない変更があるか確認
    if ! git diff-index --quiet HEAD --; then
        echo -e "${YELLOW}未コミットの変更があります。コミットしています...${NC}"
        git add -A
        git commit -m "$title"
    fi
    
    # push
    echo -e "${BLUE}ブランチをプッシュ中...${NC}"
    git push -u origin "$current_branch"
    
    # PR作成
    echo -e "${BLUE}Pull Requestを作成中...${NC}"
    
    # 変更内容の詳細を収集
    local commits=$(git log --oneline "$MAIN_BRANCH..$current_branch" | head -10)
    local commit_count=$(git rev-list --count "$MAIN_BRANCH..$current_branch")
    local changed_files=$(git diff --name-status "$MAIN_BRANCH..$current_branch")
    local file_count=$(git diff --name-only "$MAIN_BRANCH..$current_branch" | wc -l)
    local additions=$(git diff --shortstat "$MAIN_BRANCH..$current_branch" | grep -oE '[0-9]+ insertion' | grep -oE '[0-9]+' || echo "0")
    local deletions=$(git diff --shortstat "$MAIN_BRANCH..$current_branch" | grep -oE '[0-9]+ deletion' | grep -oE '[0-9]+' || echo "0")
    
    # 変更の種類を判定
    local change_type="機能追加"
    if [[ "$current_branch" =~ (fix|bug|修正) ]]; then
        change_type="バグ修正"
    elif [[ "$current_branch" =~ (improve|performance|改善) ]]; then
        change_type="パフォーマンス改善"
    elif [[ "$current_branch" =~ (refactor|リファクタ) ]]; then
        change_type="リファクタリング"
    elif [[ "$current_branch" =~ (test|テスト) ]]; then
        change_type="テスト追加・改善"
    elif [[ "$current_branch" =~ (docs|ドキュメント) ]]; then
        change_type="ドキュメント更新"
    fi
    
    # タスク説明を取得
    local task_description=""
    if [ -f ".worktree-info" ]; then
        task_description=$(tail -n1 .worktree-info)
    fi
    
    # PR本文を生成（詳細版）
    local body="## 📋 概要

**種別**: $change_type
**タスク**: ${task_description:-$title}

## 🎯 目的

このPRの目的は、${task_description:-$title}を実現することです。

## 📝 変更内容

### 統計情報
- **コミット数**: $commit_count
- **変更ファイル数**: $file_count
- **追加行数**: +$additions
- **削除行数**: -$deletions

### コミット履歴
\`\`\`
$commits
\`\`\`

### 変更ファイル一覧
<details>
<summary>クリックして展開</summary>

\`\`\`
$changed_files
\`\`\`
</details>

## 🔄 既存機能への影響

- [ ] 既存機能への影響なし
- [ ] 後方互換性あり
- [ ] Breaking Changeあり（詳細を記載）

## ✅ チェックリスト

### テスト
- [ ] ユニットテストを実行し、全て成功
- [ ] E2Eテストを実行し、全て成功
- [ ] 手動での動作確認完了

### コード品質
- [ ] ESLintエラーなし
- [ ] TypeScriptエラーなし
- [ ] コードレビュー準備完了

### ドキュメント
- [ ] 必要に応じてREADMEを更新
- [ ] 必要に応じてコメントを追加

## 📸 スクリーンショット（該当する場合）

*UIに変更がある場合は、スクリーンショットを添付してください*

## 💬 補足事項

*レビュアーへの追加情報があれば記載*

---
*Created by worktree.sh at $(date +"%Y-%m-%d %H:%M:%S")*
*Branch: \`$current_branch\`*"
    
    # GitHub CLIでPR作成
    if command -v gh &> /dev/null; then
        pr_url=$(gh pr create \
            --title "$title" \
            --body "$body" \
            --base "$MAIN_BRANCH" \
            --head "$current_branch")
        
        echo -e "${GREEN}✓ PR作成完了！${NC}"
        echo -e "${BLUE}PR URL: $pr_url${NC}"
    else
        echo -e "${YELLOW}GitHub CLIがインストールされていません${NC}"
        echo "手動でPRを作成してください:"
        echo "https://github.com/[your-repo]/compare/$current_branch?expand=1"
    fi
}

# worktree一覧
list_worktrees() {
    echo -e "${BLUE}Worktree一覧:${NC}"
    git worktree list | while read -r line; do
        if [[ ! "$line" =~ "(bare)" ]]; then
            echo "  $line"
        fi
    done
}

# worktreeクリーンアップ
cleanup_worktree() {
    local name="$1"
    
    if [ -z "$name" ]; then
        echo -e "${RED}エラー: worktree名を指定してください${NC}"
        exit 1
    fi
    
    # パスを構築
    local worktree_path
    if [[ "$name" =~ ^/ ]]; then
        worktree_path="$name"
    else
        local dir_name=$(echo "$name" | sed 's/\//-/g')
        worktree_path="$BASE_DIR/techtrend-$dir_name"
    fi
    
    echo -e "${YELLOW}Worktreeを削除: $worktree_path${NC}"
    
    # worktree削除
    if git worktree list | grep -q "$worktree_path"; then
        git worktree remove "$worktree_path" --force
        echo -e "${GREEN}✓ Worktree削除完了${NC}"
    else
        echo -e "${RED}Worktreeが見つかりません${NC}"
    fi
}

# PR作成してクリーンアップ
finish_worktree() {
    local current_dir=$(pwd)
    local current_branch=$(git branch --show-current)
    
    # PR作成
    create_pr "$1"
    
    # メインディレクトリに戻る
    cd "$BASE_DIR/techtrend"
    
    # worktreeクリーンアップ
    cleanup_worktree "$current_dir"
    
    echo -e "${GREEN}✓ 完了！${NC}"
}

# メインコマンド処理
case "$1" in
    auto)
        auto_create_worktree "$2"
        ;;
    create)
        create_worktree "$2"
        ;;
    list)
        list_worktrees
        ;;
    pr)
        create_pr "$2"
        ;;
    finish)
        finish_worktree "$2"
        ;;
    cleanup|remove)
        cleanup_worktree "$2"
        ;;
    help|--help|-h)
        show_help
        ;;
    *)
        echo -e "${RED}エラー: 不明なコマンド '$1'${NC}"
        echo ""
        show_help
        exit 1
        ;;
esac