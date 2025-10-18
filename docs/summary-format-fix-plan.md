# 詳細要約表示問題の修正計画

## 問題の概要

### 発生している現象
詳細要約が**カード形式で表示されず、段落形式の長文として表示される**

**スクリーンショット証拠:**
- cmg0yujes000bter2kvckfc5j（Value Intelligence記事）
- cmg115wkr0005teas4034fom9（Shai-Hulud記事）

### 期待される表示
- 項目名（アイコン付き）と内容が**カード形式で分離表示**
- 各セクションが独立したカードとして視覚的に整理される

### 実際の表示
- フォールバック表示：改行区切りの段落形式テキスト
- パーサーが失敗し、`sections.length === 0` となっている

---

## 根本原因の分析

### 1. Markdown装飾の混入
**問題:** Geminiが項目名に `**太字**` を勝手に追加している

**実際のDB出力:**
```
・**Value Intelligenceの概要と目的**:
```

**期待される出力:**
```
・Value Intelligenceの概要と目的：
```

**影響:** 項目名に不要な装飾が含まれ、パーサーの正規表現にマッチしない

---

### 2. 項目名と内容の改行分離
**問題:** Geminiが項目名と内容を**別々の行**に出力している

**実際のDB出力:**
```
・**Value Intelligenceの概要と目的**:
SALESCOREが正式リリースしたAIサービス「Value Intelligence」は...
```

**期待される出力:**
```
・Value Intelligenceの概要と目的：SALESCOREが正式リリースしたAIサービス「Value Intelligence」は...
```

**影響:** パーサーの正規表現 `/^[・-]\s*(.+?)[:\uff1a]\s*(.*)$/` は**同一行のみ**をマッチ対象とするため、改行後の内容を取得できない

---

### 3. パーサーの正規表現仕様
**場所:** `lib/utils/summary-parser.ts:116`

**現在の正規表現:**
```typescript
const match = trimmedLine.match(/^[・-]\s*(.+?)[:\uff1a]\s*(.*)$/);
```

**問題点:**
- `(.*)$` は同一行の末尾までしかマッチしない
- 複数行にまたがる内容には対応していない

**設計思想:**
- パーサーは**シンプルに保つ**べき
- 複雑な複数行パースは避けるべき
- **プロンプト側で正しい形式を強制する**方が保守性が高い

---

## 必要な修正内容

### 修正1: プロンプトへのMarkdown禁止指示追加
**ファイル:** `lib/ai/adapter/prompt-builder.ts`
**場所:** `BASE_PROMPT` 定義（2-110行目）

**追加する指示（58-62行目付近に挿入）:**
```typescript
【各項目の必須要件】
・記事タイプに応じて最適な項目名を自由に設定
・各項目は「・項目名：」の後に必ず詳細な説明を記載
・【重要】項目名と内容は必ず同一行に記載すること（改行厳禁）
・【重要】Markdown装飾（**太字**、_斜体_、#見出し等）を一切使用しないこと
```

**具体的な追加文言案:**
```
【出力形式の厳密な要件】
1. 各項目は必ず「・項目名：内容」の形式で同一行に記載
2. 項目名と内容の間に改行を入れないこと
3. Markdown装飾（**、_、#、`等）を一切使用しないこと
4. 項目名は装飾なしの平文テキストのみで記載
5. コロン（：）の後に必ず半角スペースを入れること

【正しい例】
・Value Intelligenceの概要と目的：SALESCOREが正式リリースしたAIサービス...
・独自概念「Value Map」の仕組み：Value Intelligenceの核となるのが...

【誤った例（絶対禁止）】
・**Value Intelligenceの概要と目的**:
SALESCOREが正式リリース...（改行があるためNG）

・# Value Intelligenceの概要
内容...（Markdown見出しを使用しているためNG）
```

---

### 修正2: フロントエンドのsummaryVersion型正規化（既に実施済み）
**ファイル:**
- `app/components/article/detailed-summary-cards.tsx`
- `app/components/article/detailed-summary-compact.tsx`
- `app/components/article/detailed-summary-modern.tsx`
- `app/components/article/detailed-summary-structured.tsx`
- `app/components/article/detailed-summary-timeline.tsx`

**追加済みコード:**
```typescript
const normalizedSummaryVersion =
  typeof summaryVersion === 'number'
    ? summaryVersion
    : typeof summaryVersion === 'string'
      ? Number.parseInt(summaryVersion, 10)
      : 8;

const sections = parseSummary(detailedSummary, {
  articleType,
  summaryVersion: normalizedSummaryVersion,
});
```

**状態:** ✅ 完了（2025-09-27実施）

---

## 修正後の実施作業

### 1. プロンプト修正の実施
```bash
# 1. prompt-builder.tsを修正
# 2. ビルド・テスト検証
npm run docker:build
npm run docker:lint
npm run docker:test
```

### 2. 既存の不正な要約の再生成

**影響範囲の確認:**
```sql
-- Markdown装飾を含む記事の確認
SELECT COUNT(*) FROM "Article"
WHERE "detailedSummary" LIKE '%**%'
AND "summaryVersion" = 8;

