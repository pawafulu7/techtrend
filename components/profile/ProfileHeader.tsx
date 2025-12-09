'use client';

import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { ProfileImage } from '@/app/components/common/optimized-image';
import { useProfileCompletion } from '@/hooks/useProfileCompletion';

interface ProfileHeaderProps {
  userName: string | null | undefined;
  userEmail: string | null | undefined;
  userImage: string | null | undefined;
  createdAt?: string | null;
  profileData?: {
    bio?: string | null;
    website?: string | null;
    twitter?: string | null;
    github?: string | null;
  };
}

/**
 * Compact profile header - prioritizes form visibility
 */
export function ProfileHeader({
  userName,
  userEmail,
  userImage,
  profileData,
}: ProfileHeaderProps) {
  const userInitial =
    userName?.charAt(0)?.toUpperCase() ||
    userEmail?.charAt(0)?.toUpperCase() ||
    'U';

  const displayName = userName || userEmail?.split('@')[0] || 'User';

  const completionData = {
    name: userName,
    image: userImage,
    bio: profileData?.bio,
    website: profileData?.website,
    twitter: profileData?.twitter,
    github: profileData?.github,
  };
  const completion = useProfileCompletion(completionData);

  return (
    <header className="flex items-center gap-4 mb-6 p-4 rounded-xl bg-gradient-to-r from-slate-50 to-slate-100 dark:from-slate-800/50 dark:to-slate-900/50 border border-slate-200 dark:border-slate-700">
      {/* Avatar - compact */}
      <div className="flex-shrink-0">
        {userImage ? (
          <ProfileImage
            src={userImage}
            alt={displayName}
            size={64}
            className="w-14 h-14 rounded-full ring-2 ring-white dark:ring-slate-700 shadow-md"
          />
        ) : (
          <Avatar className="w-14 h-14 ring-2 ring-white dark:ring-slate-700 shadow-md">
            <AvatarFallback className="text-lg font-semibold bg-gradient-to-br from-cyan-500 to-blue-600 text-white">
              {userInitial}
            </AvatarFallback>
          </Avatar>
        )}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <h1 className="text-lg font-bold text-foreground truncate">
          {displayName}
        </h1>
        {userEmail && (
          <p className="text-sm text-muted-foreground truncate">{userEmail}</p>
        )}
      </div>

      {/* Completion badge - compact */}
      <div className="flex-shrink-0 text-right">
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white dark:bg-slate-800 shadow-sm border border-slate-200 dark:border-slate-600">
          <div className="w-12 h-1.5 rounded-full bg-slate-200 dark:bg-slate-600 overflow-hidden">
            <div
              className="h-full rounded-full bg-gradient-to-r from-cyan-500 to-blue-500 transition-all"
              style={{ width: `${completion.percentage}%` }}
            />
          </div>
          <span className="text-xs font-medium text-muted-foreground">
            {completion.percentage}%
          </span>
        </div>
      </div>
    </header>
  );
}
