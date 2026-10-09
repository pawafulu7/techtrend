'use client';

import Link from 'next/link';
import { Network, ArrowLeft, ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui-v2/button-v2';
import { useMediaQuery } from '@/app/hooks/use-media-query';
import type { GraphNode } from '@/lib/types/graph';
import { graphNodeColors } from '@/lib/design-tokens';
import { removeCenterPrefix } from '@/lib/utils/graph-helpers';

const PANEL =
  'rounded-lg border border-[var(--tt-color-border)] bg-[var(--tt-color-surface)]/95 shadow-xl';

interface GraphOverlaysProps {
  articleId: string;
  currentDepth: 1 | 2;
  onToggleDepth: () => void;
  centerNode?: GraphNode;
  relatedCount: number;
  hoveredNode: GraphNode | null;
  centerArticleId?: string;
  /** 凡例の開閉（null は未操作。そのときは lg 以上で開く） */
  legendOpen: boolean | null;
  onLegendToggle: (open: boolean) => void;
}

/**
 * キャンバスの上に重ねる案内（戻る・見出し・深さの切り替え・中心記事・凡例・ホバーした記事）。
 * lg 以上は左・上中央・右に置き、それより狭い画面では1列に積む。
 * 以前はどれも個別に absolute で置いていたため、狭い画面で互いに重なっていた（Issue #700）
 */
export function GraphOverlays({
  articleId,
  currentDepth,
  onToggleDepth,
  centerNode,
  relatedCount,
  hoveredNode,
  centerArticleId,
  legendOpen,
  onLegendToggle,
}: GraphOverlaysProps) {
  // 凡例は狭い画面では閉じておき、キャンバスの面積を残す
  const isDesktop = useMediaQuery('(min-width: 1024px)');
  const legendIsOpen = legendOpen ?? isDesktop;

  return (
    <>
      {/* 空いている所はキャンバスを操作できるよう、外枠はポインターを通す */}
      <div className="pointer-events-none absolute inset-x-4 top-4 flex flex-col items-start gap-2 lg:block">
        {/* 戻るボタンと見出し */}
        <div className="pointer-events-auto flex flex-col items-start gap-1 lg:absolute lg:top-0 lg:left-0">
          <Button variant="ghost" asChild>
            <Link
              href={`/articles/${articleId}`}
              className="flex items-center gap-2"
            >
              <ArrowLeft className="h-4 w-4" />
              記事詳細に戻る
            </Link>
          </Button>
          <h1 className="font-heading text-foreground text-h1">
            関連記事グラフ
          </h1>
        </div>

        {/* Depth toggle */}
        <button
          data-testid="depth-toggle-button"
          onClick={onToggleDepth}
          className="border-tt-primary-border bg-tt-primary-bg text-tt-primary hover:bg-tt-primary hover:text-tt-on-primary pointer-events-auto rounded-lg border px-4 py-2 text-sm font-medium shadow-xl transition-colors lg:absolute lg:top-0 lg:left-1/2 lg:-translate-x-1/2"
        >
          {currentDepth === 1
            ? '関連をさらに表示（depth=2）'
            : '関連を折りたたむ（depth=1）'}
        </button>

        {/* Center article info */}
        <div
          className={`${PANEL} pointer-events-none w-full max-w-sm p-4 lg:pointer-events-auto lg:absolute lg:top-0 lg:right-0`}
        >
          <div className="mb-2 flex items-center gap-2">
            <div
              className="border-tt-text h-3 w-3 rounded-full border-2"
              style={{ backgroundColor: graphNodeColors.center }}
            />
            <h2 className="text-tt-text text-h3">中心記事</h2>
          </div>
          {centerNode && (
            <div className="space-y-1">
              <p className="text-tt-text text-sm font-medium">
                {removeCenterPrefix(centerNode.label)}
              </p>
              <p className="text-xs text-[var(--tt-color-text-muted)]">
                カテゴリ: {centerNode.category} | 品質:{' '}
                {Math.round(centerNode.val)}
              </p>
            </div>
          )}
          <div className="mt-2 border-t border-[var(--tt-color-border)] pt-2">
            <p
              className="text-xs text-[var(--tt-color-text)]"
              data-testid="related-count"
              aria-live="polite"
            >
              関連記事: {relatedCount}件表示
            </p>
          </div>
        </div>

        {/* Legend。lg 以上では見出しの下に開いて置く */}
        <details
          open={legendIsOpen}
          // クリック以外で DOM の開閉が変わったとき（ページ内検索での自動展開など）は state を合わせる。
          // open をプログラムで変えたときにも発火するが、そのときは DOM と state が一致しているので何もしない
          onToggle={(e) => {
            if (e.currentTarget.open !== legendIsOpen) {
              onLegendToggle(e.currentTarget.open);
            }
          }}
          className={`${PANEL} group pointer-events-auto w-full max-w-xs p-4 lg:absolute lg:top-24 lg:left-0`}
        >
          <summary
            className="cursor-pointer list-none [&::-webkit-details-marker]:hidden"
            // ユーザーの開閉はクリックの時点で state に記録し、既定の開閉は止める。toggle イベントは
            // 遅れて届くので、その間に画面幅が変わってもユーザーの操作を取りこぼさない。Enter・Space でも click が届く
            onClick={(e) => {
              const details = e.currentTarget
                .parentElement as HTMLDetailsElement;
              // 外部の開閉（ページ内検索など）がまだ state に届いていなければ、既定の開閉に任せる。
              // 届いていれば既定の開閉は止め、state で開閉する（React の更新と二重に開閉しないため）
              if (details.open === legendIsOpen) {
                e.preventDefault();
              }
              onLegendToggle(!details.open);
            }}
          >
            <h2 className="text-tt-text text-h3 flex items-center gap-2">
              <Network className="h-4 w-4" aria-hidden="true" />
              グラフの見方
              {/* 開け閉めできることを見た目でも示す */}
              <ChevronDown
                className="ml-auto h-4 w-4 transition-transform group-open:rotate-180 motion-reduce:transition-none"
                aria-hidden="true"
              />
            </h2>
          </summary>
          <div className="mt-3 space-y-2 text-xs text-[var(--tt-color-text)]">
            <div className="flex items-start gap-2">
              <div
                className="border-tt-text mt-0.5 h-4 w-4 shrink-0 rounded-full border-2"
                style={{ backgroundColor: graphNodeColors.center }}
              />
              <div>
                <div className="text-tt-text font-medium">
                  中心ノード（大・黄色・白枠）
                </div>
                <div className="text-[var(--tt-color-text-muted)]">
                  現在の記事
                </div>
              </div>
            </div>
            <div className="flex items-start gap-2">
              <div className="mt-0.5 h-3 w-3 shrink-0 rounded-full bg-[var(--tt-color-info-bg)]" />
              <div>
                <div className="font-medium">関連記事（小・色付き）</div>
                <div className="text-[var(--tt-color-text-muted)]">
                  色 = カテゴリ、大きさ = 品質
                </div>
              </div>
            </div>
            <div className="flex items-start gap-2">
              <div className="mt-0.5 h-2 w-2 shrink-0 rounded-full bg-[var(--tt-color-info)]" />
              <div>
                <div className="font-medium">関連記事 第2層（小・暗め）</div>
                <div className="text-[var(--tt-color-text-muted)]">
                  第1層記事に関連
                </div>
              </div>
            </div>
            <div className="flex items-start gap-2">
              <div className="mt-2 h-0.5 w-8 shrink-0 bg-[var(--tt-color-text-muted)]" />
              <div>
                <div className="font-medium">線の太さ = 関連度</div>
                <div className="text-[var(--tt-color-text-muted)]">
                  太いほど関連性が高い
                </div>
              </div>
            </div>
            <div className="flex items-start gap-2">
              <div className="mt-0.5 h-3 w-3 shrink-0 rounded-full border-2 border-[var(--tt-color-positive-border)] bg-[var(--tt-color-info-bg)]" />
              <div>
                <div className="font-medium">枠線の色 = 配信日時</div>
                <div className="text-[var(--tt-color-text-muted)]">
                  緑=1週間以内、橙=1ヶ月以内
                </div>
              </div>
            </div>
            <div className="flex items-start gap-2">
              <div className="mt-0.5 h-3 w-3 shrink-0 rounded-full bg-[var(--tt-color-negative)]" />
              <div>
                <div className="font-medium">NEWバッジ（赤丸）</div>
                <div className="text-[var(--tt-color-text-muted)]">
                  24時間以内に配信
                </div>
              </div>
            </div>
          </div>
          <div className="mt-3 border-t border-[var(--tt-color-border)] pt-3 text-xs text-[var(--tt-color-text-muted)]">
            クリック: 記事を開く | ホバー: 詳細表示
          </div>
        </details>
      </div>

      {/* Hovered node tooltip */}
      {hoveredNode && hoveredNode.id !== centerArticleId && (
        <div className={`${PANEL} absolute bottom-4 left-4 max-w-md p-4`}>
          <h4 className="text-tt-text mb-2 text-sm font-bold">
            {hoveredNode.label}
          </h4>
          {hoveredNode.summary && (
            <p className="mb-2 text-xs text-[var(--tt-color-text)]">
              {hoveredNode.summary.substring(0, 120)}...
            </p>
          )}
          <div className="space-y-1 text-xs">
            <div className="flex items-center gap-2">
              <span className="text-[var(--tt-color-text-muted)]">
                カテゴリ:
              </span>
              <span className="text-tt-text">{hoveredNode.category}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[var(--tt-color-text-muted)]">
                品質スコア:
              </span>
              <span className="text-tt-text">
                {Math.round(hoveredNode.val)}
              </span>
            </div>
            {hoveredNode.primaryTag && (
              <div className="flex items-center gap-2">
                <span className="text-[var(--tt-color-text-muted)]">
                  主要タグ:
                </span>
                <span className="text-tt-text">{hoveredNode.primaryTag}</span>
              </div>
            )}
          </div>
          <p className="mt-2 text-xs text-[var(--tt-color-text-muted)]">
            クリックで記事を開く
          </p>
        </div>
      )}
    </>
  );
}
