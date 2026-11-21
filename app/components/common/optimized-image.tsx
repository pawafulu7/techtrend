'use client';

import Image from 'next/image';
import { ImageOff } from 'lucide-react';
import { useLayoutEffect, useRef, useState, type SyntheticEvent } from 'react';
import { canOptimizeImage } from '@/lib/articles/thumbnail';
import { useIsHydrated } from '@/app/hooks/use-is-hydrated';
import { cn } from '@/lib/utils';

interface OptimizedImageProps {
  src: string;
  alt: string;
  width?: number;
  height?: number;
  /**
   * 画面の主役の1枚（記事詳細のスライド画像など）。<head> で先読みする。
   * 一覧のように候補が何枚もあるときは使わず、loading・fetchPriority で指定する
   */
  preload?: boolean;
  /** 最初の画面に入る画像は 'eager' にし、HTML を受け取った時点で取り始める（既定は 'lazy'） */
  loading?: 'eager' | 'lazy';
  fetchPriority?: React.ImgHTMLAttributes<HTMLImageElement>['fetchPriority'];
  /**
   * object-fit などのクラス。transition・opacity 系はフェードのためにこの部品が付けるので渡さない
   * （cn の tailwind-merge で、渡した側が消える）
   */
  className?: string;
  sizes?: string;
  fill?: boolean;
  style?: React.CSSProperties;
  /** 元の URL をそのまま出すとき（http・SVG・最適化の失敗後）に外部ホストへ送る Referer の扱い */
  referrerPolicy?: React.HTMLAttributeReferrerPolicy;
  onError?: () => void;
}

/**
 * 画像の読み込みの段階。
 * optimized: /_next/image 経由（表示幅に合わせた WebP）
 * original: 最適化に失敗したので、元の URL をそのまま出す
 * failed: 元の URL でも読めなかったので、代わりの表示を出す
 */
type LoadStage = 'optimized' | 'original' | 'failed';

/** この時間より早く読めた画像（キャッシュにあったもの）は、フェードせずにそのまま出す */
const INSTANT_LOAD_MS = 100;

/**
 * 外部の画像を next/image で出す（Issue #718）
 * - https の画像は /_next/image 経由で、表示幅に合わせた WebP にする（next.config.ts の images）
 * - http・data:・SVG はそのまま出す
 * - 最適化に失敗したら（Hobby の変換枠を超えたときの 402、取得の失敗など）元の URL をそのまま出し、
 *   それも読めなかったら代わりの表示（方眼に「画像なし」のアイコン）を出して onError を呼ぶ
 *
 * 描画（fill のとき）: 読み込み中は枠に方眼と走査線を出し（.thumb-loading）、読めてデコードが
 * 済んだ画像をフェードインする（白い枠に1枚ずつ突然現れるのを避ける）。
 * - サーバーで描いた画像は、ハイドレーションまで隠さない（読み終わっていれば JS を待たずに見え、
 *   隠すと遅く見えるため）。ハイドレーションの時点で寸法が分かっている（読み終わったか、描き始めた）
 *   ものはそのまま見せ、まだ何も届いていないものだけを透明にして、読めたらフェードインする
 * - ハイドレーションの後に作った画像は、読めるまで透明にする。キャッシュからすぐ（100ms 以内に）
 *   読めたものはフェードせずに出す
 * - 透明にするときは効果なしで切り替え、フェードは出るときだけにする（読み込み途中で画像が届いても、
 *   薄くなりかけてから戻るちらつきが起きない）
 */
