import { v4 as uuidv4 } from 'uuid';

export interface ReadingListItem {
  id: string;
  articleId: string;
  title: string;
  summary?: string;
  url: string;
  source: string;
  publishedAt: Date;
  addedAt: Date;
  status: 'unread' | 'reading' | 'completed';
  folder?: string;
  tags?: string[];
  notes?: string;
  progress?: number;
  completedAt?: Date;
  lastAccessedAt?: Date;
}

export interface ReadingListFolder {
  id: string;
  name: string;
  color?: string;
  icon?: string;
  createdAt: Date;
}

export interface ReadingStats {
  totalItems: number;
  unreadItems: number;
  readingItems: number;
  completedItems: number;
  totalReadingTime: number;
  averageReadingTime: number;
  completedThisWeek: number;
  completedThisMonth: number;
}

const DB_NAME = 'techtrend-reading-list';
const DB_VERSION = 1;

const STORES = {
  items: 'reading-list-items',
  folders: 'reading-list-folders',
  stats: 'reading-stats'
} as const;

class ReadingListDB {
  private db: IDBDatabase | null = null;

  async init(): Promise<void> {
    if (this.db) return;

    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        this.db = request.result;
        resolve();
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;

        // 読書リストアイテムストア
        if (!db.objectStoreNames.contains(STORES.items)) {
          const itemStore = db.createObjectStore(STORES.items, { keyPath: 'id' });
          itemStore.createIndex('articleId', 'articleId', { unique: true });
          itemStore.createIndex('status', 'status');
          itemStore.createIndex('folder', 'folder');
          itemStore.createIndex('addedAt', 'addedAt');
        }

        // フォルダストア
        if (!db.objectStoreNames.contains(STORES.folders)) {
          const folderStore = db.createObjectStore(STORES.folders, { keyPath: 'id' });
          folderStore.createIndex('name', 'name', { unique: true });
        }

        // 統計ストア
        if (!db.objectStoreNames.contains(STORES.stats)) {
          db.createObjectStore(STORES.stats, { keyPath: 'id' });
        }
      };
    });
  }

  private async getDB(): Promise<IDBDatabase> {
    if (!this.db) {
      await this.init();
    }
    return this.db!;
  }

  // 読書リストに追加
  async addToReadingList(article: {
    id: string;
    title: string;
    summary?: string;
    url: string;
    source: string;
    publishedAt: Date;
  }, folder?: string): Promise<void> {
    const db = await this.getDB();
    const transaction = db.transaction([STORES.items], 'readwrite');
    const store = transaction.objectStore(STORES.items);

    const item: ReadingListItem = {
      id: uuidv4(),
      articleId: article.id,
      title: article.title,
      summary: article.summary,
      url: article.url,
      source: article.source,
      publishedAt: article.publishedAt,
      addedAt: new Date(),
      status: 'unread',
      folder,
      progress: 0
    };

    return new Promise((resolve, reject) => {
      const request = store.add(item);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  // 読書リストから削除
  async removeFromReadingList(articleId: string): Promise<void> {
    const db = await this.getDB();
    const transaction = db.transaction([STORES.items], 'readwrite');
    const store = transaction.objectStore(STORES.items);
    const index = store.index('articleId');

    return new Promise((resolve, reject) => {
      const getRequest = index.get(articleId);
      getRequest.onsuccess = () => {
        const item = getRequest.result;
        if (item) {
          const deleteRequest = store.delete(item.id);
          deleteRequest.onsuccess = () => resolve();
          deleteRequest.onerror = () => reject(deleteRequest.error);
        } else {
          resolve();
        }
      };
      getRequest.onerror = () => reject(getRequest.error);
    });
  }

  // 読書ステータスを更新
  async updateReadingStatus(
    articleId: string,
    status: ReadingListItem['status']
  ): Promise<void> {
    const db = await this.getDB();
    const transaction = db.transaction([STORES.items], 'readwrite');
    const store = transaction.objectStore(STORES.items);
    const index = store.index('articleId');

    return new Promise((resolve, reject) => {
      const getRequest = index.get(articleId);
      getRequest.onsuccess = () => {
        const item = getRequest.result;
        if (item) {
          item.status = status;
          item.lastAccessedAt = new Date();
          if (status === 'completed') {
            item.completedAt = new Date();
            item.progress = 100;
          }
          const updateRequest = store.put(item);
          updateRequest.onsuccess = () => resolve();
          updateRequest.onerror = () => reject(updateRequest.error);
        } else {
          reject(new Error('Item not found'));
        }
      };
      getRequest.onerror = () => reject(getRequest.error);
    });
  }

  // 読書進捗を更新
  async updateProgress(articleId: string, progress: number): Promise<void> {
    const db = await this.getDB();
    const transaction = db.transaction([STORES.items], 'readwrite');
    const store = transaction.objectStore(STORES.items);
    const index = store.index('articleId');

    return new Promise((resolve, reject) => {
      const getRequest = index.get(articleId);
      getRequest.onsuccess = () => {
        const item = getRequest.result;
        if (item) {
          item.progress = Math.min(100, Math.max(0, progress));
          item.lastAccessedAt = new Date();
          if (item.progress > 0 && item.status === 'unread') {
            item.status = 'reading';
          }
          const updateRequest = store.put(item);
          updateRequest.onsuccess = () => resolve();
          updateRequest.onerror = () => reject(updateRequest.error);
        } else {
          reject(new Error('Item not found'));
        }
      };
      getRequest.onerror = () => reject(getRequest.error);
    });
  }

  // 読書リストアイテムを取得
  async getReadingListItem(articleId: string): Promise<ReadingListItem | null> {
    const db = await this.getDB();
    const transaction = db.transaction([STORES.items], 'readonly');
    const store = transaction.objectStore(STORES.items);
    const index = store.index('articleId');

    return new Promise((resolve, reject) => {
      const request = index.get(articleId);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
  }

  // 読書リストを取得
  async getReadingList(filter?: {
    status?: ReadingListItem['status'];
    folder?: string;
  }): Promise<ReadingListItem[]> {
    const db = await this.getDB();
    const transaction = db.transaction([STORES.items], 'readonly');
    const store = transaction.objectStore(STORES.items);

    return new Promise((resolve, reject) => {
      const request = store.getAll();
      request.onsuccess = () => {
        let items = request.result as ReadingListItem[];
        
        if (filter?.status) {
          items = items.filter(item => item.status === filter.status);
        }
        if (filter?.folder) {
          items = items.filter(item => item.folder === filter.folder);
        }

        // 追加日時の降順でソート
        items.sort((a, b) => b.addedAt.getTime() - a.addedAt.getTime());
        
        resolve(items);
      };
      request.onerror = () => reject(request.error);
    });
  }

  // フォルダを作成
  async createFolder(name: string, options?: {
    color?: string;
    icon?: string;
  }): Promise<void> {
    const db = await this.getDB();
    const transaction = db.transaction([STORES.folders], 'readwrite');
    const store = transaction.objectStore(STORES.folders);

    const folder: ReadingListFolder = {
      id: uuidv4(),
      name,
      color: options?.color,
      icon: options?.icon,
      createdAt: new Date()
    };

    return new Promise((resolve, reject) => {
      const request = store.add(folder);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  // フォルダ一覧を取得
  async getFolders(): Promise<ReadingListFolder[]> {
    const db = await this.getDB();
    const transaction = db.transaction([STORES.folders], 'readonly');
    const store = transaction.objectStore(STORES.folders);

    return new Promise((resolve, reject) => {
      const request = store.getAll();
      request.onsuccess = () => {
        const folders = request.result as ReadingListFolder[];
        folders.sort((a, b) => a.name.localeCompare(b.name));
        resolve(folders);
      };
      request.onerror = () => reject(request.error);
    });
  }

  // 読書統計を取得
  async getReadingStats(): Promise<ReadingStats> {
    const items = await this.getReadingList();
    const now = new Date();
    const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const oneMonthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const stats: ReadingStats = {
      totalItems: items.length,
      unreadItems: items.filter(item => item.status === 'unread').length,
      readingItems: items.filter(item => item.status === 'reading').length,
      completedItems: items.filter(item => item.status === 'completed').length,
      totalReadingTime: 0,
      averageReadingTime: 0,
      completedThisWeek: items.filter(item => 
        item.completedAt && item.completedAt >= oneWeekAgo
      ).length,
      completedThisMonth: items.filter(item => 
        item.completedAt && item.completedAt >= oneMonthAgo
      ).length
    };

    return stats;
  }

  // メモを更新
  async updateNotes(articleId: string, notes: string): Promise<void> {
    const db = await this.getDB();
    const transaction = db.transaction([STORES.items], 'readwrite');
    const store = transaction.objectStore(STORES.items);
    const index = store.index('articleId');

    return new Promise((resolve, reject) => {
      const getRequest = index.get(articleId);
      getRequest.onsuccess = () => {
        const item = getRequest.result;
        if (item) {
          item.notes = notes;
          item.lastAccessedAt = new Date();
          const updateRequest = store.put(item);
          updateRequest.onsuccess = () => resolve();
          updateRequest.onerror = () => reject(updateRequest.error);
        } else {
          reject(new Error('Item not found'));
        }
      };
      getRequest.onerror = () => reject(getRequest.error);
    });
  }

  // アイテムをフォルダに移動
  async moveToFolder(articleId: string, folderId: string | null): Promise<void> {
    const db = await this.getDB();
    const transaction = db.transaction([STORES.items], 'readwrite');
    const store = transaction.objectStore(STORES.items);
    const index = store.index('articleId');

    return new Promise((resolve, reject) => {
      const getRequest = index.get(articleId);
      getRequest.onsuccess = () => {
        const item = getRequest.result;
        if (item) {
          item.folder = folderId || undefined;
          const updateRequest = store.put(item);
          updateRequest.onsuccess = () => resolve();
          updateRequest.onerror = () => reject(updateRequest.error);
        } else {
          reject(new Error('Item not found'));
        }
      };
      getRequest.onerror = () => reject(getRequest.error);
    });
  }
}

// シングルトンインスタンス
export const readingListDB = new ReadingListDB();