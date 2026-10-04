import { useState, useEffect, useCallback } from 'react';

export interface UserProfile {
  id: string;
  email: string;
  name: string | null;
  image: string | null;
  createdAt: string;
  hasPassword: boolean;
  providers: string[];
}

/** 画面で文言を選べるよう、HTTP ステータスを持たせる（issue #701） */
export class UserProfileFetchError extends Error {
  constructor(readonly status: number) {
    super(`Failed to fetch user profile: ${status}`);
    this.name = 'UserProfileFetchError';
  }
}

interface UseUserProfileOptions {
  enabled?: boolean;
}

export function useUserProfile(options?: UseUserProfileOptions) {
  const [data, setData] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const enabled = options?.enabled ?? true;
  // 再試行のたびに増やして取得し直す（issue #701）
  const [reloadKey, setReloadKey] = useState(0);
  const refetch = useCallback(() => setReloadKey((key) => key + 1), []);

  useEffect(() => {
    if (!enabled) {
      // enabled=false 時はフェッチをスキップしてローディング状態を解除する
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setLoading(false);
      return;
    }

    // 再試行やアンマウントの後は取得を止め、古い応答で状態を書き換えない
    let cancelled = false;
    const controller = new AbortController();

    const fetchUserProfile = async () => {
      try {
        setLoading(true);
        // 失敗後の再試行中も失敗表示（再試行中…）を残すため、error は成功したときに消す
        const response = await fetch('/api/user/profile', {
          cache: 'no-store',
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new UserProfileFetchError(response.status);
        }

        const profileData = (await response.json()) as UserProfile;
        if (cancelled) return;
        setData(profileData);
        setError(null);
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err : new Error('Unknown error'));
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void fetchUserProfile();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [enabled, reloadKey]);

  return { data, loading, error, refetch };
}
