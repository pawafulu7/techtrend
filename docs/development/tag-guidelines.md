# タグガイドライン

最終更新: 2025年10月10日

---

## 1. 基本原則

### 1.1 タグとソースの責任分離

**ソース（Source）**:
- 記事の「発信元」を表す
- フィルタリングの主軸
- 例: Hacker News, AWS Blog, GitHub Blog, DeNA Engineering

**タグ（Tag）**:
- 記事の「内容・性質・技術領域」を表す
- 横断的な検索・分類に使用
- 例: AI, JavaScript, セキュリティ, クラウド, React

### 1.2 タグの粒度

#### 適切な粒度

ユーザーが検索に使用する語彙レベル：
- ✓ 'React', 'TypeScript', 'セキュリティ'
- ✓ 'Machine Learning', 'DevOps', 'Kubernetes'
- ✓ 'Claude', 'OpenAI', 'AWS Lambda'

#### 不適切な例

**具体的すぎる**:
- × 'React 18.2.0'（バージョン番号不要）
- × 'AWS Lambda Python 3.9'（詳細すぎ）

**一般的すぎる**:
- × 'Technology', 'Programming'（すべての記事が該当）
- × 'Software Engineering', 'Tech Companies'（曖昧）
- × 'Web Development'（広すぎる）

**ソース情報**:
- × 'Hacker News', 'Medium', 'Mozilla', 'Cloudflare'
- × 'Netflix', 'Airbnb', 'Uber'（企業名）

---

## 2. 禁止タグ

### 2.1 ソース名タグ（絶対禁止）

以下のようなソース名をタグとして付与してはならない：

```typescript
// NG例
tags.add('Hacker News');
tags.add('Medium');
tags.add('Mozilla');
tags.add('Cloudflare');
tags.add('GitHub');  // GitHubBlogFetcherでの付与は禁止
```

**例外**: URLベースのタグ

```typescript
// OK例: GitHubリポジトリへのリンク記事の分類として
if (isUrlFromDomain(url, 'github.com')) {
  tags.add('GitHub');      // ソースではなくリンク先の分類
  tags.add('Open Source');
}
```

### 2.2 企業名タグ（原則禁止）

企業名をタグとして付与してはならない：
- × 'Netflix', 'Airbnb', 'Uber', 'Spotify'
- × 'Google', 'Microsoft', 'Apple', 'Meta'

**例外**: 企業テックブログの過渡期設計として一時的に許容（将来的に削除予定）

### 2.3 過度に一般的なタグ（禁止）

技術記事収集サービスではほぼすべての記事が該当するタグ：
- × 'Technology', 'Programming'
- × 'Tech News', 'Engineering Blog'
- × 'Tech Companies', 'Software Engineering'

**判断基準**: 記事の50%以上に該当する場合は一般的すぎる

---

## 3. タグ生成のベストプラクティス

### 3.1 フェッチャー側のタグ生成

#### 基本方針

1. **ソース名を絶対に付与しない**
2. **コンテンツから抽出可能な技術キーワードのみ**
3. **一般的すぎるタグを避ける**

#### 推奨パターン

```typescript
private generateTags(title: string, url: string, categories?: string[]): string[] {
  const tags = new Set<string>();

  // NG: ソース名の付与
  // tags.add('Source Name');  // 絶対禁止

  // OK: URLベースのタグ（リンク先の分類）
  if (isUrlFromDomain(url, 'github.com')) {
    tags.add('GitHub');
    tags.add('Open Source');
  }

  // OK: タイトルベースのタグ
  if (title) {
    const lowerTitle = title.toLowerCase();
    if (lowerTitle.includes('react')) {
      tags.add('React');
    }
    if (lowerTitle.includes('typescript')) {
      tags.add('TypeScript');
    }
  }

  // OK: カテゴリベースのタグ
  if (categories) {
    categories.forEach(cat => {
      const normalized = normalizeTagInput(cat);
      normalized.forEach(tag => tags.add(tag));
    });
  }

  // NG: 一般的すぎるタグ
  // tags.add('Technology');  // 禁止
  // tags.add('Programming');  // 禁止

  return Array.from(tags);
}
```

### 3.2 AI要約サービス側のタグ生成

AI要約サービスのプロンプトでは以下を指示：

```
【タグ生成ルール】
- 3-5個の技術タグを生成
- 一般的な名称を使用（略称推奨）
- 適切な粒度（具体的すぎず、一般的すぎず）
- カンマ区切りで記載
```

**重要**: AIはソース情報を知らないため、ソース名をタグとして生成しない

### 3.3 タグの正規化

