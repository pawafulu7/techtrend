import { auth } from '@/lib/auth/auth';

export async function getSession() {
  return await auth();
}

export async function getRequiredSession() {
  const session = await auth();
  
  if (!session?.user) {
    throw new Error('Unauthorized');
  }
  
  return session;
}