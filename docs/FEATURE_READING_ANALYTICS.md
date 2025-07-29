# 個人の読書傾向分析機能 - 詳細設計書

作成日: 2025-01-29

## 1. 機能概要

### 目的
ユーザーの読書履歴を分析し、個人の技術的関心事や学習パターンを可視化する。

### 主な機能
- 読書統計ダッシュボード
- タグ別読書傾向の可視化
- ソース別読書分布
- 時間帯別読書パターン
- 難易度別学習進捗
- 週次・月次レポート生成
- 興味の変遷グラフ
- 読書目標設定と進捗追跡

## 2. 技術設計

### 2.1 データ収集戦略

#### 収集するデータ
1. **読書イベント**
   - 記事ID
   - 読書開始時刻
   - 読書時間（推定）
   - 完読フラグ
   - デバイス種別

2. **エンゲージメント**
   - 記事への投票
   - 読書リストへの追加
   - 関連記事のクリック

3. **検索履歴**
   - 検索キーワード
   - 選択したフィルター
   - 検索結果のクリック

### 2.2 ストレージ設計

#### IndexedDBスキーマ
```typescript
interface ReadingEvent {
  id: string;
  articleId: string;
  timestamp: Date;
  duration: number; // 秒
  completed: boolean;
  device: 'desktop' | 'mobile' | 'tablet';
}

interface ReadingStats {
  date: string; // YYYY-MM-DD
  totalArticles: number;
  totalTime: number; // 分
  tagDistribution: Record<string, number>;
  sourceDistribution: Record<string, number>;
  difficultyDistribution: Record<string, number>;
  hourlyDistribution: number[]; // 24時間分
}

interface ReadingGoal {
  id: string;
  type: 'daily' | 'weekly' | 'monthly';
  target: number; // 記事数
  createdAt: Date;
  updatedAt: Date;
}
```

### 2.3 分析アルゴリズム

#### 1. 読書時間の推定
```typescript
// スクロール位置と滞在時間から読書時間を推定
const estimateReadingTime = (
  scrollEvents: ScrollEvent[],
  articleLength: number
) => {
  // 実装詳細
};
```

#### 2. 興味スコアの計算
```typescript
// タグごとの興味スコアを計算
const calculateInterestScore = (
  tag: string,
  readingEvents: ReadingEvent[]
) => {
  // 最近の読書ほど重み付けを高く
  // 完読した記事は高スコア
  // 投票した記事はさらに高スコア
};
```

### 2.4 UI/UX設計

#### ダッシュボードレイアウト
1. **サマリーカード**
   - 今月の読書数
   - 総読書時間
   - 最も読んだタグ
   - 読書目標達成率

2. **グラフ・チャート**
   - タグクラウド（興味分野）
   - 時系列グラフ（読書量推移）
   - 円グラフ（ソース分布）
   - ヒートマップ（時間帯別活動）

3. **インサイト**
   - AIによる読書傾向の要約
   - おすすめの学習パス
   - 読書習慣の改善提案

## 3. 実装計画

### Phase 1: データ収集基盤
1. 読書イベントトラッキング実装
2. IndexedDBへのデータ保存
3. データ集計バッチ処理

### Phase 2: 基本的な可視化
1. 統計ダッシュボードページ
2. 基本的なグラフ実装
3. 日次・週次サマリー

### Phase 3: 高度な分析
1. 興味の変遷分析
2. 読書目標機能
3. パーソナライズされたインサイト

## 4. プライバシー考慮事項

### データの取り扱い
- すべてのデータはローカルに保存
- サーバーへの送信なし
- データのエクスポート機能
- データの完全削除機能

### オプトイン/オプトアウト
- デフォルトでオフ
- 明示的な同意後に有効化
- いつでも無効化可能

## 5. パフォーマンス考慮事項

### データ集計の最適化
- Web Workerでバックグラウンド処理
- インクリメンタルな集計
- 古いデータの自動アーカイブ

### 描画の最適化
- 仮想スクロール
- グラフの遅延レンダリング
- RequestAnimationFrameの活用

## 6. 実装チェックリスト

### データ収集
- [ ] 読書イベントトラッキング
- [ ] スクロール位置の記録
- [ ] 読書時間の推定アルゴリズム
- [ ] IndexedDBスキーマ実装

### 分析エンジン
- [ ] データ集計処理
- [ ] 興味スコア計算
- [ ] トレンド分析
- [ ] Web Worker実装

### UI実装
- [ ] ダッシュボードページ
- [ ] グラフコンポーネント（Chart.js/Recharts）
- [ ] 統計カード
- [ ] フィルター機能
- [ ] エクスポート機能

### 設定・プライバシー
- [ ] 設定ページ
- [ ] データ管理UI
- [ ] プライバシー同意フロー

## 7. 技術スタック

### フロントエンド
- React (既存)
- Recharts or Chart.js (グラフ描画)
- date-fns (日付処理)
- Web Workers API

### データストレージ
- IndexedDB (Dexie.js)
- LocalStorage (設定保存)

### 分析
- カスタムアルゴリズム
- 統計計算ライブラリ（必要に応じて）