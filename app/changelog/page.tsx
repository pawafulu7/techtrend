import type { Metadata } from 'next';
import { Suspense } from 'react';
import { ChangelogContent } from './_components/changelog-content';
import { ChangelogSkeleton } from './_components/changelog-content';

export const metadata: Metadata = {
  title: 'AIエージェント更新情報',
  description: 'AIエージェントのリリースノートと変更履歴',
};

export default function ChangelogPage() {
  return (
    <div className="min-h-screen">
      <Suspense fallback={<ChangelogSkeleton />}>
        <ChangelogContent />
      </Suspense>
    </div>
  );
}
