import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth/auth';
import { ProfileContent } from './_components/profile-content';

export default async function ProfilePage() {
  const session = await auth();
  if (!session?.user) {
    redirect('/auth/login?callbackUrl=/profile');
  }

  return <ProfileContent />;
}
