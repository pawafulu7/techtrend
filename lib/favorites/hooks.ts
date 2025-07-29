'use client';

import { useState, useEffect, useCallback } from 'react';

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

const STORAGE_KEY_SOURCES = 'techtrend-favorite-sources';
const STORAGE_KEY_FOLDERS = 'techtrend-favorite-folders';

export function useFavoriteSources() {
  const [favorites, setFavorites] = useState<FavoriteSource[]>([]);
  const [folders, setFolders] = useState<FavoriteFolder[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // ローカルストレージから読み込み
  useEffect(() => {
    const loadFavorites = () => {
      try {
        const storedFavorites = localStorage.getItem(STORAGE_KEY_SOURCES);
        const storedFolders = localStorage.getItem(STORAGE_KEY_FOLDERS);
        
        if (storedFavorites) {
          const parsed = JSON.parse(storedFavorites);
          setFavorites(parsed.map((f: any) => ({
            ...f,
            addedAt: new Date(f.addedAt)
          })));
        }
        
        if (storedFolders) {
          const parsed = JSON.parse(storedFolders);
          setFolders(parsed.map((f: any) => ({
            ...f,
            createdAt: new Date(f.createdAt)
          })));
        }
      } catch (error) {
        console.error('Failed to load favorites:', error);
      } finally {
        setIsLoading(false);
      }
    };

    loadFavorites();
  }, []);

  // ローカルストレージに保存
  const saveFavorites = useCallback((newFavorites: FavoriteSource[]) => {
    try {
      localStorage.setItem(STORAGE_KEY_SOURCES, JSON.stringify(newFavorites));
      setFavorites(newFavorites);
    } catch (error) {
      console.error('Failed to save favorites:', error);
    }
  }, []);

  const saveFolders = useCallback((newFolders: FavoriteFolder[]) => {
    try {
      localStorage.setItem(STORAGE_KEY_FOLDERS, JSON.stringify(newFolders));
      setFolders(newFolders);
    } catch (error) {
      console.error('Failed to save folders:', error);
    }
  }, []);

  // お気に入り追加
  const addFavorite = useCallback((sourceId: string, folder?: string) => {
    const newFavorite: FavoriteSource = {
      id: `fav-${Date.now()}`,
      sourceId,
      addedAt: new Date(),
      folder,
      notifications: {
        enabled: false,
        frequency: 'daily'
      },
      order: favorites.length
    };

    const newFavorites = [...favorites, newFavorite];
    saveFavorites(newFavorites);
  }, [favorites, saveFavorites]);

  // お気に入り削除
  const removeFavorite = useCallback((sourceId: string) => {
    const newFavorites = favorites.filter(f => f.sourceId !== sourceId);
    saveFavorites(newFavorites);
  }, [favorites, saveFavorites]);

  // お気に入り切り替え
  const toggleFavorite = useCallback((sourceId: string, folder?: string) => {
    const isFav = favorites.some(f => f.sourceId === sourceId);
    if (isFav) {
      removeFavorite(sourceId);
    } else {
      addFavorite(sourceId, folder);
    }
  }, [favorites, addFavorite, removeFavorite]);

  // お気に入り判定
  const isFavorite = useCallback((sourceId: string) => {
    return favorites.some(f => f.sourceId === sourceId);
  }, [favorites]);

  // お気に入りをフォルダーに移動
  const moveFavorite = useCallback((sourceId: string, folderId?: string) => {
    const newFavorites = favorites.map(f => 
      f.sourceId === sourceId 
        ? { ...f, folder: folderId }
        : f
    );
    saveFavorites(newFavorites);
  }, [favorites, saveFavorites]);

  // 通知設定更新
  const updateNotifications = useCallback((
    sourceId: string,
    notifications: FavoriteSource['notifications']
  ) => {
    const newFavorites = favorites.map(f => 
      f.sourceId === sourceId 
        ? { ...f, notifications }
        : f
    );
    saveFavorites(newFavorites);
  }, [favorites, saveFavorites]);

  // 並び順更新
  const reorderFavorites = useCallback((sourceIds: string[]) => {
    const newFavorites = sourceIds.map((id, index) => {
      const favorite = favorites.find(f => f.sourceId === id);
      return favorite ? { ...favorite, order: index } : null;
    }).filter(Boolean) as FavoriteSource[];
    
    saveFavorites(newFavorites);
  }, [favorites, saveFavorites]);

  // フォルダー作成
  const createFolder = useCallback((name: string, color: string = '#3B82F6') => {
    const newFolder: FavoriteFolder = {
      id: `folder-${Date.now()}`,
      name,
      color,
      createdAt: new Date(),
      order: folders.length
    };

    const newFolders = [...folders, newFolder];
    saveFolders(newFolders);
    return newFolder;
  }, [folders, saveFolders]);

  // フォルダー更新
  const updateFolder = useCallback((folderId: string, updates: Partial<FavoriteFolder>) => {
    const newFolders = folders.map(f => 
      f.id === folderId 
        ? { ...f, ...updates }
        : f
    );
    saveFolders(newFolders);
  }, [folders, saveFolders]);

  // フォルダー削除
  const deleteFolder = useCallback((folderId: string) => {
    // フォルダー内のお気に入りをフォルダーから外す
    const newFavorites = favorites.map(f => 
      f.folder === folderId 
        ? { ...f, folder: undefined }
        : f
    );
    saveFavorites(newFavorites);

    // フォルダーを削除
    const newFolders = folders.filter(f => f.id !== folderId);
    saveFolders(newFolders);
  }, [favorites, folders, saveFavorites, saveFolders]);

  // フォルダー別にお気に入りを取得
  const getFavoritesByFolder = useCallback((folderId?: string) => {
    return favorites.filter(f => f.folder === folderId);
  }, [favorites]);

  // データのエクスポート
  const exportData = useCallback(() => {
    const data = {
      favorites,
      folders,
      exportedAt: new Date().toISOString()
    };
    return JSON.stringify(data, null, 2);
  }, [favorites, folders]);

  // データのインポート
  const importData = useCallback((jsonData: string) => {
    try {
      const data = JSON.parse(jsonData);
      
      if (data.favorites) {
        const importedFavorites = data.favorites.map((f: any) => ({
          ...f,
          addedAt: new Date(f.addedAt)
        }));
        saveFavorites(importedFavorites);
      }
      
      if (data.folders) {
        const importedFolders = data.folders.map((f: any) => ({
          ...f,
          createdAt: new Date(f.createdAt)
        }));
        saveFolders(importedFolders);
      }
      
      return true;
    } catch (error) {
      console.error('Failed to import data:', error);
      return false;
    }
  }, [saveFavorites, saveFolders]);

  return {
    favorites: favorites.sort((a, b) => a.order - b.order),
    folders: folders.sort((a, b) => a.order - b.order),
    isLoading,
    addFavorite,
    removeFavorite,
    toggleFavorite,
    isFavorite,
    moveFavorite,
    updateNotifications,
    reorderFavorites,
    createFolder,
    updateFolder,
    deleteFolder,
    getFavoritesByFolder,
    exportData,
    importData
  };
}