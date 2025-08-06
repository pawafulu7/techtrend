# TechTrendレイアウトとスタイリングシステム詳細 (2025年1月)

## レイアウト構造

### メインレイアウト (app/page.tsx)
```
div.h-full.flex.flex-col.overflow-hidden
  └── div.container.mx-auto.px-2.sm:px-4.py-2.flex.flex-col.h-full.overflow-hidden
      ├── Header Section (固定高さ、flex-shrink-0)
      │   ├── タイトル・管理ボタン
      │   └── 検索ボックス・タグフィルター
      └── div.flex.gap-2.sm:gap-4.flex-1.overflow-hidden
          ├── Sidebar (固定幅 w-48、デスクトップのみ)
          └── Main Content (flex-1.overflow-y-auto)
              └── div.space-y-2
                  ├── Sort Options Bar (relative)
                  │   ├── 記事件数・モバイルフィルター
                  │   ├── 上部ページング (absolute positioned)
                  │   └── ソートボタン群
                  ├── Articles List
                  └── Bottom Pagination
```

## 固定・スティッキー要素

### 現在の固定要素
1. **ヘッダー** (app/components/layout/header.tsx)
   - `sticky top-0 z-50`
   - 背景: `bg-background/95 backdrop-blur`

2. **検索ページサイドバー** (app/search/advanced/page.tsx)
   - `sticky top-4`
   - Card内でフィルター固定

### 絶対位置指定要素
1. **上部ページング** (app/page.tsx:229)
   - `absolute left-1/2 transform -translate-x-1/2`
   - 親要素のrelative内で中央配置

2. **検索アイコン** (各検索ボックス)
   - `absolute left-3 top-1/2 -translate-y-1/2`
   - Input内のアイコン配置

## スクロール制御

### オーバーフロー設定
- **メインコンテナ**: `overflow-hidden` - スクロール禁止
- **サイドバー**: スクロールなし（固定高さ）
- **メインコンテンツ**: `overflow-y-auto` - 垂直スクロール可能
- **タグ表示**: `overflow-x-auto scrollbar-hide` - 水平スクロール

## レスポンシブブレークポイント

### Tailwindブレークポイント
- `sm:` 640px以上
- `md:` 768px以上  
- `lg:` 1024px以上
- `xl:` 1280px以上

### レスポンシブ要素
- **サイドバー**: `hidden lg:block` - デスクトップのみ表示
- **上部ページング**: `hidden lg:block` - デスクトップのみ
- **モバイルフィルター**: `lg:hidden` - モバイルのみ
- **パディング**: `px-2 sm:px-4` - モバイルで狭く

## z-index階層

### z-index値
- `z-50`: ヘッダー、ダイアログ、シート
- `z-10`: ソートバー、チャートツールチップ
- `z-[100]`: トースト通知

## カラーシステム

### テーマカラー
- `bg-background`: 背景色（自動切り替え）
- `bg-white dark:bg-gray-900`: 明示的な背景色指定
- `text-gray-700 dark:text-gray-300`: テキスト色
- `border-gray-200 dark:border-gray-700`: ボーダー色

### 半透明・ブラー効果
- `bg-background/95`: 95%不透明度
- `backdrop-blur`: ブラー効果
- `supports-[backdrop-filter]:bg-background/60`: ブラー対応時60%

## 問題点と改善案

### 現在の問題
1. **ソートバーの固定化失敗**
   - relative内でのレイアウト
   - 上部ページングとの位置関係の複雑さ

2. **複雑な入れ子構造**
   - 多層のdivによるレイアウト
   - flexとabsoluteの混在

### 改善提案
1. **ソートバーの構造見直し**
   - ソート機能のみ独立させる
   - ページングとの分離

2. **グリッドレイアウトの活用**
   - flexの代わりにgridで整理
   - より予測可能なレイアウト

3. **コンポーネント分割**
   - ソートバーを独立コンポーネント化
   - 責任の明確化