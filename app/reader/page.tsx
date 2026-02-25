import type { Metadata } from 'next';
import { ReaderClient } from './reader-client';

export const metadata: Metadata = {
  title: 'Reader - TechTrend',
  description: '記事をリーダービューで閲覧',
};

export default function ReaderPage() {
  return <ReaderClient />;
}
