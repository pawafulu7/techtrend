import { FavoritesLoading } from '../_components/favorites-loading';

// お気に入りの初回待ち（issue #701）。配下の /favorites/feed（お気に入りソースをプリセットへ移すページ）に
// 効かないよう、一覧だけをルートグループに置いている
export default function Loading() {
  return <FavoritesLoading />;
}