export function OptimizedImage({
  src,
  alt,
  width = 300,
  height = 200,
  preload = false,
  loading,
  fetchPriority,
  className = '',
  sizes,
  fill = false,
  style,
  referrerPolicy,
  onError,
}: OptimizedImageProps) {
  const [stage, setStage] = useState<LoadStage>('optimized');
  const [prevSrc, setPrevSrc] = useState(src);
  // 表示し終えた画像（src と段階の組）。src や段階が変われば一致しなくなり、読み込み中に戻る
  const [shown, setShown] = useState<{ key: string; instant: boolean } | null>(
    null
  );
  const isHydrated = useIsHydrated();
  const imgRef = useRef<HTMLImageElement>(null);
  const startedAtRef = useRef(0);

  // src が変わったら最初の段階に戻す（useEffect ではなくレンダリング中に導出）
  if (src !== prevSrc) {
    setPrevSrc(src);
    setStage('optimized');
  }

  const displayKey = `${stage}:${src}`;
  const isShown = shown?.key === displayKey;

  useLayoutEffect(() => {
    startedAtRef.current = performance.now();
    // ハイドレーションの後に作った画像は、onLoad（next/image が decode を済ませてから呼ぶ）を待つ
    if (isHydrated) return;
    // サーバーで描いた画像（ハイドレーション中）: 寸法が分かっていれば（読み終わったか、途中まで描けている）
    // 隠さずにそのまま見せる。onLoad は decode の後なので、待つ間に透明にすると描けている画像が一度消える。
    // complete ではなく naturalWidth で見るのは、失敗した画像も complete になるため
    const img = imgRef.current;
    if (img && img.naturalWidth > 0) {
      setShown({ key: displayKey, instant: true });
    }
  }, [displayKey, isHydrated]);

  const handleLoad = (event: SyntheticEvent<HTMLImageElement>) => {
    // 前の画像（src や段階が変わる前の要素）の通知は無視する。next/image は decode の後に最新の onLoad を
    // 呼び、どの画像の通知かを確かめないので、読めていない新しい画像を表示済みにしてしまう
    if (event.currentTarget !== imgRef.current) return;
    const instant = performance.now() - startedAtRef.current < INSTANT_LOAD_MS;
    setShown((prev) =>
      prev?.key === displayKey ? prev : { key: displayKey, instant }
    );
  };

  const handleError = (event: SyntheticEvent<HTMLImageElement>) => {
    // 失敗したのが /_next/image なら、元の URL で読み直す。stage ではなく実際の src で判定するのは、
    // next/image が自分の判断で unoptimized にしたとき（.svg など）に読み直しが空振りしないようにするため
    const failedViaOptimizer = (
      event.currentTarget.getAttribute('src') ?? ''
    ).includes('/_next/image');
    if (failedViaOptimizer && stage === 'optimized') {
      setStage('original');
      return;
    }
    if (stage !== 'failed') {
      setStage('failed');
      onError?.();
    }
  };

  if (stage === 'failed') {
    // 代わりの表示。明るい灰色の画像を出すとダークモードで白く浮くので、テーマの方眼にアイコンを置く
    return (
      <span
        role={alt ? 'img' : undefined}
        aria-label={alt || undefined}
        aria-hidden={alt ? undefined : true}
        data-testid="image-fallback"
        className={cn(
          'observation-grid items-center justify-center text-(--tt-color-text-muted)',
          fill ? 'absolute inset-0 flex' : 'inline-flex'
        )}
        style={fill ? style : { width, height, ...style }}
      >
        <ImageOff className="h-5 w-5" aria-hidden="true" />
      </span>
    );
  }

  // 透明にするのはハイドレーションの後だけ（サーバーの HTML と食い違わせない）。読み込み中の枠は fill の
  // ときしか描かないので、fill でない画像は隠さない（隠すと読めるまで何も見えない）
  const hidden = fill && isHydrated && !isShown;
  const instant = isShown && shown?.instant === true;
  const unoptimized = !canOptimizeImage(src) || stage !== 'optimized';

  // alt は spread に入れず明示する（jsx-a11y/alt-text が spread の中を見ないため）。
  // quality は渡さない。next.config.ts の qualities は [75] だけで、ほかの値は 400 になる。
  // preload と loading は一緒に渡さない（next/image は preload と loading='lazy' の組で例外を投げる）
  const shared = {
    ref: imgRef,
    src,
    preload,
    loading: preload ? undefined : (loading ?? 'lazy'),
    fetchPriority,
    className: cn(
      className,
      hidden || instant
        ? 'transition-none'
        : 'transition-opacity duration-200 ease-out',
      hidden && 'opacity-0'
    ),
    style,
    referrerPolicy,
    unoptimized,
    onLoad: handleLoad,
    onError: handleError,
  };

  if (fill) {
    return (
      <>
        {/* 読み込み中の枠。画像の後ろに置き、画像がほぼ出そろってから消す（globals.css の .thumb-loading） */}
        <span
          aria-hidden="true"
          data-done={isShown || undefined}
          className="thumb-loading pointer-events-none absolute inset-0"
        />
        {/* 読み込みの段階ごとに要素を分ける。使い回すと、前の画像の decode の完了が新しい画像に届く */}
        <Image
          key={displayKey}
          {...shared}
          alt={alt}
          fill
          sizes={
            sizes || '(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw'
          }
        />
      </>
    );
  }

  return (
    <Image
      key={displayKey}
      {...shared}
      alt={alt}
      width={width}
      height={height}
      sizes={sizes || `(max-width: 768px) 100vw, ${width}px`}
    />
  );
}
