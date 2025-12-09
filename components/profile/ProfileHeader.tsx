'use client';

import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { ProfileImage } from '@/app/components/common/optimized-image';

interface ProfileHeaderProps {
  userName: string | null | undefined;
  userEmail: string | null | undefined;
  userImage: string | null | undefined;
}

/**
 * Simple profile header - name and avatar only
 */
export function ProfileHeader({
  userName,
  userEmail,
  userImage,
}: ProfileHeaderProps) {
  const userInitial =
    userName?.charAt(0)?.toUpperCase() ||
    userEmail?.charAt(0)?.toUpperCase() ||
    'U';

  const displayName = userName || userEmail?.split('@')[0] || 'User';

  return (
    <header className="mb-6 p-4 rounded-2xl bg-white/95 dark:bg-slate-900/95 shadow-lg border-0">
      <div className="flex items-center gap-4">
        <div className="flex-shrink-0">
          {userImage ? (
            <ProfileImage
              src={userImage}
              alt={displayName}
              size={64}
              className="w-16 h-16 rounded-full ring-2 ring-slate-200 dark:ring-slate-700 shadow-md"
            />
          ) : (
            <Avatar className="w-16 h-16 ring-2 ring-slate-200 dark:ring-slate-700 shadow-md">
              <AvatarFallback className="text-xl font-semibold bg-gradient-to-br from-slate-600 to-slate-800 text-white">
                {userInitial}
              </AvatarFallback>
            </Avatar>
          )}
        </div>
        <div className="min-w-0">
          <h1 className="text-xl font-bold text-foreground truncate">{displayName}</h1>
          {userEmail && (
            <p className="text-sm text-muted-foreground truncate">{userEmail}</p>
          )}
        </div>
      </div>
    </header>
  );
}
