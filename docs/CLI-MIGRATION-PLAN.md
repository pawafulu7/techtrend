# 既存スクリプトのCLI移行計画

## 概要

既存の個別スクリプトを統合CLIツール（`techtrend`コマンド）に移行する計画書です。

## 現在のスクリプト構成

### スケジューラーから呼ばれているスクリプト

1. **collect-feeds.ts**
   - 呼び出し: 1時間ごと（RSS）、12時間ごと（スクレイピング）、特定時刻（Qiita）
   - パラメータ: ソース名（複数可）

2. **core/manage-summaries.ts**
   - 呼び出し: フィード収集後、深夜2時
   - パラメータ: generate, regenerate, missing

3. **core/manage-quality-scores.ts**
   - 呼び出し: フィード収集後
   - パラメータ: calculate

4. **calculate-difficulty-levels.ts**
   - 呼び出し: フィード収集後
   - パラメータ: なし

5. **delete-low-quality-articles.ts**
   - 呼び出し: 毎日3時
   - パラメータ: なし

6. **clean-tags.ts**
   - 呼び出し: 毎日3時
   - パラメータ: なし

### その他のスクリプト

7. **generate-summaries.ts**
   - 旧要約生成スクリプト（manage-summaries.tsに統合済み）

8. **backup.sh**
   - 手動実行用バックアップスクリプト

## 移行戦略

### Phase 1: 互換性維持モード（現在）

既存スクリプトはそのまま残し、CLIから内部的に呼び出す：

```typescript
// lib/cli/commands/feed.ts
async function collectHandler(sources: string[], options: any) {
  const { execSync } = require('child_process');
  const sourceArgs = sources.map(s => `"${s}"`).join(' ');
  execSync(`npx tsx scripts/collect-feeds.ts ${sourceArgs}`, { stdio: 'inherit' });
}
```

### Phase 2: 段階的移行（次期）

1. **コアロジックの抽出**
   ```typescript
   // lib/feed-collector/index.ts
   export class FeedCollector {
     async collect(sources: string[]): Promise<CollectResult> {
       // collect-feeds.tsのロジックを移植
     }
   }
   ```

2. **CLIとスクリプトの共通化**
   ```typescript
   // scripts/collect-feeds.ts (移行期間中)
   import { FeedCollector } from '@/lib/feed-collector';
   
   async function main() {
     const collector = new FeedCollector();
     await collector.collect(process.argv.slice(2));
   }
   ```

3. **スケジューラーの更新**
   ```typescript
   // 段階的にCLIコマンドに置き換え
   await execAsync('npx tsx lib/cli/index.ts feed collect "Dev.to"');
   ```

### Phase 3: 完全移行（将来）

1. **すべてのスクリプトをCLIサブコマンドに統合**
2. **スケジューラーはCLIコマンドのみを呼び出す**
3. **旧スクリプトファイルを削除**

## 移行マッピング

| 既存スクリプト | CLIコマンド | 優先度 |
|-------------|----------|--------|
| collect-feeds.ts | techtrend feed collect | 高 |
| manage-summaries.ts generate | techtrend summary generate | 高 |
| manage-summaries.ts regenerate | techtrend summary regenerate | 中 |
| manage-summaries.ts missing | techtrend summary missing | 中 |
| manage-quality-scores.ts calculate | techtrend quality calculate | 高 |
| manage-quality-scores.ts fix-zero | techtrend quality fix-zero | 低 |
| manage-quality-scores.ts recalculate | techtrend quality recalculate | 低 |
| calculate-difficulty-levels.ts | techtrend article difficulty | 中 |
| delete-low-quality-articles.ts | techtrend article cleanup | 中 |
| clean-tags.ts | techtrend tag cleanup | 中 |

## 実装優先順位

### 優先度: 高（Phase 2で実装）

1. **feed collect**
   - 最も頻繁に実行される
   - 複雑なロジックを含む
   - フェッチャーの統合が必要

2. **summary generate**
   - 重要な機能
   - API連携あり
   - エラーハンドリングが重要

3. **quality calculate**
   - すべての記事処理で必要
   - パフォーマンスが重要

### 優先度: 中（Phase 2後半で実装）

4. **article difficulty**
   - 独立した処理
   - 移行が比較的簡単

5. **article cleanup**
   - 定期メンテナンス
   - 重要だが頻度は低い

6. **tag cleanup**
   - 定期メンテナンス
   - 単純な処理

### 優先度: 低（Phase 3で実装）

7. **summary regenerate/missing**
   - 特殊ケース用
   - 手動実行が主

8. **quality fix-zero/recalculate**
   - メンテナンス用
   - 頻度が低い

## 移行時の注意点

1. **後方互換性の維持**
   - スケジューラーは既存スクリプトを呼び続ける
   - 段階的に新CLIコマンドに切り替え

2. **エラーハンドリング**
   - 終了コードの互換性維持
   - ログ出力形式の統一

3. **パラメータの互換性**
   - 既存の引数形式をサポート
   - 新しいオプションは追加のみ

4. **テストの重要性**
   - 各移行段階でE2Eテスト実施
   - スケジューラーとの統合テスト

## タイムライン

- **Phase 1（完了）**: CLIフレームワーク構築
- **Phase 2（3-4週間）**: コアスクリプトの移行
- **Phase 3（2-3週間）**: 完全移行とクリーンアップ

## 次のアクション

1. FeedCollectorクラスの設計・実装
2. collect-feeds.tsのロジック抽出
3. CLIコマンドとの統合
4. スケジューラーでのテスト
5. 段階的な本番環境への適用