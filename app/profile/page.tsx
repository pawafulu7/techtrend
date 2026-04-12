import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth/get-session';
import { ProfileContent } from './_components/profile-content';

export default async function ProfilePage() {
  const session = await getSession();
  if (!session?.user) {
    redirect('/auth/login?callbackUrl=/profile');
  }

  return <ProfileContent />;
}
