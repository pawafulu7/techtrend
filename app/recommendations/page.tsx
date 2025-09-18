import { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth/auth';
import { RecommendationsClient } from './recommendations-client';
import { loginWithCallback } from '@/lib/routes/auth';

export const metadata: Metadata = {
  title: 'おすすめ記事 | TechTrend',
  description: 'あなたの興味に基づいた推薦記事',
};

export default async function RecommendationsPage() {
  const session = await auth();

  if (!session?.user) {
    redirect(loginWithCallback('/recommendations'));
  }

  return (
    <div className="container mx-auto px-4 py-6 max-w-7xl">
      <RecommendationsClient />
    </div>
  );
}