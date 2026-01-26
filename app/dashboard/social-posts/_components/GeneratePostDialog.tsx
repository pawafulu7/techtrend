'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Loader2, Search, FileText } from 'lucide-react';
import { ARTICLE_CATEGORIES, type ArticleCategory } from '@/lib/social-post';

type GenerationType = 'article' | 'article_search' | 'article_id' | 'opinion';

interface CandidateArticle {
  id: string;
  title: string;
  translatedTitle: string | null;
  summary: string | null;
  category: string | null;
  qualityScore: number | null;
  source: { name: string };
}

interface GeneratePostDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onComplete: () => void;
}

const GENERATION_TYPES: Record<
  GenerationType,
  { label: string; description: string }
> = {
  article: {
    label: '自動選定',
    description: '人気度・注目度を考慮して、最適な記事から投稿を自動生成します',
  },
  article_search: {
    label: '記事検索',
    description:
      'カテゴリやキーワードで記事を検索し、選択した記事から生成します',
  },
  article_id: {
    label: '記事ID指定',
    description:
      '記事IDを直接入力して、その記事から投稿を生成します（品質・期間制限なし）',
  },
  opinion: {
    label: '感想・意見',
    description:
      '最近のトレンドを分析し、個人的な感想・気づきスタイルの投稿を生成します',
  },
};

const CATEGORY_LABELS: Record<ArticleCategory, string> = {
  frontend: 'フロントエンド',
  backend: 'バックエンド',
  ai_ml: 'AI/ML',
  security: 'セキュリティ',
  devops: 'DevOps',
  database: 'データベース',
  mobile: 'モバイル',
  web3: 'Web3',
  design: 'デザイン',
  testing: 'テスト',
  performance: 'パフォーマンス',
  architecture: 'アーキテクチャ',
};

