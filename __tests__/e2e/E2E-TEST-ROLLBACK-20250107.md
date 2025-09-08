# E2E テスト修正のロールバック実装詳細

## 実施日
2025年1月7日

## 背景
PR #42 レビューコメントに基づいて E2E テストの安定性改善を実施したが、CI 環境でのテスト失敗が増加した。
- 修正前: 9 failed, 6 flaky
- 修正後: 11 failed, 16 flaky

## 問題の原因
1. **過度な最適化**: 複雑な waitForFunction 条件がCI環境でタイムアウト
2. **不適切なセレクタ**: nth-of-type セレクタがCI環境で不安定
3. **環境差異**: ローカルとCI環境の処理速度差

## 実施した修正

### filter-persistence.spec.ts
```diff
- await page.waitForSelector(`[data-testid^="source-checkbox-"]:nth-of-type(1)`, {...});
+ await page.waitForTimeout(300);
```

### source-exclude.spec.ts
以下を元に戻した：
- 複雑な waitForFunction による全チェックボックス状態確認
- waitForLoadState('domcontentloaded') → waitForTimeout
- waitForSelector → waitForTimeout

## テスト結果（ローカル）
- ✅ source-exclude.spec.ts: ソースの選択と解除ができる
- ✅ source-exclude.spec.ts: 全選択・全解除ボタンが機能する

## 今後の方針
1. CI環境での動作確認を優先
2. 段階的に改善（一度に多くの変更を加えない）
3. waitForTimeout が安定性を提供する場合は残す

## 教訓
- CI環境とローカル環境の差異を考慮
- 複雑な条件より安定性を優先
- 段階的な改善アプローチの重要性