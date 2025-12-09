'use client';

import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { ProfileImage } from '@/app/components/common/optimized-image';
import { ProfileCompletionBar } from './ProfileCompletionBar';
import { useProfileCompletion } from '@/hooks/useProfileCompletion';

interface ProfileHeaderProps {
  userName: string | null | undefined;
  userEmail: string | null | undefined;
  userImage: string | null | undefined;
  createdAt?: string | null;
  /** Optional: additional profile data for completion calculation */
  profileData?: {
    bio?: string | null;
    website?: string | null;
    twitter?: string | null;
    github?: string | null;
  };
}

/**
 * Profile page header component with centered avatar and user info
 * Implements visual hierarchy principle with prominent user identity
 */
export function ProfileHeader({
  userName,
  userEmail,
  userImage,
  createdAt,
  profileData,
}: ProfileHeaderProps) {
  const userInitial =
    userName?.charAt(0)?.toUpperCase() ||
    userEmail?.charAt(0)?.toUpperCase() ||
    'U';

  const displayName = userName || userEmail?.split('@')[0] || 'User';

  const memberSince = createdAt
    ? new Date(createdAt).toLocaleDateString('ja-JP', {
        year: 'numeric',
        month: 'long',
      })
    : null;

  // Calculate profile completion using combined data
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
    <header className="flex flex-col items-center text-center mb-8 min-h-[280px] opacity-0 animate-fade-in motion-reduce:opacity-100 motion-reduce:animate-none">
      {/* Avatar with responsive sizing */}
      <div className="mb-4">
        {userImage ? (
          <ProfileImage
            src={userImage}
            alt={displayName}
            size={128}
            className="w-20 h-20 sm:w-24 sm:h-24 md:w-28 md:h-28 lg:w-32 lg:h-32 rounded-full ring-4 ring-background shadow-lg"
          />
        ) : (
          <Avatar className="w-20 h-20 sm:w-24 sm:h-24 md:w-28 md:h-28 lg:w-32 lg:h-32 ring-4 ring-background shadow-lg">
            <AvatarFallback className="text-2xl sm:text-3xl md:text-4xl font-semibold bg-gradient-to-br from-[var(--tt-color-primary)] to-[var(--tt-color-primary-accent)] text-white">
              {userInitial}
            </AvatarFallback>
          </Avatar>
        )}
      </div>

      {/* User name with visual hierarchy */}
      <h1 className="font-heading text-2xl sm:text-3xl md:text-4xl font-bold tracking-tight text-foreground">
        {displayName}
      </h1>

      {/* Email subtitle */}
      {userEmail && userName && (
        <p className="text-sm text-muted-foreground mt-1">{userEmail}</p>
      )}

      {/* Member since */}
      {memberSince && (
        <p className="text-xs text-muted-foreground mt-2">
          {memberSince}から利用中
        </p>
      )}

      {/* Page description */}
      <p className="text-muted-foreground mt-3 max-w-md">
        アカウント情報とプロフィールを管理します
      </p>

      {/* Profile completion progress bar */}
      <ProfileCompletionBar
        percentage={completion.percentage}
        message={completion.message}
        isLowCompletion={completion.isLowCompletion}
        incompleteFields={completion.incompleteFields}
      />
    </header>
  );
}
