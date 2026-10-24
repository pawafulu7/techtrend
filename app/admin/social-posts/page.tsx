import { requireAdmin } from '@/lib/auth/admin-check';
import { SocialPostsDashboard } from './_components/SocialPostsDashboard';

export const metadata = {
  title: 'Social Posts | TechTrend Admin',
  description: 'X投稿コンテンツ管理ダッシュボード',
};

/**
 * Social Posts Management Page (Admin Only)
 * Server Component for authentication check
 */
export default async function SocialPostsPage() {
  // Admin authorization check (auto-redirect if unauthorized)
  await requireAdmin();

  return <SocialPostsDashboard />;
}
