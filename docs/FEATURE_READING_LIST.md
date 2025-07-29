# 読書リスト管理機能 - 詳細設計書

作成日: 2025-01-29

## 1. 機能概要

### 目的
ユーザーが後で読みたい記事を保存し、読書の進捗を管理できるようにする。ローカルストレージを活用した個人向けの読書管理システム。

### 主な機能
- 記事を「後で読む」リストに追加/削除
- 読書ステータスの管理（未読・読書中・読了）
- フォルダ/カテゴリによる整理
- メモの追加
- 読書統計の表示

## 2. 技術設計

### 2.1 データストレージ

#### LocalStorage vs IndexedDB の選択
IndexedDBを採用（大量のデータ保存、構造化されたクエリが可能）

#### データスキーマ
```typescript
interface ReadingListItem {
  id: string;                    // UUID
  articleId: string;             // 記事ID
  addedAt: Date;                 // 追加日時
  status: 'unread' | 'reading' | 'completed';
  folder?: string;               // フォルダ名
  tags?: string[];               // カスタムタグ
  notes?: string;                // メモ
  progress?: number;             // 読書進捗（0-100%）
  completedAt?: Date;            // 読了日時
  lastAccessedAt?: Date;         // 最終アクセス日時
}

interface ReadingListFolder {
  id: string;
  name: string;
  color?: string;
  icon?: string;
  createdAt: Date;
}
```

### 2.2 IndexedDB設計

```typescript
// データベース名: techtrend-reading-list
// バージョン: 1

const DB_NAME = 'techtrend-reading-list';
const DB_VERSION = 1;

// オブジェクトストア
const STORES = {
  items: 'reading-list-items',
  folders: 'reading-list-folders',
  stats: 'reading-stats'
};

// インデックス
// items: articleId, status, folder, addedAt
// folders: name
```

### 2.3 API設計

#### クライアントサイド関数
```typescript
// lib/reading-list/index.ts

// 基本操作
async function addToReadingList(articleId: string, folder?: string): Promise<void>
async function removeFromReadingList(articleId: string): Promise<void>
async function updateReadingStatus(articleId: string, status: ReadingStatus): Promise<void>
async function updateProgress(articleId: string, progress: number): Promise<void>

// リスト取得
async function getReadingList(filter?: ReadingListFilter): Promise<ReadingListItem[]>
async function getReadingListItem(articleId: string): Promise<ReadingListItem | null>

// フォルダ管理
async function createFolder(name: string, options?: FolderOptions): Promise<void>
async function deleteFolder(folderId: string): Promise<void>
async function moveToFolder(articleId: string, folderId: string): Promise<void>

// 統計
async function getReadingStats(): Promise<ReadingStats>
```

### 2.4 実装計画

#### Phase 1: 基本機能
1. IndexedDBラッパーの作成
2. 読書リスト追加/削除機能
3. 読書ステータス管理

#### Phase 2: 整理機能
1. フォルダ管理
2. タグ付け機能
3. 並び替え・フィルタリング

#### Phase 3: 拡張機能
1. 読書統計・分析
2. エクスポート/インポート
3. 読書目標設定

## 3. フロントエンド設計

### 3.1 コンポーネント構造

```
components/reading-list/
├── ReadingListButton.tsx      # 記事カードの追加ボタン
├── ReadingListPage.tsx        # 読書リストページ
├── ReadingListItem.tsx        # リストアイテム
├── ReadingListFilters.tsx     # フィルタコントロール
├── ReadingListStats.tsx       # 統計表示
├── FolderManager.tsx          # フォルダ管理
└── ReadingProgress.tsx        # 進捗表示
```

### 3.2 UI/UXデザイン

#### 記事カードへの統合
- 各記事カードに「後で読む」ボタンを追加
- ワンクリックで追加/削除
- 追加済みの視覚的フィードバック

#### 読書リストページ
- `/reading-list` でアクセス
- グリッド/リスト表示の切り替え
- ドラッグ&ドロップでフォルダ整理

#### 読書進捗の表示
- プログレスバーで視覚化
- 読了までの推定時間
- 連続読書日数のトラッキング

### 3.3 レスポンシブデザイン
- モバイル: スワイプでステータス変更
- タブレット: サイドバーでフォルダ表示
- デスクトップ: 全機能の表示

## 4. パフォーマンス考慮事項

### 4.1 データ同期
- 変更は即座にIndexedDBに保存
- UIは楽観的更新を使用
- バックグラウンドでの定期的なクリーンアップ

### 4.2 最適化
- 仮想スクロールで大量アイテムに対応
- 遅延読み込みで初期表示を高速化
- Service Workerでオフライン対応

## 5. テスト計画

### 5.1 単体テスト
- IndexedDB操作のテスト
- コンポーネントのテスト
- フック関数のテスト

### 5.2 統合テスト
- 追加から削除までのフロー
- フォルダ移動の動作
- 統計の正確性

## 6. マイグレーション戦略

### 6.1 データ構造の変更
- バージョン管理による自動マイグレーション
- 後方互換性の維持
- データ損失の防止

## 7. セキュリティ考慮事項

- ローカルストレージのみ使用（外部送信なし）
- XSS対策（ユーザー入力のサニタイズ）
- データの暗号化は不要（ローカル完結）

## 8. 実装チェックリスト

- [ ] IndexedDBラッパーの作成
- [ ] 基本的なCRUD操作の実装
- [ ] ReadingListButtonコンポーネント
- [ ] ReadingListPageの作成
- [ ] フォルダ管理機能
- [ ] 読書統計の実装
- [ ] UIコンポーネントのスタイリング
- [ ] テストの作成
- [ ] ドキュメントの更新
- [ ] パフォーマンス最適化