-- 改行分離形式の記事の確認（サンプル）
SELECT id, title, LEFT("detailedSummary", 200)
FROM "Article"
WHERE "detailedSummary" LIKE '・%:%'
AND "summaryVersion" = 8
LIMIT 10;
```

**再生成スクリプト実行:**
```bash
# 全記事の要約を再生成（summaryVersion=8の記事のみ）
npx tsx scripts/maintenance/regenerate-summaries-v8.ts

# または、特定の記事のみ再生成
npx tsx scripts/manual/regenerate-single-article.ts <article-id>
```

**再生成スクリプトの作成が必要:**
```typescript
// scripts/maintenance/regenerate-summaries-v8.ts
import { prisma } from '@/lib/db/prisma';
import { getAppDependencies } from '@/lib/di/bootstrap';

async function main() {
  const deps = getAppDependencies();
  const articles = await prisma.article.findMany({
    where: {
      summaryVersion: 8,
      detailedSummary: {
        contains: '**' // Markdown装飾を含む記事
      }
    }
  });

  console.log(`Found ${articles.length} articles to regenerate`);

  for (const article of articles) {
    console.log(`Regenerating: ${article.title}`);

    const result = await deps.summaryService.generateSummary({
      title: article.title,
      content: article.content || '',
      url: article.url
    });

    await prisma.article.update({
      where: { id: article.id },
      data: {
        summary: result.summary,
        detailedSummary: result.detailedSummary,
        summaryVersion: 8
      }
    });

    console.log(`✓ Completed: ${article.id}`);
  }

  console.log('All articles regenerated successfully');
}

main();
```

### 3. 段階的な再生成計画

**Phase 1: テスト確認（5件）**
```bash
# サンプル記事で動作確認
npx tsx scripts/manual/regenerate-single-article.ts cmg0yujes000bter2kvckfc5j
npx tsx scripts/manual/regenerate-single-article.ts cmg115wkr0005teas4034fom9
```

**Phase 2: 少量バッチ（100件）**
```bash
# 最新100件を再生成
npx tsx scripts/maintenance/regenerate-summaries-v8.ts --limit 100
```

**Phase 3: 全件再生成（対象数を確認後）**
```bash
# 全対象記事を再生成
npx tsx scripts/maintenance/regenerate-summaries-v8.ts --all
```

---

## 検証方法

### 1. プロンプト修正後の検証
```bash
# テスト記事で要約生成
npx tsx scripts/test/test-unified-summary.ts

# 生成された要約の形式確認
# 以下を満たすことを確認：
# - 項目名に ** が含まれていない
# - 項目名と内容が同一行にある
# - 正規表現でパース可能
```

### 2. フロントエンド表示確認
```bash
# 開発サーバー起動
npm run dev

# ブラウザで確認
# http://localhost:3000/article/<article-id>
#
# 確認項目：
# ✓ 詳細要約がカード形式で表示される
# ✓ 各セクションに適切なアイコンが表示される
# ✓ 項目名と内容が分離されている
# ✓ フォールバック表示（段落形式）になっていない
```

### 3. パーサー動作確認
```typescript
// テストコードで確認
import { parseSummary } from '@/lib/utils/summary-parser';

const testSummary = `
・Value Intelligenceの概要と目的：SALESCOREが正式リリースしたAIサービス...
・独自概念「Value Map」の仕組み：Value Intelligenceの核となるのが...
`;

const sections = parseSummary(testSummary, {
  summaryVersion: 8
});

console.log(`Parsed sections: ${sections.length}`); // 期待値: 2
console.log(sections);
```

---

## チェックリスト

### 修正前の確認
- [ ] 影響を受ける記事数の確認（SQL実行）
- [ ] 現在のsummaryVersionの分布確認
- [ ] バックアップの作成

### 修正作業
- [ ] prompt-builder.tsの修正
- [ ] ビルド成功確認
- [ ] Lint成功確認
- [ ] テスト成功確認
- [ ] テスト記事で動作確認

### 再生成作業
- [ ] 再生成スクリプトの作成
- [ ] Phase 1: サンプル5件で確認
- [ ] Phase 2: 100件バッチで確認
- [ ] Phase 3: 全件再生成

### 検証作業
- [ ] パーサーが正しく動作することを確認
- [ ] フロントエンドでカード表示されることを確認
- [ ] 5つの表示スタイル全てで確認
- [ ] モバイル表示の確認

### 完了後
- [ ] git commit & push
- [ ] プルリクエスト作成
- [ ] レビュー対応
- [ ] マージ & デプロイ

---

## 参考情報

### 関連ファイル
- `lib/ai/adapter/prompt-builder.ts` - プロンプト定義
- `lib/utils/summary-parser.ts` - パーサー実装
- `app/components/article/detailed-summary-*.tsx` - 表示コンポーネント（5種類）

### 関連Issue/PR
- （該当するIssue番号を記載）

### 更新履歴
- 2025-09-27: 初版作成（問題分析・修正計画策定）