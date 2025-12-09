import { renderHook } from '@testing-library/react';
import { useProfileCompletion } from '@/hooks/useProfileCompletion';

describe('useProfileCompletion', () => {
  describe('percentage calculation', () => {
    it('returns 0% when profileData is null', () => {
      const { result } = renderHook(() => useProfileCompletion(null));
      expect(result.current.percentage).toBe(0);
      expect(result.current.isLowCompletion).toBe(true);
      expect(result.current.message).toBe('Start filling your profile');
    });

    it('returns 0% when profileData is undefined', () => {
      const { result } = renderHook(() => useProfileCompletion(undefined));
      expect(result.current.percentage).toBe(0);
    });

    it('returns 25% when only name is filled', () => {
      const { result } = renderHook(() =>
        useProfileCompletion({ name: 'John Doe' })
      );
      expect(result.current.percentage).toBe(25);
      expect(result.current.completedFields).toContain('Display name');
    });

    it('returns 45% when name and bio are filled', () => {
      const { result } = renderHook(() =>
        useProfileCompletion({
          name: 'John Doe',
          bio: 'Software developer',
        })
      );
      expect(result.current.percentage).toBe(45); // 25 + 20
    });

    it('returns 65% when name, bio, and image are filled', () => {
      const { result } = renderHook(() =>
        useProfileCompletion({
          name: 'John Doe',
          bio: 'Software developer',
          image: 'https://example.com/avatar.jpg',
        })
      );
      expect(result.current.percentage).toBe(65); // 25 + 20 + 20
    });

    it('returns 100% when all fields are filled', () => {
      const { result } = renderHook(() =>
        useProfileCompletion({
          name: 'John Doe',
          bio: 'Software developer',
          image: 'https://example.com/avatar.jpg',
          website: 'https://johndoe.com',
          twitter: '@johndoe',
          github: 'johndoe',
        })
      );
      expect(result.current.percentage).toBe(100);
      expect(result.current.isLowCompletion).toBe(false);
      expect(result.current.message).toBe('Complete!');
    });
  });

  describe('field tracking', () => {
    it('tracks completed fields correctly', () => {
      const { result } = renderHook(() =>
        useProfileCompletion({
          name: 'John',
          github: 'johndoe',
        })
      );
      expect(result.current.completedFields).toEqual(['Display name', 'GitHub']);
      expect(result.current.incompleteFields).toEqual([
        'Bio',
        'Profile image',
        'Website',
        'Twitter',
      ]);
    });

    it('treats empty string as incomplete', () => {
      const { result } = renderHook(() =>
        useProfileCompletion({
          name: 'John',
          bio: '',
        })
      );
      expect(result.current.completedFields).toContain('Display name');
      expect(result.current.incompleteFields).toContain('Bio');
    });

    it('treats null as incomplete', () => {
      const { result } = renderHook(() =>
        useProfileCompletion({
          name: 'John',
          bio: null,
        })
      );
      expect(result.current.incompleteFields).toContain('Bio');
    });
  });

  describe('message generation', () => {
    it('returns "Get started" for < 40%', () => {
      const { result } = renderHook(() =>
        useProfileCompletion({ name: 'John' }) // 25%
      );
      expect(result.current.message).toBe('Get started');
    });

    it('returns "Good start" for 40-59%', () => {
      const { result } = renderHook(() =>
        useProfileCompletion({
          name: 'John',
          bio: 'Developer',
        }) // 45%
      );
      expect(result.current.message).toBe('Good start');
    });

    it('returns "Keep going!" for 60-79%', () => {
      const { result } = renderHook(() =>
        useProfileCompletion({
          name: 'John',
          bio: 'Developer',
          image: 'https://example.com/avatar.jpg',
        }) // 65%
      );
      expect(result.current.message).toBe('Keep going!');
    });

    it('returns "Almost there!" for 80-99%', () => {
      const { result } = renderHook(() =>
        useProfileCompletion({
          name: 'John',
          bio: 'Developer',
          image: 'https://example.com/avatar.jpg',
          website: 'https://example.com',
        }) // 80%
      );
      expect(result.current.message).toBe('Almost there!');
    });

    it('returns "Complete!" for 100%', () => {
      const { result } = renderHook(() =>
        useProfileCompletion({
          name: 'John',
          bio: 'Developer',
          image: 'https://example.com/avatar.jpg',
          website: 'https://example.com',
          twitter: '@john',
          github: 'john',
        })
      );
      expect(result.current.message).toBe('Complete!');
    });
  });

  describe('isLowCompletion threshold', () => {
    it('returns true when percentage < 60', () => {
      const { result } = renderHook(() =>
        useProfileCompletion({
          name: 'John',
          bio: 'Developer',
        }) // 45%
      );
      expect(result.current.isLowCompletion).toBe(true);
    });

    it('returns false when percentage >= 60', () => {
      const { result } = renderHook(() =>
        useProfileCompletion({
          name: 'John',
          bio: 'Developer',
          image: 'https://example.com/avatar.jpg',
        }) // 65%
      );
      expect(result.current.isLowCompletion).toBe(false);
    });

    it('returns false at exactly 60%', () => {
      // 60% = name(25) + bio(20) + website(15) = 60
      const { result } = renderHook(() =>
        useProfileCompletion({
          name: 'John',
          bio: 'Developer',
          website: 'https://example.com',
        })
      );
      expect(result.current.percentage).toBe(60);
      expect(result.current.isLowCompletion).toBe(false);
    });
  });

  describe('memoization', () => {
    it('returns same reference for same input', () => {
      const profileData = { name: 'John' };
      const { result, rerender } = renderHook(
        ({ data }) => useProfileCompletion(data),
        { initialProps: { data: profileData } }
      );

      const firstResult = result.current;
      rerender({ data: profileData });

      expect(result.current).toBe(firstResult);
    });

    it('returns new reference when input changes', () => {
      const { result, rerender } = renderHook(
        ({ data }) => useProfileCompletion(data),
        { initialProps: { data: { name: 'John' } } }
      );

      const firstResult = result.current;
      rerender({ data: { name: 'Jane' } });

      expect(result.current).not.toBe(firstResult);
    });
  });
});
