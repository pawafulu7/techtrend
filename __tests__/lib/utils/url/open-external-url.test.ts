/**
 * @jest-environment jsdom
 */
import { openExternalUrl } from '@/lib/utils/url/open-external-url';

describe('openExternalUrl', () => {
  let open: jest.SpyInstance;

  beforeEach(() => {
    open = jest.spyOn(window, 'open').mockImplementation(() => null);
  });

  afterEach(() => {
    open.mockRestore();
  });

  it('http(s) の URL を noopener・noreferrer で新しいタブに開く', () => {
    openExternalUrl('https://example.com/article');
    openExternalUrl('http://example.com/article');

    expect(open).toHaveBeenNthCalledWith(1, 'https://example.com/article', '_blank', 'noopener,noreferrer');
    expect(open).toHaveBeenNthCalledWith(2, 'http://example.com/article', '_blank', 'noopener,noreferrer');
  });

  it.each([
    'javascript:alert(document.domain)//https://example.com',
    'JavaScript:alert(1)',
    'data:text/html,<script>alert(1)</script>',
    'vbscript:msgbox(1)',
    'not a url',
    '',
  ])('%s は開かない', (url) => {
    openExternalUrl(url);
    expect(open).not.toHaveBeenCalled();
  });
});
