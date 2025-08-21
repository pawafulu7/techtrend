/**
 * Next.js Linkコンポーネントのモック
 */

import React from 'react';

const NextLink = ({ children, href, ...props }) => {
  return (
    <a href={href} {...props}>
      {children}
    </a>
  );
};

export default NextLink;