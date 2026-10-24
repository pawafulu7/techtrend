import { FavoriteSourcesMigration } from './_components/favorite-sources-migration';

// お気に入りソースのフィードは、カスタムプリセットとホームのフィルターに置き換えた（Issue #709）。
// この URL を開くと、ブラウザに残るお気に入りソースをプリセットに移してからホームへ移る
export default function FavoritesFeedPage() {
  return <FavoriteSourcesMigration />;
}
