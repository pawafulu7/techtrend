'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui-v2/button-v2';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui-v2/card-v2';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { StatusBadge } from './StatusBadge';
import type { SocialPost, SocialPostStatus } from '@/lib/social-post';
import { calculateEffectiveLength } from '@/lib/social-post';

interface SocialPostEditorProps {
  postId: string;
}

const fetcher = async (url: string) => {
  const res = await fetch(url);
  if (!res.ok) throw new Error('Failed to fetch');
  return res.json();
};

const STATUS_OPTIONS: Array<{ value: SocialPostStatus; label: string }> = [
  { value: 'DRAFT', label: '下書き' },
  { value: 'REVIEWED', label: 'レビュー済' },
  { value: 'SCHEDULED', label: '予約済' },
  { value: 'ARCHIVED', label: 'アーカイブ' },
];

export function SocialPostEditor({ postId }: SocialPostEditorProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const {
    data: post,
    error,
    isLoading,
  } = useQuery<SocialPost>({
    queryKey: ['social-post', postId],
    queryFn: () => fetcher(`/api/admin/social-posts/${postId}`),
  });

  // Form state
  const [content, setContent] = useState('');
  const [hashtags, setHashtags] = useState('');
  const [status, setStatus] = useState<SocialPostStatus>('DRAFT');
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [initializedPostId, setInitializedPostId] = useState<string | null>(
    null
  );

  // Initialize form when data loads or postId changes
  useEffect(() => {
    if (post && initializedPostId !== postId) {
      setContent(post.content);
      setHashtags(post.hashtags.join(' '));
      setStatus(post.status);
      setInitializedPostId(postId);
    }
  }, [post, postId, initializedPostId]);

  // Calculate character count
  const effectiveLength = calculateEffectiveLength(
    content,
    post?.sourceUrls || []
  );
  const isOverLimit = effectiveLength > 280;

  const handleSave = async () => {
    if (isOverLimit) {
      setSaveError('文字数制限を超えています');
      return;
    }

    setIsSaving(true);
    setSaveError(null);

    try {
      const hashtagArray = hashtags
        .split(/[\s,]+/)
        .map((t) => t.trim())
        .filter((t) => t.length > 0)
        .map((t) => (t.startsWith('#') ? t : `#${t}`));

      const res = await fetch(`/api/admin/social-posts/${postId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content,
          hashtags: hashtagArray,
          status,
        }),
      });

      if (!res.ok) {
        let errorMessage = '保存に失敗しました';
        try {
          const data = await res.json();
          errorMessage = data.error || errorMessage;
        } catch {
          // JSON parse failed, use default message
        }
        throw new Error(errorMessage);
      }

      queryClient.invalidateQueries({ queryKey: ['social-post', postId] });
      alert('保存しました');
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : '保存に失敗しました');
    } finally {
      setIsSaving(false);
    }
  };

  const handleCopy = async () => {
    if (!post) return;
    const text = `${content}\n\n${post.sourceUrls.join('\n')}\n\n${hashtags}`;
    try {
      await navigator.clipboard.writeText(text);
      alert('クリップボードにコピーしました');
    } catch {
      alert('コピーに失敗しました');
    }
  };

  if (error) {
    return (
      <div className="container mx-auto py-6">
        <div className="text-destructive py-10 text-center">
          投稿の読み込みに失敗しました
        </div>
      </div>
    );
  }

  if (isLoading || !post) {
    return (
      <div className="container mx-auto py-6">
        <div className="text-muted-foreground py-10 text-center">
          読み込み中...
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto space-y-6 py-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <Button variant="ghost" onClick={() => router.back()}>
            ← 戻る
          </Button>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleCopy}>
            コピー
          </Button>
          <Button onClick={handleSave} disabled={isSaving || isOverLimit}>
            {isSaving ? '保存中...' : '保存'}
          </Button>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Editor */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span>投稿を編集</span>
              <StatusBadge status={status} />
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="content">コンテンツ</Label>
                <span
                  className={`text-sm ${isOverLimit ? 'text-destructive' : 'text-muted-foreground'}`}
                >
                  {effectiveLength}/280
                </span>
              </div>
              <Textarea
                id="content"
                value={content}
                onChange={(e) => setContent(e.target.value)}
                rows={5}
                className={isOverLimit ? 'border-destructive' : ''}
              />
              {isOverLimit && (
                <p className="text-destructive text-sm">
                  文字数制限を超えています（URLは23文字としてカウント）
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="hashtags">ハッシュタグ（スペース区切り）</Label>
              <Input
                id="hashtags"
                value={hashtags}
                onChange={(e) => setHashtags(e.target.value)}
                placeholder="#Frontend #TypeScript"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="status">ステータス</Label>
              <Select
                value={status}
                onValueChange={(value) => setStatus(value as SocialPostStatus)}
              >
                <SelectTrigger id="status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATUS_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {saveError && (
              <p className="text-destructive text-sm">{saveError}</p>
            )}
          </CardContent>
        </Card>

        {/* Preview & Info */}
        <div className="space-y-6">
          {/* Preview */}
          <Card>
            <CardHeader>
              <CardTitle>プレビュー</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="bg-muted space-y-2 rounded-lg p-4">
                <p className="whitespace-pre-wrap">{content}</p>
                {post.sourceUrls.length > 0 && (
                  <div className="space-y-1">
                    {post.sourceUrls.map((url, i) => (
                      <a
                        key={i}
                        href={url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block truncate text-sm text-[var(--tt-color-info)] hover:underline"
                      >
                        {url}
                      </a>
                    ))}
                  </div>
                )}
                <p className="text-[var(--tt-color-info)]">{hashtags}</p>
              </div>
            </CardContent>
          </Card>

          {/* Metadata */}
          <Card>
            <CardHeader>
              <CardTitle>メタデータ</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">ソース</dt>
                  <dd>{post.source}</dd>
                </div>
                {post.source === 'ARTICLE' && post.sourceIds.length > 0 && (
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">記事</dt>
                    <dd>
                      <Link
                        href={`/articles/${post.sourceIds[0]}`}
                        className="text-[var(--tt-color-info)] hover:underline"
                      >
                        詳細を見る
                      </Link>
                    </dd>
                  </div>
                )}
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">作成日時</dt>
                  <dd>{new Date(post.createdAt).toLocaleString('ja-JP')}</dd>
                </div>
                {post.modelVersion && (
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">モデル</dt>
                    <dd>{post.modelVersion}</dd>
                  </div>
                )}
                {post.promptVersion && (
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">プロンプト</dt>
                    <dd>{post.promptVersion}</dd>
                  </div>
                )}
              </dl>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
