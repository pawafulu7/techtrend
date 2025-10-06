import {
  evaluateQuality,
  isHighQuality,
  isMinimumViable,
} from '@/lib/enrichers/strategies/quality';

describe('Quality evaluation', () => {
  describe('evaluateQuality', () => {
    it('should calculate quality metrics correctly', () => {
      const content = 'This is a test. Another sentence. Third one!';
      const metrics = evaluateQuality(content);

      expect(metrics.length).toBe(content.length);
      expect(metrics.sentences).toBe(3);
      expect(metrics.whitespaceRatio).toBeGreaterThan(0);
      expect(metrics.whitespaceRatio).toBeLessThan(1);
      expect(metrics.avgSentenceLength).toBeGreaterThan(0);
    });

    it('should handle empty content', () => {
      const metrics = evaluateQuality('');

      expect(metrics.length).toBe(0);
      expect(metrics.sentences).toBe(0);
      expect(metrics.avgSentenceLength).toBe(0);
    });

    it('should count sentences correctly', () => {
      const content = 'First! Second? Third.';
      const metrics = evaluateQuality(content);

      expect(metrics.sentences).toBe(3);
    });
  });

  describe('isHighQuality', () => {
    it('should accept 400+ chars with high density', () => {
      const highQuality = 'This is a high quality article. ' + 'Lorem ipsum dolor sit amet. '.repeat(15);
      const result = isHighQuality(highQuality);

      expect(result).toBe(true);
      expect(highQuality.length).toBeGreaterThan(400);
    });

    it('should accept 250+ chars with 2+ sentences', () => {
      const mediumQuality = 'This is a medium quality article. ' + 'Another sentence here. '.repeat(6);
      const result = isHighQuality(mediumQuality);

      expect(result).toBe(true);
      expect(mediumQuality.length).toBeGreaterThan(250);
    });

    it('should reject boilerplate text', () => {
      const boilerplate = '                           '.repeat(20);
      const result = isHighQuality(boilerplate);

      expect(result).toBe(false);
    });

    it('should reject short content', () => {
      const short = 'Too short.';
      const result = isHighQuality(short);

      expect(result).toBe(false);
    });

    it('should reject content without enough sentences', () => {
      const oneSentence = 'This is just one sentence';
      const result = isHighQuality(oneSentence);

      expect(result).toBe(false);
    });
  });

  describe('isMinimumViable', () => {
    it('should accept content >= 50 chars', () => {
      const content = 'This is exactly fifty characters in this string!!';
      const result = isMinimumViable(content);

      expect(content.length).toBeGreaterThanOrEqual(50);
      expect(result).toBe(true);
    });

    it('should reject content < 50 chars', () => {
      const content = 'Short';
      const result = isMinimumViable(content);

      expect(content.length).toBeLessThan(50);
      expect(result).toBe(false);
    });

    it('should handle empty content', () => {
      const result = isMinimumViable('');

      expect(result).toBe(false);
    });
  });
});
