'use client';

import { useState } from 'react';
import { authClient } from '@/lib/auth/auth-client';
import { useForm } from 'react-hook-form';
import { Button } from '@/components/ui-v2/button-v2';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

type ProfileFormData = {
  name: string;
  bio: string;
  website: string;
  twitter: string;
  github: string;
};

export function ProfileForm() {
  const { data: session } = authClient.useSession();
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ProfileFormData>({
    defaultValues: {
      name: session?.user?.name || '',
      bio: '',
      website: '',
      twitter: '',
      github: '',
    },
  });

  const onSubmit = async (data: ProfileFormData) => {
    setIsLoading(true);

    try {
      const response = await fetch('/api/user/profile', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        throw new Error('プロフィールの更新に失敗しました');
      }

      await response.json();

      // Success toast
      toast({
        title: '✓ 保存しました',
        description: 'プロフィールを更新しました',
      });
    } catch (_error) {
      toast({
        variant: 'destructive',
        title: 'エラー',
        description: 'プロフィールの更新に失敗しました',
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      <div className="space-y-2">
        <Label htmlFor="name">表示名</Label>
        <Input
          id="name"
          {...register('name', {
            required: '表示名を入力してください',
            minLength: {
              value: 2,
              message: '表示名は2文字以上である必要があります',
            },
          })}
          disabled={isLoading}
        />
        {errors.name && (
          <p className="text-destructive text-sm">{errors.name.message}</p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="bio">自己紹介</Label>
        <Textarea
          id="bio"
          placeholder="あなたについて教えてください"
          {...register('bio', {
            maxLength: {
              value: 200,
              message: '自己紹介は200文字以内で入力してください',
            },
          })}
          disabled={isLoading}
          rows={4}
        />
        {errors.bio && (
          <p className="text-destructive text-sm">{errors.bio.message}</p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="website">ウェブサイト</Label>
        <Input
          id="website"
          type="url"
          placeholder="https://example.com"
          {...register('website', {
            pattern: {
              value: /^(https?:\/\/)?([\da-z\.-]+)\.([a-z\.]{2,6})(\/[^\s]*)?$/,
              message: '有効なURLを入力してください',
            },
          })}
          disabled={isLoading}
        />
        {errors.website && (
          <p className="text-destructive text-sm">{errors.website.message}</p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="twitter">Twitter</Label>
          <Input
            id="twitter"
            placeholder="@username"
            {...register('twitter', {
              pattern: {
                value: /^@?[A-Za-z0-9_]{1,15}$/,
                message: '有効なTwitterユーザー名を入力してください',
              },
            })}
            disabled={isLoading}
          />
          {errors.twitter && (
            <p className="text-destructive text-sm">{errors.twitter.message}</p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="github">GitHub</Label>
          <Input
            id="github"
            placeholder="username"
            {...register('github', {
              pattern: {
                value: /^[a-z\d](?:[a-z\d]|-(?=[a-z\d])){0,38}$/i,
                message: '有効なGitHubユーザー名を入力してください',
              },
            })}
            disabled={isLoading}
          />
          {errors.github && (
            <p className="text-destructive text-sm">{errors.github.message}</p>
          )}
        </div>
      </div>

      <Button type="submit" disabled={isLoading}>
        {isLoading ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            更新中...
          </>
        ) : (
          'プロフィールを更新'
        )}
      </Button>
    </form>
  );
}
