import {
  isDeletedContent,
  validateContentQuality,
  isQiitaUrl,
  detectArticleType,
  sanitizeContent
} from '@/lib/utils/content-validator';

describe('content-validator', () => {
  describe('isDeletedContent', () => {
    it('should detect English deletion messages', () => {
      expect(isDeletedContent('Deleted articles cannot be recovered')).toBe(true);
      expect(isDeletedContent('This article has been deleted')).toBe(true);
      expect(isDeletedContent('This post has been deleted')).toBe(true);
      expect(isDeletedContent('Article not found')).toBe(true);
      expect(isDeletedContent('Post not found')).toBe(true);
      expect(isDeletedContent('This content is no longer available')).toBe(true);
    });

    it('should detect Japanese deletion messages', () => {
      expect(isDeletedContent('記事は削除されました')).toBe(true);
      expect(isDeletedContent('この記事は削除されています')).toBe(true);
      expect(isDeletedContent('削除された記事')).toBe(true);
      expect(isDeletedContent('記事が見つかりません')).toBe(true);
      expect(isDeletedContent('ページが見つかりません')).toBe(true);
      expect(isDeletedContent('コンテンツは利用できません')).toBe(true);
    });

    it('should detect mixed case deletion messages', () => {
      expect(isDeletedContent('DELETED ARTICLES CANNOT BE RECOVERED')).toBe(true);
      expect(isDeletedContent('This Article Has Been Deleted')).toBe(true);
    });

    it('should not detect normal content', () => {
      expect(isDeletedContent('This is a normal article about JavaScript')).toBe(false);
      expect(isDeletedContent('ReactとTypeScriptを使ったWebアプリケーション開発')).toBe(false);
    });

    it('should handle null and undefined', () => {
      expect(isDeletedContent(null)).toBe(false);
      expect(isDeletedContent(undefined)).toBe(false);
      expect(isDeletedContent('')).toBe(false);
    });
  });

  describe('validateContentQuality', () => {
    it('should validate normal content', () => {
      const content = 'This is a normal article about JavaScript with enough content to be meaningful. It contains various technical details and explanations.';
      const result = validateContentQuality(content);
      expect(result.isValid).toBe(true);
      expect(result.issues).toHaveLength(0);
    });

    it('should detect empty content', () => {
      const result = validateContentQuality('');
      expect(result.isValid).toBe(false);
      expect(result.issues).toContain('コンテンツが空です');
    });

    it('should detect deleted content', () => {
      const result = validateContentQuality('Deleted articles cannot be recovered');
      expect(result.isValid).toBe(false);
      expect(result.issues).toContain('削除メッセージが検出されました');
    });

    it('should detect short content', () => {
      const result = validateContentQuality('Too short');
      expect(result.isValid).toBe(false);
      expect(result.issues.some(issue => issue.includes('コンテンツが短すぎます'))).toBe(true);
    });

    it('should detect error messages', () => {
      const result = validateContentQuality('404 Not Found - The page you are looking for does not exist');
      expect(result.isValid).toBe(false);
      expect(result.issues.some(issue => issue.includes('404 not found'))).toBe(true);
    });

    it('should detect placeholder text', () => {
      const result = validateContentQuality('Lorem ipsum dolor sit amet, consectetur adipiscing elit');
      expect(result.isValid).toBe(false);
      expect(result.issues.some(issue => issue.includes('lorem ipsum'))).toBe(true);
    });
  });

  describe('isQiitaUrl', () => {
    it('should detect Qiita URLs', () => {
      expect(isQiitaUrl('https://qiita.com/user/items/abc123')).toBe(true);
      expect(isQiitaUrl('http://qiita.com/user/items/xyz456')).toBe(true);
    });

    it('should not detect non-Qiita URLs', () => {
      expect(isQiitaUrl('https://zenn.dev/article')).toBe(false);
      expect(isQiitaUrl('https://dev.to/post')).toBe(false);
      expect(isQiitaUrl('https://qiita.com/about')).toBe(false); // Qiitaだがitemsなし
    });
  });

  describe('detectArticleType', () => {
    it('should detect various article types', () => {
      expect(detectArticleType('https://qiita.com/user/items/abc')).toBe('qiita');
      expect(detectArticleType('https://zenn.dev/user/articles/xyz')).toBe('zenn');
      expect(detectArticleType('https://dev.to/user/post')).toBe('devto');
      expect(detectArticleType('https://speakerdeck.com/user/presentation')).toBe('speakerdeck');
      expect(detectArticleType('https://github.com/user/repo')).toBe('github');
      expect(detectArticleType('https://medium.com/@user/article')).toBe('medium');
      expect(detectArticleType('https://note.com/user/n/article')).toBe('note');
      expect(detectArticleType('https://example.com/article')).toBe('other');
    });
  });

  describe('sanitizeContent', () => {
    it('should normalize line breaks', () => {
      const content = 'Line 1\r\nLine 2\r\nLine 3';
      expect(sanitizeContent(content)).toBe('Line 1\nLine 2\nLine 3');
    });

    it('should remove excessive line breaks', () => {
      const content = 'Line 1\n\n\n\nLine 2';
      expect(sanitizeContent(content)).toBe('Line 1\n\nLine 2');
    });

    it('should trim whitespace', () => {
      const content = '  Content  ';
      expect(sanitizeContent(content)).toBe('Content');
    });

    it('should convert tabs to spaces', () => {
      const content = 'Code\tindented';
      expect(sanitizeContent(content)).toBe('Code  indented');
    });
  });
});