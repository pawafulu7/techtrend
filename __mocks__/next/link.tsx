/**
 * Next.js Linkコンポーネントのモック
 */

import React from 'react';

interface NextLinkProps {
  children: React.ReactNode;
  href: string;
  [key: string]: any;
}

// prefetch・replace・scroll などは Link だけが受け取る props なので、<a> には渡さない
// （prefetch={false} を渡すと React が「boolean ではない属性に false」と警告する）
const NextLink = ({
  children,
  href,
  prefetch: _prefetch,
  replace: _replace,
  scroll: _scroll,
  shallow: _shallow,
  passHref: _passHref,
  legacyBehavior: _legacyBehavior,
  locale: _locale,
  onNavigate: _onNavigate,
  as: _as,
  unstable_dynamicOnHover: _unstableDynamicOnHover,
  transitionTypes: _transitionTypes,
  ...props
}: NextLinkProps) => {
  return (
    <a href={href} {...props}>
      {children}
    </a>
  );
};

export default NextLink;
