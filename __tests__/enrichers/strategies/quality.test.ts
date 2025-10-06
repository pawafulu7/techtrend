import {
  evaluateQuality,
  isHighQuality,
  isMinimumViable,
} from '@/lib/enrichers/strategies/quality';

describe('Quality evaluation', () => {
  describe('evaluateQuality', () => {
    it('should calculate quality metrics correctly', () => {
      const content = 'This is a test sentence here. Another sentence with more content. Third one with enough length!';
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
      const content = 'First sentence with enough length! Second sentence here? Third sentence also long enough.';
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
      const mediumQuality = 'This is the first sentence with enough content here for testing purposes. This is the second sentence also with sufficient length for quality check and validation. And here is more text to ensure we exceed the minimum character threshold that is required for this comprehensive quality test case.';
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

    it('should accept exactly 250 chars with 2 sentences', () => {
      const exactly250 = 'This is the first sentence with sufficient content to be counted properly in our quality evaluation system here. This is the second sentence which also has enough length for our minimum threshold requirement and completes the test case successfully now.';
      const result = isHighQuality(exactly250);

      expect(exactly250.length).toBe(250);
      expect(result).toBe(true);
    });

    it('should accept exactly 400 chars with high density', () => {
      const exactly400 = 'This is a comprehensive test sentence with substantial content for quality evaluation purposes and testing the high quality threshold boundary condition here today. Another sentence follows with additional meaningful content to ensure proper validation of our quality gates and metrics calculation system implementation. Third sentence adds even more context and information to reach the exact character count target while maintaining text density below threshold. Final text here completes.';
      const result = isHighQuality(exactly400);

      expect(exactly400.length).toBe(400);
      expect(result).toBe(true);
    });
  });

  describe('isMinimumViable', () => {
    it('should accept content >= 50 chars', () => {
      const content = 'This is exactly fifty characters for testing now!';
      const result = isMinimumViable(content);

      expect(content.length).toBe(50);
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
