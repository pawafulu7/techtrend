/**
 * ホームの一覧を、同じ条件のままリーダーで開くリンク（Issue #704）
 */
import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { useSearchParams } from 'next/navigation';
import { ReaderModeLink } from '@/app/components/common/reader-mode-link';

jest.mock('next/navigation', () => ({
  useSearchParams: jest.fn(),
}));

describe('ReaderModeLink', () => {
  it('一覧の条件を引き継ぎ、一覧の位置（page・returning）は落とす', () => {
    (useSearchParams as jest.Mock).mockReturnValue(
      new URLSearchParams('tags=React&page=3&returning=1&sortBy=qualityScore')
    );
    render(<ReaderModeLink />);

    expect(screen.getByRole('link', { name: 'リーダーで読む' })).toHaveAttribute(
      'href',
      '/reader?tags=React&sortBy=qualityScore'
    );
  });

  it('条件が無ければ /reader を開く', () => {
    (useSearchParams as jest.Mock).mockReturnValue(new URLSearchParams(''));
    render(<ReaderModeLink />);

    expect(screen.getByRole('link', { name: 'リーダーで読む' })).toHaveAttribute(
      'href',
      '/reader'
    );
  });
});
