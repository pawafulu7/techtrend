import { TrendsCache } from '@/lib/cache/trends-cache';

describe('TrendsCache analysis keys', () => {
  const cache = new TrendsCache();

  it('keeps the default period and absent/empty tag on the all key', () => {
    expect(cache.generateTrendsKey({})).toBe('analysis:v2:days_30:tag_all');
    expect(cache.generateTrendsKey({ tag: '' })).toBe(
      cache.generateTrendsKey({})
    );
  });

  it('distinguishes the actual tag all from the unfiltered aggregate', () => {
    expect(cache.generateTrendsKey({ days: 7, tag: 'all' })).not.toBe(
      cache.generateTrendsKey({ days: 7 })
    );
  });

  it('bounds long multibyte tag keys and does not embed the tag text', () => {
    const longTag = '長いタグ😀:%'.repeat(2000);
    const key = cache.generateTrendsKey({ days: 7, tag: longTag });
    expect(key).toMatch(/^analysis:v2:days_7:tag_name_[0-9a-f]{64}$/);
    expect(key).toHaveLength(
      cache.generateTrendsKey({ days: 7, tag: 'React' }).length
    );
    expect(key).not.toContain('長いタグ');
  });

  it('keeps input identity and period isolation without changing tag casing', () => {
    const react = cache.generateTrendsKey({ days: 7, tag: 'React' });
    expect(cache.generateTrendsKey({ days: 7, tag: 'React' })).toBe(react);
    expect(cache.generateTrendsKey({ days: 30, tag: 'React' })).not.toBe(react);
    expect(cache.generateTrendsKey({ days: 7, tag: 'Vue' })).not.toBe(react);
    expect(cache.generateTrendsKey({ days: 7, tag: 'react' })).not.toBe(react);
  });
});
