'use client';

import { useState } from 'react';
import { useSession } from 'next-auth/react';
import { useForm } from 'react-hook-form';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Loader2, Upload } from 'lucide-react';
import { ProfileImage } from '@/app/components/common/optimized-image';

type ProfileFormData = {
  name: string;
  bio: string;
  website: string;
  twitter: string;
  github: string;
};

export function ProfileForm() {
  const { data: session, update } = useSession();
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

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
    setMessage(null);

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

      const updatedUser = await response.json();
      
      // Update session
      await update({
        ...session,
        user: {
          ...session?.user,
          name: updatedUser.name,
        },
      });

      setMessage({
        type: 'success',
        text: 'プロフィールを更新しました',
      });
    } catch (error) {
      setMessage({
        type: 'error',
        text: 'プロフィールの更新に失敗しました',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const userInitial = session?.user?.name?.charAt(0)?.toUpperCase() || 
                      session?.user?.email?.charAt(0)?.toUpperCase() || 
                      'U';

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      {message && (
        <Alert variant={message.type === 'error' ? 'destructive' : 'default'}>
          <AlertDescription>{message.text}</AlertDescription>
        </Alert>
      )}

      <div className="flex items-center space-x-4">
        {session?.user?.image ? (
          <ProfileImage
            src={session.user.image}
            alt={session.user.name || 'User'}
            size={80}
          />
        ) : (
          <Avatar className="h-20 w-20">
            <AvatarFallback>{userInitial}</AvatarFallback>
          </Avatar>
        )}
        <div>
          <Button type="button" variant="outline" size="sm" disabled>
            <Upload className="mr-2 h-4 w-4" />
            画像を変更
          </Button>
          <p className="text-xs text-muted-foreground mt-1">
            JPG, GIF, PNG. 最大1MB
          </p>
        </div>
      </div>

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
          <p className="text-sm text-destructive">{errors.name.message}</p>
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
          <p className="text-sm text-destructive">{errors.bio.message}</p>
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
              value: /^(https?:\/\/)?([\da-z\.-]+)\.([a-z\.]{2,6})([\/\w \.-]*)*\/?$/,
              message: '有効なURLを入力してください',
            },
          })}
          disabled={isLoading}
        />
        {errors.website && (
          <p className="text-sm text-destructive">{errors.website.message}</p>
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
            <p className="text-sm text-destructive">{errors.twitter.message}</p>
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
            <p className="text-sm text-destructive">{errors.github.message}</p>
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