import { FavoritesLoading } from '../_components/favorites-loading';

// お気に入りの初回待ち（issue #701）。配下のフィード（/favorites/feed）に効かないよう、
// 一覧だけをルートグループに置いている
export default function Loading() {
  return <FavoritesLoading />;
}
