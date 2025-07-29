'use client';

import { useState, useEffect, useCallback } from 'react';
import { readingListDB, ReadingListItem, ReadingListFolder, ReadingStats } from './db';
import type { ArticleWithRelations } from '@/lib/types/article';

// 記事が読書リストにあるかチェック
export function useIsInReadingList(articleId: string) {
  const [isInList, setIsInList] = useState(false);
  const [loading, setLoading] = useState(true);

  const checkStatus = useCallback(async () => {
    try {
      const item = await readingListDB.getReadingListItem(articleId);
      setIsInList(!!item);
    } catch (error) {
      console.error('Failed to check reading list status:', error);
    } finally {
      setLoading(false);
    }
  }, [articleId]);

  useEffect(() => {
    checkStatus();
  }, [checkStatus]);

  return { isInList, loading, refetch: checkStatus };
}

// 読書リストの追加/削除
export function useReadingListActions() {
  const [loading, setLoading] = useState(false);

  const addToReadingList = useCallback(async (article: ArticleWithRelations, folder?: string) => {
    setLoading(true);
    try {
      await readingListDB.addToReadingList({
        id: article.id,
        title: article.title,
        summary: article.summary || undefined,
        url: article.url,
        source: article.source.name,
        publishedAt: new Date(article.publishedAt)
      }, folder);
    } catch (error) {
      console.error('Failed to add to reading list:', error);
      throw error;
    } finally {
      setLoading(false);
    }
  }, []);

  const removeFromReadingList = useCallback(async (articleId: string) => {
    setLoading(true);
    try {
      await readingListDB.removeFromReadingList(articleId);
    } catch (error) {
      console.error('Failed to remove from reading list:', error);
      throw error;
    } finally {
      setLoading(false);
    }
  }, []);

  const updateStatus = useCallback(async (articleId: string, status: ReadingListItem['status']) => {
    setLoading(true);
    try {
      await readingListDB.updateReadingStatus(articleId, status);
    } catch (error) {
      console.error('Failed to update status:', error);
      throw error;
    } finally {
      setLoading(false);
    }
  }, []);

  const updateProgress = useCallback(async (articleId: string, progress: number) => {
    setLoading(true);
    try {
      await readingListDB.updateProgress(articleId, progress);
    } catch (error) {
      console.error('Failed to update progress:', error);
      throw error;
    } finally {
      setLoading(false);
    }
  }, []);

  const updateNotes = useCallback(async (articleId: string, notes: string) => {
    setLoading(true);
    try {
      await readingListDB.updateNotes(articleId, notes);
    } catch (error) {
      console.error('Failed to update notes:', error);
      throw error;
    } finally {
      setLoading(false);
    }
  }, []);

  const moveToFolder = useCallback(async (articleId: string, folderId: string | null) => {
    setLoading(true);
    try {
      await readingListDB.moveToFolder(articleId, folderId);
    } catch (error) {
      console.error('Failed to move to folder:', error);
      throw error;
    } finally {
      setLoading(false);
    }
  }, []);

  return {
    loading,
    addToReadingList,
    removeFromReadingList,
    updateStatus,
    updateProgress,
    updateNotes,
    moveToFolder
  };
}

// 読書リストの取得
export function useReadingList(filter?: {
  status?: ReadingListItem['status'];
  folder?: string;
}) {
  const [items, setItems] = useState<ReadingListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchItems = useCallback(async () => {
    try {
      setLoading(true);
      const result = await readingListDB.getReadingList(filter);
      setItems(result);
      setError(null);
    } catch (err) {
      setError(err as Error);
      console.error('Failed to fetch reading list:', err);
    } finally {
      setLoading(false);
    }
  }, [filter?.status, filter?.folder]);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  return { items, loading, error, refetch: fetchItems };
}

// フォルダの管理
export function useReadingListFolders() {
  const [folders, setFolders] = useState<ReadingListFolder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchFolders = useCallback(async () => {
    try {
      setLoading(true);
      const result = await readingListDB.getFolders();
      setFolders(result);
      setError(null);
    } catch (err) {
      setError(err as Error);
      console.error('Failed to fetch folders:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  const createFolder = useCallback(async (name: string, options?: {
    color?: string;
    icon?: string;
  }) => {
    try {
      await readingListDB.createFolder(name, options);
      await fetchFolders();
    } catch (error) {
      console.error('Failed to create folder:', error);
      throw error;
    }
  }, [fetchFolders]);

  useEffect(() => {
    fetchFolders();
  }, [fetchFolders]);

  return { folders, loading, error, createFolder, refetch: fetchFolders };
}

// 読書統計
export function useReadingStats() {
  const [stats, setStats] = useState<ReadingStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchStats = useCallback(async () => {
    try {
      setLoading(true);
      const result = await readingListDB.getReadingStats();
      setStats(result);
      setError(null);
    } catch (err) {
      setError(err as Error);
      console.error('Failed to fetch reading stats:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  return { stats, loading, error, refetch: fetchStats };
}

// 単一の読書リストアイテム
export function useReadingListItem(articleId: string) {
  const [item, setItem] = useState<ReadingListItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchItem = useCallback(async () => {
    try {
      setLoading(true);
      const result = await readingListDB.getReadingListItem(articleId);
      setItem(result);
      setError(null);
    } catch (err) {
      setError(err as Error);
      console.error('Failed to fetch reading list item:', err);
    } finally {
      setLoading(false);
    }
  }, [articleId]);

  useEffect(() => {
    fetchItem();
  }, [fetchItem]);

  return { item, loading, error, refetch: fetchItem };
}