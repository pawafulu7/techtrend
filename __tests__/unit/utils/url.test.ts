import { getDomain, isValidUrl, addHttpsIfMissing } from '@/lib/utils/url';

describe('url utils', () => {
  describe('getDomain', () => {
    it('should extract domain from https URL', () => {
      expect(getDomain('https://example.com/path')).toBe('example.com');
    });

    it('should extract domain from http URL', () => {
      expect(getDomain('http://example.com/path')).toBe('example.com');
    });

    it('should remove www prefix', () => {
      expect(getDomain('https://www.example.com/path')).toBe('example.com');
    });

    it('should handle subdomain', () => {
      expect(getDomain('https://blog.example.com/path')).toBe('blog.example.com');
    });

    it('should handle URL with port', () => {
      expect(getDomain('https://example.com:8080/path')).toBe('example.com');
    });

    it('should handle URL with query parameters', () => {
      expect(getDomain('https://example.com/path?param=value')).toBe('example.com');
    });

    it('should handle URL with hash', () => {
      expect(getDomain('https://example.com/path#anchor')).toBe('example.com');
    });

    it('should return empty string for invalid URL', () => {
      expect(getDomain('not a url')).toBe('');
    });

    it('should return empty string for empty input', () => {
      expect(getDomain('')).toBe('');
    });

    it('should handle localhost', () => {
      expect(getDomain('http://localhost:3000')).toBe('localhost');
    });

    it('should handle IP address', () => {
      expect(getDomain('http://192.168.1.1:8080/path')).toBe('192.168.1.1');
    });

    it('should handle international domain names (punycode)', () => {
      // URLコンストラクタは国際化ドメイン名をpunycodeに変換する
      expect(getDomain('https://日本.jp/path')).toBe('xn--wgv71a.jp');
    });
  });

  describe('isValidUrl', () => {
    it('should return true for valid https URL', () => {
      expect(isValidUrl('https://example.com')).toBe(true);
    });

    it('should return true for valid http URL', () => {
      expect(isValidUrl('http://example.com')).toBe(true);
    });

    it('should return true for URL with path', () => {
      expect(isValidUrl('https://example.com/path/to/resource')).toBe(true);
    });

    it('should return true for URL with query parameters', () => {
      expect(isValidUrl('https://example.com?param1=value1&param2=value2')).toBe(true);
    });

    it('should return true for URL with hash', () => {
      expect(isValidUrl('https://example.com#section')).toBe(true);
    });

    it('should return true for URL with port', () => {
      expect(isValidUrl('https://example.com:8080')).toBe(true);
    });

    it('should return true for localhost URL', () => {
      expect(isValidUrl('http://localhost:3000')).toBe(true);
    });

    it('should return true for IP address URL', () => {
      expect(isValidUrl('http://192.168.1.1')).toBe(true);
    });

    it('should return true for file protocol', () => {
      expect(isValidUrl('file:///path/to/file')).toBe(true);
    });

    it('should return true for ftp protocol', () => {
      expect(isValidUrl('ftp://example.com')).toBe(true);
    });

    it('should return false for invalid URL', () => {
      expect(isValidUrl('not a url')).toBe(false);
    });

    it('should return false for empty string', () => {
      expect(isValidUrl('')).toBe(false);
    });

    it('should return false for relative path', () => {
      expect(isValidUrl('/path/to/resource')).toBe(false);
    });

    it('should return false for domain without protocol', () => {
      expect(isValidUrl('example.com')).toBe(false);
    });

    it('should return false for malformed URL', () => {
      expect(isValidUrl('http://')).toBe(false);
    });

    it('should return false for null', () => {
      expect(isValidUrl(null as any)).toBe(false);
    });

    it('should return false for undefined', () => {
      expect(isValidUrl(undefined as any)).toBe(false);
    });
  });

  describe('addHttpsIfMissing', () => {
    it('should add https to URL without protocol', () => {
      expect(addHttpsIfMissing('example.com')).toBe('https://example.com');
    });

    it('should add https to URL with path but no protocol', () => {
      expect(addHttpsIfMissing('example.com/path')).toBe('https://example.com/path');
    });

    it('should not modify URL with https protocol', () => {
      expect(addHttpsIfMissing('https://example.com')).toBe('https://example.com');
    });

    it('should not modify URL with http protocol', () => {
      expect(addHttpsIfMissing('http://example.com')).toBe('http://example.com');
    });

    it('should add https to localhost without protocol', () => {
      expect(addHttpsIfMissing('localhost:3000')).toBe('https://localhost:3000');
    });

    it('should add https to IP address without protocol', () => {
      expect(addHttpsIfMissing('192.168.1.1:8080')).toBe('https://192.168.1.1:8080');
    });

    it('should handle empty string', () => {
      expect(addHttpsIfMissing('')).toBe('https://');
    });

    it('should handle URL with www', () => {
      expect(addHttpsIfMissing('www.example.com')).toBe('https://www.example.com');
    });

    it('should handle URL with subdomain', () => {
      expect(addHttpsIfMissing('blog.example.com')).toBe('https://blog.example.com');
    });

    it('should handle URL with query parameters', () => {
      expect(addHttpsIfMissing('example.com?param=value')).toBe('https://example.com?param=value');
    });

    it('should handle URL with hash', () => {
      expect(addHttpsIfMissing('example.com#section')).toBe('https://example.com#section');
    });

    it('should handle international domain', () => {
      expect(addHttpsIfMissing('日本.jp')).toBe('https://日本.jp');
    });
  });
});