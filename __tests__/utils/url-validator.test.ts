import {
  isUrlFromDomain,
  getDomainFromUrl,
  isHttpsUrl,
  isValidUrl,
  getUrlWithoutParams
} from '@/lib/utils/url-validator';

describe('URL Validator', () => {
  describe('isUrlFromDomain', () => {
    it('should correctly identify domain matches', () => {
      // Exact match
      expect(isUrlFromDomain('https://github.com/repo', 'github.com')).toBe(true);
      expect(isUrlFromDomain('http://github.com', 'github.com')).toBe(true);

      // With www
      expect(isUrlFromDomain('https://www.github.com', 'github.com')).toBe(true);

      // Subdomain
      expect(isUrlFromDomain('https://api.github.com', 'github.com')).toBe(true);
      expect(isUrlFromDomain('https://gist.github.com', 'github.com')).toBe(true);

      // Should not match
      expect(isUrlFromDomain('https://evil.com/github.com', 'github.com')).toBe(false);
      expect(isUrlFromDomain('https://github.com.evil.com', 'github.com')).toBe(false);
      expect(isUrlFromDomain('https://notgithub.com', 'github.com')).toBe(false);

      // Invalid URLs
      expect(isUrlFromDomain('not-a-url', 'github.com')).toBe(false);
      expect(isUrlFromDomain('', 'github.com')).toBe(false);
    });

    it('should be case insensitive', () => {
      expect(isUrlFromDomain('https://GitHub.com', 'github.com')).toBe(true);
      expect(isUrlFromDomain('https://github.com', 'GitHub.com')).toBe(true);
      expect(isUrlFromDomain('https://GITHUB.COM', 'github.com')).toBe(true);
    });
  });

  describe('getDomainFromUrl', () => {
    it('should extract domain from valid URLs', () => {
      expect(getDomainFromUrl('https://github.com/repo')).toBe('github.com');
      expect(getDomainFromUrl('http://www.example.com')).toBe('example.com');
      expect(getDomainFromUrl('https://api.github.com/v3')).toBe('api.github.com');
      expect(getDomainFromUrl('https://example.com:8080/path')).toBe('example.com');
    });

    it('should return null for invalid URLs', () => {
      expect(getDomainFromUrl('not-a-url')).toBe(null);
      expect(getDomainFromUrl('')).toBe(null);
      expect(getDomainFromUrl('http://')).toBe(null);
    });
  });

  describe('isHttpsUrl', () => {
    it('should correctly identify HTTPS URLs', () => {
      expect(isHttpsUrl('https://example.com')).toBe(true);
      expect(isHttpsUrl('https://www.example.com/path')).toBe(true);
      expect(isHttpsUrl('HTTPS://EXAMPLE.COM')).toBe(true);
    });

    it('should return false for non-HTTPS URLs', () => {
      expect(isHttpsUrl('http://example.com')).toBe(false);
      expect(isHttpsUrl('ftp://example.com')).toBe(false);
      expect(isHttpsUrl('ws://example.com')).toBe(false);
    });

    it('should return false for invalid URLs', () => {
      expect(isHttpsUrl('not-a-url')).toBe(false);
      expect(isHttpsUrl('')).toBe(false);
    });
  });

  describe('isValidUrl', () => {
    it('should validate correct URLs', () => {
      expect(isValidUrl('https://example.com')).toBe(true);
      expect(isValidUrl('http://example.com')).toBe(true);
      expect(isValidUrl('https://example.com/path')).toBe(true);
      expect(isValidUrl('https://example.com:8080')).toBe(true);
      expect(isValidUrl('https://example.com?query=value')).toBe(true);
      expect(isValidUrl('https://example.com#anchor')).toBe(true);
      expect(isValidUrl('ftp://example.com')).toBe(true);
    });

    it('should return false for invalid URLs', () => {
      expect(isValidUrl('not a url')).toBe(false);
      expect(isValidUrl('example.com')).toBe(false);
      expect(isValidUrl('')).toBe(false);
      expect(isValidUrl('http://')).toBe(false);
      expect(isValidUrl('://example.com')).toBe(false);
    });
  });

  describe('getUrlWithoutParams', () => {
    it('should remove query parameters', () => {
      expect(getUrlWithoutParams('https://example.com/path?query=value&other=123')).toBe('https://example.com/path');
      expect(getUrlWithoutParams('http://example.com?query=value')).toBe('http://example.com/');
    });

    it('should preserve path', () => {
      expect(getUrlWithoutParams('https://example.com/path/to/resource')).toBe('https://example.com/path/to/resource');
    });

    it('should remove hash/anchor', () => {
      expect(getUrlWithoutParams('https://example.com/path#section')).toBe('https://example.com/path');
      expect(getUrlWithoutParams('https://example.com#top')).toBe('https://example.com/');
    });

    it('should handle URLs without params', () => {
      expect(getUrlWithoutParams('https://example.com')).toBe('https://example.com/');
      expect(getUrlWithoutParams('https://example.com/path')).toBe('https://example.com/path');
    });

    it('should return null for invalid URLs', () => {
      expect(getUrlWithoutParams('not-a-url')).toBe(null);
      expect(getUrlWithoutParams('')).toBe(null);
    });
  });
});