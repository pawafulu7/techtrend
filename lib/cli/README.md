# TechTrend CLI

統合管理ツールのドキュメントです。

## 使用方法

```bash
# ヘルプの表示
npx techtrend --help

# または npm scripts経由
npm run techtrend -- --help
```

## コマンド一覧

### feed - フィード管理

```bash
# フィード収集
npx techtrend feed collect "Dev.to" "Qiita"

# ソース一覧表示
npx techtrend feed list

# 収集状況確認
npx techtrend feed status
```

### summary - 要約管理

```bash
# 要約生成
npx techtrend summary generate

# 特定ソースの要約生成
npx techtrend summary generate --source "Dev.to"

# 要約再生成
npx techtrend summary regenerate --force

# 欠損要約の生成
npx techtrend summary missing --days 7
```

### quality - 品質スコア管理

```bash
# 品質スコア計算
npx techtrend quality calculate

# 0スコアの修正
npx techtrend quality fix-zero

# スコア再計算
npx techtrend quality recalculate --force
```

### article - 記事管理

```bash
# 記事検索
npx techtrend article search "React"

# 難易度判定
npx techtrend article difficulty

# 低品質記事のクリーンアップ
npx techtrend article cleanup --dry-run
```

### tag - タグ管理

```bash
# タグ一覧
npx techtrend tag list

# タグ統計
npx techtrend tag stats

# 未使用タグのクリーンアップ
npx techtrend tag cleanup
```

### source - ソース管理

```bash
# ソース一覧
npx techtrend source list

# ソース有効化/無効化
npx techtrend source enable "Dev.to"
npx techtrend source disable "Dev.to"

# ソース統計
npx techtrend source stats
```

## グローバルオプション

- `--verbose, -v` - 詳細なログ出力
- `--quiet, -q` - 最小限のログ出力
- `--dry-run` - 実行せずに処理内容を表示
- `--help, -h` - ヘルプの表示
- `--version` - バージョン表示

## 開発者向け

### 新しいコマンドの追加

1. `lib/cli/commands/`に新しいコマンドファイルを作成
2. Commanderのサブコマンドとして実装
3. `lib/cli/index.ts`でコマンドを登録

例：
```typescript
// lib/cli/commands/example.ts
import { Command } from 'commander';

export function createExampleCommand() {
  const command = new Command('example');
  
  command
    .description('例のコマンド')
    .action(async () => {
      console.log('Example command executed');
    });
    
  return command;
}
```

### テスト

```bash
# CLIのテスト実行
npm test -- cli.test.ts

# 統合テスト
npm test -- integration/cli
```

## 移行状況

現在はPhase 1（互換性維持モード）で、既存スクリプトをラップしています。
詳細は[CLI-MIGRATION-PLAN.md](../../docs/CLI-MIGRATION-PLAN.md)を参照してください。