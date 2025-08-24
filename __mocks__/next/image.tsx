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

const NextImage = ({ src, alt, width, height, ...props }: NextImageProps) => {
  return (
    <img
      src={src}
      alt={alt}
      width={width}
      height={height}
      {...props}
    />
  );
};

export default NextImage;