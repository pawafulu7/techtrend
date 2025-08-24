import { openDB, DBSchema, IDBPDatabase } from 'idb';

// データベーススキーマ定義
interface AnalyticsDBSchema extends DBSchema {
  readingEvents: {
    key: string;
    value: ReadingEvent;
    indexes: { 
      'by-article': string;
      'by-date': Date;
    };
  };
  readingStats: {
    key: string; // date (YYYY-MM-DD)
    value: ReadingStats;
  };
  readingGoals: {
    key: string;
    value: ReadingGoal;
  };
}

export interface ReadingEvent {
  id: string;
  articleId: string;
  articleTitle: string;
  tags: string[];
  source: string;
  difficulty?: string;
  timestamp: Date;
  duration: number; // 秒
  completed: boolean;
  device: 'desktop' | 'mobile' | 'tablet';
  scrollDepth: number; // 0-100
}

export interface ReadingStats {
  date: string; // YYYY-MM-DD
  totalArticles: number;
  totalTime: number; // 分
  completedArticles: number;
  tagDistribution: Record<string, number>;
  sourceDistribution: Record<string, number>;
  difficultyDistribution: Record<string, number>;
  hourlyDistribution: number[]; // 24時間分
}

export interface ReadingGoal {
  id: string;
  type: 'daily' | 'weekly' | 'monthly';
  target: number; // 記事数
  createdAt: Date;
  updatedAt: Date;
}

class AnalyticsTracker {
  private db: IDBPDatabase<AnalyticsDBSchema> | null = null;
  private currentSession: Map<string, SessionData> = new Map();
  private isEnabled: boolean = false;

  constructor() {
    this.checkEnabled();
  }

  private async checkEnabled() {
    // Check if running in browser environment
    if (typeof window === 'undefined' || typeof localStorage === 'undefined') {
      this.isEnabled = false;
      return;
    }
    
    const enabled = localStorage.getItem('analytics-enabled');
    this.isEnabled = enabled === 'true';
    if (this.isEnabled) {
      await this.initDB();
    }
  }

  private async initDB() {
    if (this.db) return;

    this.db = await openDB<AnalyticsDBSchema>('techtrend-analytics', 1, {
      upgrade(db) {
        // 読書イベントストア
        const eventStore = db.createObjectStore('readingEvents', {
          keyPath: 'id'
        });
        eventStore.createIndex('by-article', 'articleId');
        eventStore.createIndex('by-date', 'timestamp');

        // 統計ストア
        db.createObjectStore('readingStats', {
          keyPath: 'date'
        });

        // 目標ストア
        db.createObjectStore('readingGoals', {
          keyPath: 'id'
        });
      }
    });
  }

  async enable() {
    localStorage.setItem('analytics-enabled', 'true');
    this.isEnabled = true;
    await this.initDB();
  }

  async disable() {
    localStorage.setItem('analytics-enabled', 'false');
    this.isEnabled = false;
    this.currentSession.clear();
  }

  // 記事閲覧開始
  startReading(articleId: string, articleData: {
    title: string;
    tags: string[];
    source: string;
    difficulty?: string;
  }) {
    if (!this.isEnabled) return;

    const sessionData: SessionData = {
      articleId,
      articleData,
      startTime: Date.now(),
      scrollEvents: [],
      maxScrollDepth: 0,
      isActive: true,
      lastActiveTime: Date.now()
    };

    this.currentSession.set(articleId, sessionData);
    this.startScrollTracking(articleId);
  }

  // 記事閲覧終了
  async endReading(articleId: string, completed: boolean = false) {
    if (!this.isEnabled || !this.db) return;

    const session = this.currentSession.get(articleId);
    if (!session) return;

    const duration = Math.round((Date.now() - session.startTime) / 1000);
    const device = this.detectDevice();

    const event: ReadingEvent = {
      id: `${articleId}-${Date.now()}`,
      articleId,
      articleTitle: session.articleData.title,
      tags: session.articleData.tags,
      source: session.articleData.source,
      difficulty: session.articleData.difficulty,
      timestamp: new Date(),
      duration,
      completed: completed || session.maxScrollDepth > 80,
      device,
      scrollDepth: session.maxScrollDepth
    };

    try {
      await this.db.add('readingEvents', event);
      await this.updateDailyStats(event);
      this.currentSession.delete(articleId);
    } catch (error) {
    }
  }

  // スクロール追跡
  private startScrollTracking(articleId: string) {
    const handleScroll = () => {
      const session = this.currentSession.get(articleId);
      if (!session || !session.isActive) return;

      const scrollPercentage = this.calculateScrollPercentage();
      session.maxScrollDepth = Math.max(session.maxScrollDepth, scrollPercentage);
      session.lastActiveTime = Date.now();
      
      session.scrollEvents.push({
        timestamp: Date.now(),
        scrollDepth: scrollPercentage
      });
    };

    // スクロールイベントをthrottleで制限
    let throttleTimer: NodeJS.Timeout | null = null;
    const throttledScroll = () => {
      if (throttleTimer) return;
      
      throttleTimer = setTimeout(() => {
        handleScroll();
        throttleTimer = null;
      }, 100);
    };

    window.addEventListener('scroll', throttledScroll);

    // クリーンアップ関数を保存
    const session = this.currentSession.get(articleId);
    if (session) {
      session.cleanup = () => {
        window.removeEventListener('scroll', throttledScroll);
      };
    }
  }

