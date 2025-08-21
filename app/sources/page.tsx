import dynamic from 'next/dynamic';
import { SourcesSkeleton } from './sources-skeleton';

const SourcesContent = dynamic(
  () => import('./sources-content'),
  {
    loading: () => <SourcesSkeleton />,
    ssr: false
  }
);

export default function SourcesPage() {
  return <SourcesContent />;
}