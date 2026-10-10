import { render, screen, fireEvent, within } from '@testing-library/react';
import { Pagination } from '@/app/components/common/pagination';

describe('Pagination', () => {
  it('1ページしか無いときは何も出さない', () => {
    const { container } = render(
      <Pagination currentPage={1} totalPages={1} onPageChange={jest.fn()} />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('nav の名前は既定が「ページ送り」で、label で変えられる', () => {
    const { rerender } = render(
      <Pagination currentPage={1} totalPages={3} onPageChange={jest.fn()} />
    );
    expect(
      screen.getByRole('navigation', { name: 'ページ送り' })
    ).toBeInTheDocument();

    rerender(
      <Pagination
        currentPage={1}
        totalPages={3}
        onPageChange={jest.fn()}
        label="ページ送り（上）"
      />
    );
    expect(
      screen.getByRole('navigation', { name: 'ページ送り（上）' })
    ).toBeInTheDocument();
  });

  it('先頭・末尾・現在の前後だけを出し、省略記号は読み上げない', () => {
    render(
      <Pagination currentPage={5} totalPages={845} onPageChange={jest.fn()} />
    );
    const nav = screen.getByRole('navigation');

    const pageButtons = within(nav)
      .getAllByRole('button')
      .filter((b) => /^\d+$/.test(b.textContent ?? ''))
      .map((b) => b.textContent);
    expect(pageButtons).toEqual(['1', '4', '5', '6', '845']);

    const ellipses = within(nav).getAllByText('...');
    expect(ellipses).toHaveLength(2);
    ellipses.forEach((e) => expect(e).toHaveAttribute('aria-hidden', 'true'));
  });

  it('現在のページだけに aria-current="page" を付ける', () => {
    render(
      <Pagination currentPage={2} totalPages={3} onPageChange={jest.fn()} />
    );
    expect(screen.getByRole('button', { name: '2' })).toHaveAttribute(
      'aria-current',
      'page'
    );
    expect(screen.getByRole('button', { name: '1' })).not.toHaveAttribute(
      'aria-current'
    );
    expect(screen.getByRole('button', { name: '3' })).not.toHaveAttribute(
      'aria-current'
    );
  });

  it('前へ・次へは端で押せず、文字を隠しても名前で見つけられる', () => {
    const { rerender } = render(
      <Pagination currentPage={1} totalPages={3} onPageChange={jest.fn()} />
    );
    expect(screen.getByRole('button', { name: '前へ' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '次へ' })).toBeEnabled();

    rerender(
      <Pagination currentPage={3} totalPages={3} onPageChange={jest.fn()} />
    );
    expect(screen.getByRole('button', { name: '前へ' })).toBeEnabled();
    expect(screen.getByRole('button', { name: '次へ' })).toBeDisabled();
  });

  it('押したページ番号を onPageChange に渡す', () => {
    const onPageChange = jest.fn();
    render(
      <Pagination currentPage={2} totalPages={3} onPageChange={onPageChange} />
    );

    fireEvent.click(screen.getByRole('button', { name: '3' }));
    fireEvent.click(screen.getByRole('button', { name: '前へ' }));

    expect(onPageChange).toHaveBeenNthCalledWith(1, 3);
    expect(onPageChange).toHaveBeenNthCalledWith(2, 1);
  });
});
