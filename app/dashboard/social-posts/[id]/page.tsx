import { requireAdmin } from '@/lib/auth/admin-check';
import { SocialPostEditor } from '../_components/SocialPostEditor';

interface PageProps {
  params: Promise<{ id: string }>;
}

export const metadata = {
  title: 'Edit Social Post | TechTrend Admin',
};

export default async function SocialPostEditPage({ params }: PageProps) {
  await requireAdmin();
  const { id } = await params;

  return <SocialPostEditor postId={id} />;
}
