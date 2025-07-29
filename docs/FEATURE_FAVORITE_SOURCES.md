# お気に入りソース管理機能 - 詳細設計書

作成日: 2025-01-29

## 1. 機能概要

### 目的
ユーザーが好みのソースをお気に入り登録し、効率的に情報収集できるようにする。

### 主な機能
- ソースのお気に入り登録/解除
- お気に入りソースの一覧表示
- お気に入りソースからの記事フィード
- ソースごとの通知設定
- お気に入りソースの並び替え
- カスタムフォルダー管理

## 2. 技術設計

### 2.1 データストレージ

#### LocalStorage構造
```typescript
interface FavoriteSource {
  id: string;
  sourceId: string;
  addedAt: Date;
  folder?: string;
  notifications: {
    enabled: boolean;
    frequency: 'all' | 'daily' | 'weekly';
  };
  order: number;
}

interface FavoriteFolder {
  id: string;
  name: string;
  color: string;
  createdAt: Date;
  order: number;
}
```

### 2.2 React Hooks

```typescript
// useFavoriteSources.ts
export function useFavoriteSources() {
  const [favorites, setFavorites] = useState<FavoriteSource[]>([]);
  const [folders, setFolders] = useState<FavoriteFolder[]>([]);
  
  const addFavorite = (sourceId: string) => {};
  const removeFavorite = (sourceId: string) => {};
  const toggleFavorite = (sourceId: string) => {};
  const isFavorite = (sourceId: string) => boolean;
  const moveFavorite = (sourceId: string, folderId?: string) => {};
  
  return {
    favorites,
    folders,
    addFavorite,
    removeFavorite,
    toggleFavorite,
    isFavorite,
    moveFavorite
  };
}
```

### 2.3 UI/UX設計

#### お気に入りボタン
- ソースカードに星アイコン
- ワンクリックで登録/解除
- アニメーション付きフィードバック

#### お気に入りソースページ
1. **フォルダービュー**: フォルダー別に整理
2. **グリッドビュー**: カード形式で一覧
3. **フィードビュー**: 最新記事を統合表示

#### 管理機能
- ドラッグ&ドロップで並び替え
- フォルダー作成・編集・削除
- 一括操作（選択削除など）

## 3. 実装計画

### Phase 1: 基本機能
1. お気に入り登録/解除
2. ローカルストレージ管理
3. お気に入りソース一覧

### Phase 2: 整理機能
1. フォルダー管理
2. 並び替え機能
3. 検索・フィルター

### Phase 3: 拡張機能
1. 通知設定
2. 統合フィード
3. エクスポート/インポート

## 4. 実装チェックリスト

- [ ] LocalStorage管理ユーティリティ
- [ ] useFavoriteSources Hook
- [ ] お気に入りボタンコンポーネント
- [ ] お気に入りソース一覧ページ
- [ ] フォルダー管理UI
- [ ] ドラッグ&ドロップ実装
- [ ] 統合フィードページ
- [ ] 通知設定UI
- [ ] レスポンシブ対応
- [ ] ドキュメント更新