import { render, screen } from '@testing-library/react';
import { ButtonV2 } from '@/components/ui-v2/button-v2';

/**
 * NOTE: このファイルは意図的に CSS クラス出力を直接アサートする。
 * プロジェクト標準は data-variant / role / aria-* によるアサートだが、
 * ButtonV2 の className マージ（twMerge）は「どのクラスが残り、どれが消えるか」
 * そのものが仕様であり、属性では検証できないための例外。
 * 背景: investigate G-2（`hidden lg:inline-flex` が効かず死にボタンになっていた）
 */
describe('ButtonV2 className merge (twMerge)', () => {
  it('caller の hidden が base の inline-flex を上書きする', () => {
    render(<ButtonV2 className="hidden">押す</ButtonV2>);
    const btn = screen.getByRole('button', { name: '押す' });

    expect(btn.className).toContain('hidden');
    expect(btn.className).not.toContain('inline-flex');
  });

  it('hidden lg:inline-flex を渡すと両方が残る（レスポンシブ出し分けが機能する）', () => {
    render(<ButtonV2 className="hidden lg:inline-flex">フィルター</ButtonV2>);
    const btn = screen.getByRole('button', { name: 'フィルター' });

    // base の inline-flex（breakpoint なし）は hidden に負けて消える
    expect(btn.className).not.toMatch(/(^|\s)inline-flex(\s|$)/);
    expect(btn.className).toContain('hidden');
    expect(btn.className).toContain('lg:inline-flex');
  });

  it('caller の高さ指定が size variant の高さを上書きする', () => {
    render(
      <ButtonV2 size="sm" className="h-11">
        タップ
      </ButtonV2>
    );
    const btn = screen.getByRole('button', { name: 'タップ' });

    expect(btn.className).toContain('h-11');
    // size="sm" の h-8 は消える
    expect(btn.className).not.toMatch(/(^|\s)h-8(\s|$)/);
  });

  it('caller の背景色が variant の背景色を上書きする', () => {
    render(
      <ButtonV2 variant="primary" className="bg-transparent">
        透明
      </ButtonV2>
    );
    const btn = screen.getByRole('button', { name: '透明' });

    expect(btn.className).toContain('bg-transparent');
    expect(btn.className).not.toContain('bg-(--tt-color-primary)');
  });

  it('衝突しないクラスは base と caller の両方が残る', () => {
    render(<ButtonV2 className="relative">両立</ButtonV2>);
    const btn = screen.getByRole('button', { name: '両立' });

    expect(btn.className).toContain('relative');
    expect(btn.className).toContain('inline-flex');
    expect(btn.className).toContain('items-center');
  });

  it('asChild + disabled の cloneElement 経路でも className がマージされる', () => {
    render(
      <ButtonV2 asChild disabled className="hidden">
        <a href="/foo">リンク</a>
      </ButtonV2>
    );
    const link = screen.getByText('リンク');

    expect(link.className).toContain('hidden');
    expect(link.className).not.toContain('inline-flex');
    expect(link).toHaveAttribute('aria-disabled', 'true');
  });

  it('asChild + disabled で子要素側の className が親のクラスを上書きする', () => {
    render(
      <ButtonV2 asChild disabled size="sm">
        <a href="/foo" className="h-11">
          リンク
        </a>
      </ButtonV2>
    );
    const link = screen.getByText('リンク');

    expect(link.className).toContain('h-11');
    expect(link.className).not.toMatch(/(^|\s)h-8(\s|$)/);
  });
});

describe('ButtonV2 既存挙動の回帰', () => {
  it('variant を data 属性で公開する', () => {
    render(<ButtonV2 variant="outline">枠線</ButtonV2>);
    expect(screen.getByRole('button', { name: '枠線' })).toHaveAttribute(
      'data-variant',
      'outline'
    );
  });

  it('loading 中は disabled になる', () => {
    render(<ButtonV2 loading>送信</ButtonV2>);
    expect(screen.getByRole('button')).toBeDisabled();
  });

  it('iconOnly は size を icon 系にマップする', () => {
    render(
      <ButtonV2 size="sm" iconOnly aria-label="閉じる">
        <span>x</span>
      </ButtonV2>
    );
    const btn = screen.getByRole('button', { name: '閉じる' });

    expect(btn.className).toContain('size-8');
  });

  it('type は既定で button（フォーム誤送信の防止）', () => {
    render(<ButtonV2>実行</ButtonV2>);
    expect(screen.getByRole('button', { name: '実行' })).toHaveAttribute(
      'type',
      'button'
    );
  });
});
