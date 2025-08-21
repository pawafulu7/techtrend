/**
 * Next.js Imageコンポーネントのモック
 */

import React from 'react';

const NextImage = ({ src, alt, width, height, ...props }) => {
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