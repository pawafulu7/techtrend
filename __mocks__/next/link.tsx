/**
 * Next.js Linkコンポーネントのモック
 */

import React from 'react';

interface NextLinkProps {
  children: React.ReactNode;
  href: string;
  [key: string]: any;
}

const NextLink = ({ children, href, ...props }: NextLinkProps) => {
  return (
    <a href={href} {...props}>
      {children}
    </a>
  );
};

export default NextLink;