AI要約サービスのプロンプトで定義された正規化ルールに従う：
- Claude系 → 'Claude'
- GPT系 → 'GPT'
- JavaScript/JS → 'JavaScript'
- TypeScript/TS → 'TypeScript'

詳細: [lib/ai/adapter/prompt-builder.ts](../../lib/ai/adapter/prompt-builder.ts)

---

## 4. 実装チェックリスト

新規フェッチャー実装時:
- [ ] ソース名を「必須タグ」として付与していないか
- [ ] 企業名をタグとして付与していないか
- [ ] 一般的すぎるタグ（Technology, Programming等）を付与していないか
- [ ] タグの粒度は適切か（具体的すぎず、一般的すぎず）
- [ ] AI要約サービスとの重複はないか
- [ ] URLベースのタグは適切か（ソース名ではなくリンク先の分類）

既存フェッチャー修正時:
- [ ] 削除したタグに依存する機能はないか
- [ ] テストケースを追加したか
- [ ] データクリーンアップが必要か

---

## 5. 過去の失敗事例

### 事例1: Hacker News/Tech Newsタグの問題（2025年10月）

**問題**:
- HackerNewsFetcherが「Hacker News」「Tech News」を必須タグとして付与
- 人気タグ2位・4位を占有（1,660記事）
- ソース情報とタグ情報が重複

**原因**:
- フェッチャーの「必須タグ」としてソース名をハードコーディング
- タグとソースの責任分離が不明確

**対応**:
- 全フェッチャーの監査を実施
- ソースベースタグを完全削除（合計19個）
- タグガイドラインを策定

**教訓**:
- ソース名は絶対にタグとして付与しない
- 「必須タグ」の設計は慎重に
- 定期的なタグ品質監視が必要

**参考**:
- 調査: `.claude/docs/investigate/investigate_20251010_084752_source-based-tags.md`
- 計画: `.claude/docs/plan/plan_20251010_085409_remove-source-based-tags.md`

---

## 6. タグ品質の監視

### 6.1 定期的なチェック

**スクリプト**: [scripts/monitoring/check-tag-quality.ts](../../scripts/monitoring/check-tag-quality.ts)

```bash
# タグ品質チェック実行
npx tsx scripts/monitoring/check-tag-quality.ts
```

**チェック項目**:
- ソースベースタグの検出
- 一般的すぎるタグの検出
- タグの重複検出（大文字小文字の違いのみ）

### 6.2 CI/CD統合（推奨）

週次でタグ品質チェックを自動実行：
- GitHub Actions: `.github/workflows/tag-quality-check.yml`
- 実行頻度: 毎週日曜日

---

## 7. よくある質問

### Q1: 企業名タグはなぜ一時的に許容されているのか？

**A**: 企業テックブログが以前は「Corporate Tech Blog」という単一ソースで管理されていた歴史的経緯があり、企業名タグによるフィルタリングが必要だったため。現在は個別ソース化が完了しているため、将来的には削除予定。

### Q2: 'Web Standards'や'AI Research'はソース情報ではないのか？

**A**: これらは技術分野を表すタグ。Mozilla以外でもWeb Standards関連の記事は存在し、Hugging Face以外でもAI Research論文は存在するため、技術タグとして有効。

### Q3: URLベースの'GitHub'タグは許可されるのか？

**A**: GitHubリポジトリへのリンク記事の分類として有効。ソースが「Hacker News」でも、リンク先が「GitHub」であれば'GitHub'タグを付与することで、GitHubプロジェクト関連記事を横断的に検索できる。

### Q4: 'Cloud'や'Infrastructure'は一般的すぎないのか？

**A**: 文脈次第。Cloudflare Blogでは削除したが、AWS記事の'Cloud'タグは有効（クラウドサービス特化記事の分類）。基準は「記事の50%以上に該当するか」。

---

## 8. 参考情報

### 関連ファイル

- [lib/ai/adapter/prompt-builder.ts](../../lib/ai/adapter/prompt-builder.ts): AI要約プロンプト定義
- [lib/services/tag-normalizer.ts](../../lib/services/tag-normalizer.ts): タグ正規化処理
- [scripts/maintenance/remove-source-based-tags.ts](../../scripts/maintenance/remove-source-based-tags.ts): タグクリーンアップ
- [scripts/monitoring/check-tag-quality.ts](../../scripts/monitoring/check-tag-quality.ts): タグ品質監視

### 実装履歴

- 2025年10月10日: ソースベースタグ削除（19個のタグを削除、2,072記事に影響）
- 2025年9月: 企業テックブログタグシステム実装

---

**メンテナ**: Claude Code with Serena MCP
