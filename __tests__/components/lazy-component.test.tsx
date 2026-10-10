import { render, screen, act } from '@testing-library/react';
import { createLazyComponent } from '@/app/components/common/lazy-component';

const Loaded = ({ label }: { label: string }) => <div>loaded {label}</div>;
type Module = { default: typeof Loaded };

function deferred() {
  let resolve!: (mod: Module) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<Module>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const fallbacks = {
  fallback: <span>loading…</span>,
  errorFallback: <span>failed</span>,
};

describe('createLazyComponent', () => {
  it('shows the fallback until the module arrives, then renders the component', async () => {
    const d = deferred();
    const { Component } = createLazyComponent(() => d.promise);

    render(
      <>
        <button type="button">sibling</button>
        <Component label="a" {...fallbacks} />
      </>
    );

    expect(screen.getByText('loading…')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'sibling' })).toBeVisible();

    await act(async () => {
      d.resolve({ default: Loaded });
    });

    expect(screen.getByText('loaded a')).toBeInTheDocument();
    expect(screen.queryByText('loading…')).not.toBeInTheDocument();
  });

  it('renders the component on the first render when it was preloaded', async () => {
    const loader = jest.fn(() => Promise.resolve({ default: Loaded }));
    const { Component, preload } = createLazyComponent(loader);

    preload();
    await act(async () => {});

    render(<Component label="b" {...fallbacks} />);

    expect(screen.getByText('loaded b')).toBeInTheDocument();
    expect(screen.queryByText('loading…')).not.toBeInTheDocument();
    expect(loader).toHaveBeenCalledTimes(1);
  });

  it('shows the error fallback when loading fails, and loads again when mounted again', async () => {
    const loader = jest
      .fn<Promise<Module>, []>()
      .mockRejectedValueOnce(new Error('chunk load failed'))
      .mockResolvedValueOnce({ default: Loaded });
    const { Component } = createLazyComponent(loader);
    const ui = <Component label="c" {...fallbacks} />;

    const { unmount } = render(ui);
    expect(await screen.findByText('failed')).toBeInTheDocument();

    unmount();
    render(ui);
    expect(await screen.findByText('loaded c')).toBeInTheDocument();
    expect(loader).toHaveBeenCalledTimes(2);
  });

  it('swallows a failed preload and loads again when rendered', async () => {
    const loader = jest
      .fn<Promise<Module>, []>()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce({ default: Loaded });
    const { Component, preload } = createLazyComponent(loader);

    preload();
    await act(async () => {});

    render(<Component label="d" {...fallbacks} />);
    expect(await screen.findByText('loaded d')).toBeInTheDocument();
    expect(loader).toHaveBeenCalledTimes(2);
  });
});
