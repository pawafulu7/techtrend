'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  Star, Folder, Plus, Download, Upload, Settings,
  Bell, Clock, Trash2, Edit2, Move, Newspaper
} from 'lucide-react';
import { useFavoriteSources } from '@/lib/favorites/hooks';
import { SourceCard } from '@/app/components/sources/SourceCard';
import Link from 'next/link';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';

export default function FavoritesPage() {
  const {
    favorites,
    folders,
    isLoading,
    createFolder,
    updateFolder,
    deleteFolder,
    moveFavorite,
    updateNotifications,
    removeFavorite,
    exportData,
    importData,
    getFavoritesByFolder
  } = useFavoriteSources();

  const [selectedFolder, setSelectedFolder] = useState<string | undefined>(undefined);
  const [newFolderName, setNewFolderName] = useState('');
  const [newFolderColor, setNewFolderColor] = useState('#3B82F6');
  const [showFolderDialog, setShowFolderDialog] = useState(false);
  const [sources, setSources] = useState<any[]>([]);
  const [loadingSources, setLoadingSources] = useState(true);

  // ソース情報を取得
  useState(() => {
    const loadSources = async () => {
      try {
        const sourceIds = favorites.map(f => f.sourceId).join(',');
        if (!sourceIds) {
          setSources([]);
          setLoadingSources(false);
          return;
        }

        const response = await fetch(`/api/sources?ids=${sourceIds}`);
        const data = await response.json();
        setSources(data.sources || []);
      } catch (error) {
        console.error('Failed to load sources:', error);
      } finally {
        setLoadingSources(false);
      }
    };

    if (!isLoading) {
      loadSources();
    }
  }, [isLoading, favorites]);

  const handleCreateFolder = () => {
    if (newFolderName.trim()) {
      createFolder(newFolderName, newFolderColor);
      setNewFolderName('');
      setShowFolderDialog(false);
    }
  };

  const handleExport = () => {
    const data = exportData();
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `techtrend-favorites-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      const success = importData(content);
      if (success) {
        window.location.reload();
      } else {
        alert('インポートに失敗しました');
      }
    };
    reader.readAsText(file);
  };

  const filteredFavorites = selectedFolder 
    ? getFavoritesByFolder(selectedFolder)
    : favorites;

  const sourcesMap = sources.reduce((acc, source) => {
    acc[source.id] = source;
    return acc;
  }, {} as Record<string, any>);

  if (isLoading || loadingSources) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="flex items-center justify-center py-12">
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
            <p className="text-muted-foreground">読み込み中...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-8">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-3xl font-bold mb-2 flex items-center gap-2">
              <Star className="h-8 w-8" />
              お気に入りソース
            </h1>
            <p className="text-muted-foreground">
              お気に入りに登録したソースを管理できます
            </p>
          </div>
          <div className="flex gap-2">
            <Button asChild>
              <Link href="/favorites/feed">
                <Newspaper className="h-4 w-4 mr-2" />
                フィードを見る
              </Link>
            </Button>
            <Button variant="outline" onClick={handleExport}>
              <Download className="h-4 w-4 mr-2" />
              エクスポート
            </Button>
            <label>
              <input
                type="file"
                accept=".json"
                onChange={handleImport}
                className="hidden"
              />
              <Button variant="outline" asChild>
                <span>
                  <Upload className="h-4 w-4 mr-2" />
                  インポート
                </span>
              </Button>
            </label>
          </div>
        </div>
      </div>

      <div className="grid lg:grid-cols-4 gap-6">
        {/* サイドバー */}
        <div className="lg:col-span-1">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span>フォルダー</span>
                <Dialog open={showFolderDialog} onOpenChange={setShowFolderDialog}>
                  <DialogTrigger asChild>
                    <Button size="sm" variant="ghost">
                      <Plus className="h-4 w-4" />
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>新しいフォルダー</DialogTitle>
                      <DialogDescription>
                        お気に入りを整理するフォルダーを作成します
                      </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 pt-4">
                      <div>
                        <Label htmlFor="folder-name">フォルダー名</Label>
                        <Input
                          id="folder-name"
                          value={newFolderName}
                          onChange={(e) => setNewFolderName(e.target.value)}
                          placeholder="例: AI・機械学習"
                        />
                      </div>
                      <div>
                        <Label htmlFor="folder-color">カラー</Label>
                        <div className="flex gap-2 mt-2">
                          {['#3B82F6', '#EF4444', '#10B981', '#F59E0B', '#8B5CF6'].map(color => (
                            <button
                              key={color}
                              className={`w-8 h-8 rounded-full border-2 ${
                                newFolderColor === color ? 'border-foreground' : 'border-transparent'
                              }`}
                              style={{ backgroundColor: color }}
                              onClick={() => setNewFolderColor(color)}
                            />
                          ))}
                        </div>
                      </div>
                      <Button onClick={handleCreateFolder} className="w-full">
                        作成
                      </Button>
                    </div>
                  </DialogContent>
                </Dialog>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="space-y-1">
                <button
                  className={`w-full text-left px-4 py-2 hover:bg-accent transition-colors ${
                    !selectedFolder ? 'bg-accent' : ''
                  }`}
                  onClick={() => setSelectedFolder(undefined)}
                >
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-2">
                      <Star className="h-4 w-4" />
                      すべて
                    </span>
                    <span className="text-sm text-muted-foreground">
                      {favorites.length}
                    </span>
                  </div>
                </button>
                {folders.map(folder => {
                  const count = getFavoritesByFolder(folder.id).length;
                  return (
                    <button
                      key={folder.id}
                      className={`w-full text-left px-4 py-2 hover:bg-accent transition-colors ${
                        selectedFolder === folder.id ? 'bg-accent' : ''
                      }`}
                      onClick={() => setSelectedFolder(folder.id)}
                    >
                      <div className="flex items-center justify-between">
                        <span className="flex items-center gap-2">
                          <Folder
                            className="h-4 w-4"
                            style={{ color: folder.color }}
                          />
                          {folder.name}
                        </span>
                        <span className="text-sm text-muted-foreground">
                          {count}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* メインコンテンツ */}
        <div className="lg:col-span-3">
          {filteredFavorites.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <Star className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <p className="text-lg text-muted-foreground mb-2">
                  {selectedFolder ? 'このフォルダーにはまだお気に入りがありません' : 'まだお気に入りがありません'}
                </p>
                <p className="text-sm text-muted-foreground">
                  ソース一覧からお気に入りに追加してください
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {filteredFavorites.map(favorite => {
                const source = sourcesMap[favorite.sourceId];
                if (!source) return null;

                return (
                  <div key={favorite.id} className="relative">
                    <SourceCard source={source} />
                    <div className="absolute top-2 right-2 flex gap-2">
                      <Dialog>
                        <DialogTrigger asChild>
                          <Button size="sm" variant="ghost">
                            <Settings className="h-4 w-4" />
                          </Button>
                        </DialogTrigger>
                        <DialogContent>
                          <DialogHeader>
                            <DialogTitle>{source.name}の設定</DialogTitle>
                          </DialogHeader>
                          <div className="space-y-4 pt-4">
                            <div className="space-y-2">
                              <Label>フォルダー</Label>
                              <Select
                                value={favorite.folder || 'none'}
                                onValueChange={(value) => 
                                  moveFavorite(favorite.sourceId, value === 'none' ? undefined : value)
                                }
                              >
                                <SelectTrigger>
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="none">なし</SelectItem>
                                  {folders.map(folder => (
                                    <SelectItem key={folder.id} value={folder.id}>
                                      {folder.name}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                            
                            <div className="space-y-2">
                              <div className="flex items-center justify-between">
                                <Label htmlFor="notifications">通知</Label>
                                <Switch
                                  id="notifications"
                                  checked={favorite.notifications.enabled}
                                  onCheckedChange={(checked) =>
                                    updateNotifications(favorite.sourceId, {
                                      ...favorite.notifications,
                                      enabled: checked
                                    })
                                  }
                                />
                              </div>
                              {favorite.notifications.enabled && (
                                <Select
                                  value={favorite.notifications.frequency}
                                  onValueChange={(value: any) =>
                                    updateNotifications(favorite.sourceId, {
                                      ...favorite.notifications,
                                      frequency: value
                                    })
                                  }
                                >
                                  <SelectTrigger>
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="all">すべての記事</SelectItem>
                                    <SelectItem value="daily">1日1回</SelectItem>
                                    <SelectItem value="weekly">週1回</SelectItem>
                                  </SelectContent>
                                </Select>
                              )}
                            </div>

                            <div className="pt-4 border-t">
                              <Button
                                variant="destructive"
                                className="w-full"
                                onClick={() => removeFavorite(favorite.sourceId)}
                              >
                                <Trash2 className="h-4 w-4 mr-2" />
                                お気に入りから削除
                              </Button>
                            </div>
                          </div>
                        </DialogContent>
                      </Dialog>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}