/**
 * Next.js Imageコンポーネントのモック
 */

import React from 'react';

interface NextImageProps {
  src: string;
  alt: string;
  width?: number | string;
  height?: number | string;
  [key: string]: any;
}

// next/image だけが受け取る props は <img> に渡さない（渡すと React が不明な属性として警告する）
const NextImage = React.forwardRef<HTMLImageElement, NextImageProps>(
  (
    {
      src,
      alt,
      width,
      height,
      fill: _fill,
      unoptimized: _unoptimized,
      preload: _preload,
      priority: _priority,
      placeholder: _placeholder,
      blurDataURL: _blurDataURL,
      quality: _quality,
      loader: _loader,
      overrideSrc: _overrideSrc,
      ...props
    },
    ref
  ) => {
    return (
      <img
        ref={ref}
        src={src}
        alt={alt}
        width={width}
        height={height}
        {...props}
      />
    );
  }
);
NextImage.displayName = 'NextImage';

export default NextImage;