export function GeneratePostDialog({
  open,
  onOpenChange,
  onComplete,
}: GeneratePostDialogProps) {
  const [generationType, setGenerationType] =
    useState<GenerationType>('article');
  const [count, setCount] = useState('3');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 記事検索用の状態
  const [searchCategory, setSearchCategory] = useState<string>('all');
  const [searchKeyword, setSearchKeyword] = useState('');
  const [candidates, setCandidates] = useState<CandidateArticle[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [selectedArticle, setSelectedArticle] =
    useState<CandidateArticle | null>(null);

  // 記事ID直接入力用の状態
  const [articleIdInput, setArticleIdInput] = useState('');

  // AbortController用のref
  const abortControllerRef = useRef<AbortController | null>(null);

  const currentType = GENERATION_TYPES[generationType];

  // デバウンス検索
  const searchArticles = useCallback(async () => {
    // 前のリクエストをキャンセル
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    // 新しいAbortControllerを作成
    abortControllerRef.current = new AbortController();

    setIsSearching(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      if (searchCategory && searchCategory !== 'all') {
        params.set('category', searchCategory);
      }
      if (searchKeyword) params.set('keyword', searchKeyword);
      params.set('limit', '10');

      const res = await fetch(
        `/api/admin/social-posts/articles/candidates?${params.toString()}`,
        { signal: abortControllerRef.current.signal }
      );

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || '検索に失敗しました');
      }

      const data = await res.json();
      setCandidates(data.articles);
      setIsSearching(false);
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        // キャンセルされた場合は状態を変更せず終了
        // 新しいリクエストがisSearchingを管理するため
        return;
      }
      setError(err instanceof Error ? err.message : '検索に失敗しました');
      setCandidates([]);
      setIsSearching(false);
    }
  }, [searchCategory, searchKeyword]);

  // デバウンス効果
  useEffect(() => {
    if (generationType !== 'article_search') return;

    const timer = setTimeout(() => {
      searchArticles();
    }, 300);

    return () => {
      clearTimeout(timer);
    };
  }, [generationType, searchArticles]);

  // ダイアログを閉じる時にリセット
  useEffect(() => {
    if (!open) {
      setSearchCategory('all');
      setSearchKeyword('');
      setCandidates([]);
      setSelectedArticle(null);
      setArticleIdInput('');
      setError(null);
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    }
  }, [open]);

  const handleSubmit = async () => {
    setIsLoading(true);
    setError(null);

    try {
      if (generationType === 'article_search') {
        // 記事検索モード: 選択した記事から生成
        if (!selectedArticle) {
          setError('記事を選択してください');
          setIsLoading(false);
          return;
        }

        const res = await fetch(
          '/api/admin/social-posts/generate-from-article',
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ articleId: selectedArticle.id }),
          }
        );

        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error || '生成に失敗しました');
        }

        alert('投稿を生成しました');
        onComplete();
      } else if (generationType === 'article_id') {
        // 記事ID直接指定モード
        const trimmedId = articleIdInput.trim();
        if (!trimmedId) {
          setError('記事IDを入力してください');
          setIsLoading(false);
          return;
        }

        const res = await fetch(
          '/api/admin/social-posts/generate-from-article',
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ articleId: trimmedId }),
          }
        );

        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error || '生成に失敗しました');
        }

        alert('投稿を生成しました');
        onComplete();
      } else {
        // 自動選定/感想モード
        const endpoint =
          generationType === 'article'
            ? '/api/admin/social-posts/generate'
            : '/api/admin/social-posts/generate-opinion';

        const res = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ count: parseInt(count, 10) }),
        });

        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error || '生成に失敗しました');
        }

        const data = await res.json();

        if (data.count === 0) {
          const message =
            generationType === 'article'
              ? '生成可能な記事が見つかりませんでした'
              : 'トレンドデータが不足しています';
          setError(message);
          return;
        }

        alert(`${data.count}件の投稿を生成しました`);
        onComplete();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '生成に失敗しました');
    } finally {
      setIsLoading(false);
    }
  };

  const handleClose = () => {
    if (!isLoading) {
      setError(null);
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>投稿を自動生成</DialogTitle>
          <DialogDescription>{currentType.description}</DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-4">
          <div className="space-y-2">
            <Label>生成タイプ</Label>
            <RadioGroup
              value={generationType}
              onValueChange={(v) => {
                setGenerationType(v as GenerationType);
                setSelectedArticle(null);
                setError(null);
              }}
              disabled={isLoading}
              className="flex flex-wrap gap-4"
            >
              {(Object.keys(GENERATION_TYPES) as GenerationType[]).map(
                (type) => (
                  <div key={type} className="flex items-center space-x-2">
                    <RadioGroupItem value={type} id={`type-${type}`} />
                    <Label htmlFor={`type-${type}`} className="cursor-pointer">
                      {GENERATION_TYPES[type].label}
                    </Label>
                  </div>
                )
              )}
            </RadioGroup>
          </div>

          {generationType === 'article_search' ? (
            // 記事検索モード
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label htmlFor="category" className="text-xs">
                    カテゴリ
                  </Label>
                  <Select
                    value={searchCategory}
                    onValueChange={setSearchCategory}
                    disabled={isLoading}
                  >
                    <SelectTrigger id="category">
                      <SelectValue placeholder="すべて" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">すべて</SelectItem>
                      {ARTICLE_CATEGORIES.map((cat) => (
                        <SelectItem key={cat} value={cat}>
                          {CATEGORY_LABELS[cat]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label htmlFor="keyword" className="text-xs">
                    キーワード
                  </Label>
                  <div className="relative">
                    <Search className="text-muted-foreground absolute top-2.5 left-2 h-4 w-4" />
                    <Input
                      id="keyword"
                      value={searchKeyword}
                      onChange={(e) => setSearchKeyword(e.target.value)}
                      placeholder="例: Claude Code"
                      className="pl-8"
                      disabled={isLoading}
                    />
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-xs">候補記事</Label>
                  {isSearching && (
                    <Loader2 className="text-muted-foreground h-3 w-3 animate-spin" />
                  )}
                </div>
                <div className="h-[200px] overflow-y-auto rounded-md border">
                  {candidates.length === 0 ? (
                    <div className="text-muted-foreground flex h-full flex-col items-center justify-center text-sm">
                      <FileText className="mb-2 h-8 w-8 opacity-50" />
                      {isSearching
                        ? '検索中...'
                        : '過去24時間の記事がありません'}
                    </div>
                  ) : (
                    <div className="divide-y">
                      {candidates.map((article) => (
                        <button
                          key={article.id}
                          type="button"
                          onClick={() => setSelectedArticle(article)}
                          disabled={isLoading}
                          className={`hover:bg-accent w-full p-3 text-left transition-colors ${
                            selectedArticle?.id === article.id
                              ? 'bg-accent'
                              : ''
                          }`}
                        >
                          <div className="line-clamp-1 text-sm font-medium">
                            {article.translatedTitle || article.title}
                          </div>
                          <div className="text-muted-foreground mt-1 flex items-center gap-2 text-xs">
                            <span>{article.source.name}</span>
                            {article.category && (
                              <>
                                <span>•</span>
                                <span>
                                  {CATEGORY_LABELS[
                                    article.category as ArticleCategory
                                  ] || article.category}
                                </span>
                              </>
                            )}
                            {article.qualityScore && (
                              <>
                                <span>•</span>
                                <span>スコア: {article.qualityScore}</span>
                              </>
                            )}
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                {selectedArticle && (
                  <p className="text-muted-foreground text-xs">
                    選択中:{' '}
                    {selectedArticle.translatedTitle || selectedArticle.title}
                  </p>
                )}
              </div>
            </div>
          ) : generationType === 'article_id' ? (
            // 記事ID直接指定モード
            <div className="space-y-2">
              <Label htmlFor="article-id">記事ID</Label>
              <Input
                id="article-id"
                value={articleIdInput}
                onChange={(e) => setArticleIdInput(e.target.value)}
                placeholder="例: cm1234567890abcdefgh"
                disabled={isLoading}
              />
              <p className="text-muted-foreground text-xs">
                記事詳細ページのURLから記事IDを取得できます
                <br />
                例: /articles/<strong>cm1234567890abcdefgh</strong>
              </p>
            </div>
          ) : (
            // 自動選定/感想モード
            <div className="space-y-2">
              <Label htmlFor="count">生成件数</Label>
              <Select
                value={count}
                onValueChange={setCount}
                disabled={isLoading}
              >
                <SelectTrigger id="count">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[1, 2, 3, 4, 5].map((n) => (
                    <SelectItem key={n} value={String(n)}>
                      {n}件
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-muted-foreground text-xs">
                {generationType === 'article'
                  ? '過去24時間の人気記事から自動選定されます'
                  : '過去3日間のトレンドを分析して生成します'}
              </p>
            </div>
          )}

          {error && <p className="text-destructive text-sm">{error}</p>}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose} disabled={isLoading}>
            キャンセル
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={
              isLoading ||
              (generationType === 'article_search' && !selectedArticle) ||
              (generationType === 'article_id' && !articleIdInput.trim())
            }
          >
            {isLoading ? '生成中...' : '生成する'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
