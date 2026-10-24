import { TrendSubNav } from './TrendSubNav';

/**
 * トレンドのサブナビの帯。/trends の下と、そこから行く人気・タグ・AIエージェント更新情報の画面に置く（Issue #704）。
 * 文字のタブの下線をこの帯の下の線に重ねる（ヘッダーと同じ）
 */
export function TrendSectionNav() {
  return (
    <div className="border-b border-(--tt-color-border) bg-(--tt-color-surface)">
      <div className="mx-auto w-full max-w-7xl px-4">
        <TrendSubNav />
      </div>
    </div>
  );
}
