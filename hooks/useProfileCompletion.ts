import { useMemo } from 'react';

interface ProfileData {
  name?: string | null;
  bio?: string | null;
  website?: string | null;
  twitter?: string | null;
  github?: string | null;
  image?: string | null;
}

interface ProfileCompletionResult {
  percentage: number;
  completedFields: string[];
  incompleteFields: string[];
  message: string;
  isLowCompletion: boolean;
}

/**
 * Field definitions for profile completion calculation
 * Each field has a weight that contributes to the total percentage
 */
const PROFILE_FIELDS = [
  { key: 'name', label: 'Display name', weight: 25 },
  { key: 'bio', label: 'Bio', weight: 20 },
  { key: 'image', label: 'Profile image', weight: 20 },
  { key: 'website', label: 'Website', weight: 15 },
  { key: 'twitter', label: 'Twitter', weight: 10 },
  { key: 'github', label: 'GitHub', weight: 10 },
] as const;

const LOW_COMPLETION_THRESHOLD = 60;

/**
 * Calculate profile completion percentage based on filled fields
 * Implements Goal Gradient Effect by showing progress toward completion
 */
export function useProfileCompletion(
  profileData: ProfileData | null | undefined
): ProfileCompletionResult {
  return useMemo(() => {
    if (!profileData) {
      return {
        percentage: 0,
        completedFields: [],
        incompleteFields: PROFILE_FIELDS.map((f) => f.label),
        message: 'Start filling your profile',
        isLowCompletion: true,
      };
    }

    let totalWeight = 0;
    const completedFields: string[] = [];
    const incompleteFields: string[] = [];

    for (const field of PROFILE_FIELDS) {
      const value = profileData[field.key as keyof ProfileData];
      const isFilled = value !== null && value !== undefined && value !== '';

      if (isFilled) {
        totalWeight += field.weight;
        completedFields.push(field.label);
      } else {
        incompleteFields.push(field.label);
      }
    }

    const percentage = Math.min(100, totalWeight);

    // Generate encouraging message based on completion level
    let message: string;
    if (percentage === 100) {
      message = 'Complete!';
    } else if (percentage >= 80) {
      message = 'Almost there!';
    } else if (percentage >= 60) {
      message = 'Keep going!';
    } else if (percentage >= 40) {
      message = 'Good start';
    } else {
      message = 'Get started';
    }

    return {
      percentage,
      completedFields,
      incompleteFields,
      message,
      isLowCompletion: percentage < LOW_COMPLETION_THRESHOLD,
    };
  }, [profileData]);
}
