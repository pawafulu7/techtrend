import { truncateLabel, darkenColor } from '@/lib/utils/graph-helpers';

describe('truncateLabel', () => {
  it('should not truncate short labels', () => {
    expect(truncateLabel('Short', 20)).toBe('Short');
  });

  it('should truncate long labels', () => {
    expect(truncateLabel('Very Long Title That Exceeds Limit', 20)).toBe('Very Long Title That...');
  });

  it('should handle empty string', () => {
    expect(truncateLabel('', 20)).toBe('');
  });
});

describe('darkenColor', () => {
  it('should darken valid hex color', () => {
    const result = darkenColor('#FF0000', 0.8);
    expect(result).toMatch(/^#[0-9A-Fa-f]{6}$/);
    expect(result).not.toBe('#FF0000');
  });

  it('should handle invalid color format', () => {
    expect(darkenColor('invalid', 0.8)).toBe('invalid');
  });
});
