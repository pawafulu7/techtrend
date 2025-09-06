import { useState, useEffect } from 'react';

export interface UserProfile {
  id: string;
  email: string;
  name: string | null;
  image: string | null;
  createdAt: string;
  hasPassword: boolean;
  providers: string[];
}

interface UseUserProfileOptions {
  enabled?: boolean;
}

export function useUserProfile(options?: UseUserProfileOptions) {
  const [data, setData] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const enabled = options?.enabled ?? true;

  useEffect(() => {
    if (!enabled) {
      setLoading(false);
      return;
    }

    const fetchUserProfile = async () => {
      try {
        setLoading(true);
        setError(null);
        
        const response = await fetch('/api/user/profile', { cache: 'no-store' });
        
        if (!response.ok) {
          if (response.status === 401) {
            throw new Error('認証が必要です');
          }
          throw new Error('プロフィール情報の取得に失敗しました');
        }
        
        const profileData = (await response.json()) as UserProfile;
        setData(profileData);
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Unknown error'));
      } finally {
        setLoading(false);
      }
    };

    fetchUserProfile();
  }, [enabled]);

  return { data, loading, error };
}