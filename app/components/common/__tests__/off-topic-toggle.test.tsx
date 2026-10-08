import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import { OffTopicToggle } from '@/app/components/common/off-topic-toggle';

const push = jest.fn();
let currentSearch = '';

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
  usePathname: () => '/reader',
  useSearchParams: () => new URLSearchParams(currentSearch),
}));

describe('OffTopicToggle', () => {
  beforeEach(() => {
    push.mockClear();
  });

  it('既定はオフで、オンにすると includeOffTopic=true を付け、ページと選択中の記事を外す', async () => {
    currentSearch = 'sortBy=publishedAt&page=3&article=a1';
    render(<OffTopicToggle />);

    const toggle = screen.getByRole('switch', {
      name: '技術以外の記事も表示',
    });
    expect(toggle).not.toBeChecked();

    await userEvent.click(toggle);

    expect(push).toHaveBeenCalledWith(
      '/reader?sortBy=publishedAt&includeOffTopic=true',
      { scroll: false }
    );
  });

  it('オンの状態からオフにすると includeOffTopic を外す', async () => {
    currentSearch = 'includeOffTopic=true';
    render(<OffTopicToggle />);

    const toggle = screen.getByRole('switch', {
      name: '技術以外の記事も表示',
    });
    expect(toggle).toBeChecked();

    await userEvent.click(toggle);

    expect(push).toHaveBeenCalledWith('/reader', { scroll: false });
  });
});
