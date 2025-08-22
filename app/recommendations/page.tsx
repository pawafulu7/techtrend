import { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import { RecommendationsClient } from './recommendations-client';

export const metadata: Metadata = {
  title: 'おすすめ記事 | TechTrend',
  description: 'あなたの興味に基づいた推薦記事',
};

export default async function RecommendationsPage() {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    redirect('/auth/signin?callbackUrl=/recommendations');
  }

  return (
    <div className="container mx-auto px-4 py-6 max-w-7xl">
      <RecommendationsClient />
    </div>
  );
}