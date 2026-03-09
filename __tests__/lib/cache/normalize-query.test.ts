import { normalizeQuery } from '@/lib/cache/normalize-query';

describe('normalizeQuery', () => {
  describe('default behavior (dot removal)', () => {
    it('lowercases query', () => {
      expect(normalizeQuery('React Performance')).toBe('react performance');
    });

    it('trims whitespace', () => {
      expect(normalizeQuery('  react  ')).toBe('react');
    });

    it('collapses multiple spaces', () => {
      expect(normalizeQuery('react   performance')).toBe('react performance');
    });

    it('removes punctuation including dots', () => {
      expect(normalizeQuery('v1.0 feature!')).toBe('v10 feature');
    });

    it('removes Japanese punctuation', () => {
      expect(normalizeQuery('React。性能？')).toBe('react性能');
    });

    it('handles empty string', () => {
      expect(normalizeQuery('')).toBe('');
    });

    it('handles whitespace-only string', () => {
      expect(normalizeQuery('   ')).toBe('');
    });
  });

  describe('preserveDot option', () => {
    it('re-normalizes spaces created by punctuation removal', () => {
      expect(normalizeQuery('React ! Performance')).toBe('react performance');
      expect(normalizeQuery('v1.0 ?', { preserveDot: true })).toBe('v1.0');
    });

    it('preserves dots when preserveDot is true', () => {
      expect(normalizeQuery('v1.0 feature!', { preserveDot: true })).toBe(
        'v1.0 feature'
      );
    });

    it('still removes other punctuation', () => {
      expect(
        normalizeQuery('React！v2.1？テスト。', { preserveDot: true })
      ).toBe('reactv2.1テスト');
    });

    it('preserves multiple dots', () => {
      expect(normalizeQuery('v1.0.1 release', { preserveDot: true })).toBe(
        'v1.0.1 release'
      );
    });
  });
});