  // スクロール割合計算
  private calculateScrollPercentage(): number {
    const windowHeight = window.innerHeight;
    const documentHeight = document.documentElement.scrollHeight;
    const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
    
    const scrollableHeight = documentHeight - windowHeight;
    if (scrollableHeight <= 0) return 100;
    
    return Math.min(100, Math.round((scrollTop / scrollableHeight) * 100));
  }

  // デバイス検出
  private detectDevice(): 'desktop' | 'mobile' | 'tablet' {
    const width = window.innerWidth;
    if (width < 768) return 'mobile';
    if (width < 1024) return 'tablet';
    return 'desktop';
  }

  // 日次統計更新
  private async updateDailyStats(event: ReadingEvent) {
    if (!this.db) return;

    const today = new Date().toISOString().split('T')[0];
    let stats = await this.db.get('readingStats', today);

    if (!stats) {
      stats = {
        date: today,
        totalArticles: 0,
        totalTime: 0,
        completedArticles: 0,
        tagDistribution: {},
        sourceDistribution: {},
        difficultyDistribution: {},
        hourlyDistribution: new Array(24).fill(0)
      };
    }

    // 統計を更新
    stats.totalArticles++;
    stats.totalTime += Math.round(event.duration / 60);
    if (event.completed) stats.completedArticles++;

    // タグ分布
    event.tags.forEach(tag => {
      stats.tagDistribution[tag] = (stats.tagDistribution[tag] || 0) + 1;
    });

    // ソース分布
    stats.sourceDistribution[event.source] = 
      (stats.sourceDistribution[event.source] || 0) + 1;

    // 難易度分布
    if (event.difficulty) {
      stats.difficultyDistribution[event.difficulty] = 
        (stats.difficultyDistribution[event.difficulty] || 0) + 1;
    }

    // 時間帯分布
    const hour = new Date(event.timestamp).getHours();
    stats.hourlyDistribution[hour]++;

    await this.db.put('readingStats', stats);
  }

  // 統計取得
  async getStats(dateRange: { from: Date; to: Date }) {
    if (!this.db) return null;

    const stats: ReadingStats[] = [];
    const fromStr = dateRange.from.toISOString().split('T')[0];
    const toStr = dateRange.to.toISOString().split('T')[0];

    const tx = this.db.transaction('readingStats', 'readonly');
    const store = tx.objectStore('readingStats');
    
    let cursor = await store.openCursor();
    while (cursor) {
      if (cursor.key >= fromStr && cursor.key <= toStr) {
        stats.push(cursor.value);
      }
      cursor = await cursor.continue();
    }

    return stats;
  }

  // 読書目標管理
  async setGoal(goal: Omit<ReadingGoal, 'id' | 'createdAt' | 'updatedAt'>) {
    if (!this.db) return;

    const newGoal: ReadingGoal = {
      ...goal,
      id: `goal-${Date.now()}`,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    await this.db.add('readingGoals', newGoal);
    return newGoal;
  }

  async getActiveGoals() {
    if (!this.db) return [];

    const goals = await this.db.getAll('readingGoals');
    return goals.filter(goal => {
      // アクティブな目標のみ返す
      const now = new Date();
      const created = new Date(goal.createdAt);
      
      switch (goal.type) {
        case 'daily':
          return created.toDateString() === now.toDateString();
        case 'weekly':
          // 同じ週かチェック
          const weekStart = new Date(now);
          weekStart.setDate(now.getDate() - now.getDay());
          return created >= weekStart;
        case 'monthly':
          return created.getMonth() === now.getMonth() && 
                 created.getFullYear() === now.getFullYear();
      }
    });
  }

  // データエクスポート
  async exportData() {
    if (!this.db) return null;

    const [events, stats, goals] = await Promise.all([
      this.db.getAll('readingEvents'),
      this.db.getAll('readingStats'),
      this.db.getAll('readingGoals')
    ]);

    return {
      events,
      stats,
      goals,
      exportedAt: new Date().toISOString()
    };
  }

  // データクリア
  async clearAllData() {
    if (!this.db) return;

    const tx = this.db.transaction(
      ['readingEvents', 'readingStats', 'readingGoals'],
      'readwrite'
    );

    await Promise.all([
      tx.objectStore('readingEvents').clear(),
      tx.objectStore('readingStats').clear(),
      tx.objectStore('readingGoals').clear()
    ]);

    await tx.done;
  }
}

// セッションデータの型定義
interface SessionData {
  articleId: string;
  articleData: {
    title: string;
    tags: string[];
    source: string;
    difficulty?: string;
  };
  startTime: number;
  scrollEvents: Array<{
    timestamp: number;
    scrollDepth: number;
  }>;
  maxScrollDepth: number;
  isActive: boolean;
  lastActiveTime: number;
  cleanup?: () => void;
}

// シングルトンインスタンス
export const analyticsTracker = new AnalyticsTracker();