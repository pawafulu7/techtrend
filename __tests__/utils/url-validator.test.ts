import {
  validateUrl,
  isAllowedHost,
  parseAndValidateUrl,
  isUrlFromDomain,
  getDomainFromUrl,
  isTechSource,
  addAllowedHost,
  getAllowedHosts
} from '@/lib/utils/url-validator';

describe('URL Validator', () => {
  describe('validateUrl', () => {
    it('should validate correct URLs', () => {
      expect(validateUrl('https://example.com')).toBe(true);
      expect(validateUrl('http://example.com')).toBe(true);
      expect(validateUrl('https://example.com/path')).toBe(true);
      expect(validateUrl('https://example.com:8080')).toBe(true);
      expect(validateUrl('https://example.com?query=value')).toBe(true);
      expect(validateUrl('https://example.com#anchor')).toBe(true);
    });

    it('should reject invalid URLs', () => {
      expect(validateUrl('')).toBe(false);
      expect(validateUrl('not-a-url')).toBe(false);
      expect(validateUrl('ftp://example.com')).toBe(false);
      expect(validateUrl('javascript:alert(1)')).toBe(false);
      expect(validateUrl('data:text/html,<script>alert(1)</script>')).toBe(false);
      expect(validateUrl('//example.com')).toBe(false);
      expect(validateUrl(null as any)).toBe(false);
      expect(validateUrl(undefined as any)).toBe(false);
    });
  });

  describe('isAllowedHost', () => {
    it('should allow known tech sources', () => {
      expect(isAllowedHost('https://github.com/user/repo')).toBe(true);
      expect(isAllowedHost('https://qiita.com/article')).toBe(true);
      expect(isAllowedHost('https://dev.to/post')).toBe(true);
      expect(isAllowedHost('https://medium.com/story')).toBe(true);
      expect(isAllowedHost('https://zenn.dev/article')).toBe(true);
    });

    it('should allow subdomains of allowed hosts', () => {
      expect(isAllowedHost('https://blog.rust-lang.org')).toBe(true);
      expect(isAllowedHost('https://ai.googleblog.com')).toBe(true);
      expect(isAllowedHost('https://developers.googleblog.com')).toBe(true);
      expect(isAllowedHost('https://engineering.mercari.com')).toBe(true);
    });

    it('should reject unknown hosts', () => {
      expect(isAllowedHost('https://evil.com')).toBe(false);
      expect(isAllowedHost('https://malicious-site.net')).toBe(false);
      expect(isAllowedHost('https://phishing.org')).toBe(false);
    });

    it('should prevent URL manipulation attacks', () => {
      // These should all be rejected even though they contain allowed domains
      expect(isAllowedHost('https://evil.com/github.com')).toBe(false);
      expect(isAllowedHost('https://evil.com?url=github.com')).toBe(false);
      expect(isAllowedHost('https://evil.com#github.com')).toBe(false);
      expect(isAllowedHost('https://github.com.evil.com')).toBe(false);
      expect(isAllowedHost('https://fakegithub.com')).toBe(false);
      expect(isAllowedHost('http://github.com@evil.com')).toBe(false);
    });

    it('should handle edge cases', () => {
      expect(isAllowedHost('')).toBe(false);
      expect(isAllowedHost('not-a-url')).toBe(false);
      expect(isAllowedHost('javascript:alert(1)')).toBe(false);
    });
  });

  describe('parseAndValidateUrl', () => {
    it('should parse valid URLs', () => {
      const url = parseAndValidateUrl('https://example.com/path?query=value#anchor');
      expect(url).not.toBeNull();
      expect(url?.hostname).toBe('example.com');
      expect(url?.pathname).toBe('/path');
      expect(url?.search).toBe('?query=value');
      expect(url?.hash).toBe('#anchor');
    });

    it('should return null for invalid URLs', () => {
      expect(parseAndValidateUrl('')).toBeNull();
      expect(parseAndValidateUrl('not-a-url')).toBeNull();
      expect(parseAndValidateUrl('javascript:alert(1)')).toBeNull();
      expect(parseAndValidateUrl('ftp://example.com')).toBeNull();
    });
  });

  describe('isUrlFromDomain', () => {
    it('should check if URL belongs to domain', () => {
      expect(isUrlFromDomain('https://github.com/user', 'github.com')).toBe(true);
      expect(isUrlFromDomain('https://api.github.com/user', 'github.com')).toBe(true);
      expect(isUrlFromDomain('https://docs.github.com', 'github.com')).toBe(true);
    });

    it('should reject URLs from different domains', () => {
      expect(isUrlFromDomain('https://gitlab.com', 'github.com')).toBe(false);
      expect(isUrlFromDomain('https://github.com.evil.com', 'github.com')).toBe(false);
      expect(isUrlFromDomain('https://fakegithub.com', 'github.com')).toBe(false);
    });

    it('should be case insensitive', () => {
      expect(isUrlFromDomain('https://GITHUB.COM', 'github.com')).toBe(true);
      expect(isUrlFromDomain('https://github.com', 'GITHUB.COM')).toBe(true);
    });

    it('should handle invalid URLs', () => {
      expect(isUrlFromDomain('not-a-url', 'github.com')).toBe(false);
      expect(isUrlFromDomain('', 'github.com')).toBe(false);
    });
  });

  describe('getDomainFromUrl', () => {
    it('should extract domain from URL', () => {
      expect(getDomainFromUrl('https://github.com/user')).toBe('github.com');
      expect(getDomainFromUrl('https://api.github.com/v3')).toBe('api.github.com');
      expect(getDomainFromUrl('http://example.com:8080/path')).toBe('example.com');
    });

    it('should return null for invalid URLs', () => {
      expect(getDomainFromUrl('')).toBeNull();
      expect(getDomainFromUrl('not-a-url')).toBeNull();
      expect(getDomainFromUrl('javascript:alert(1)')).toBeNull();
    });
  });

  describe('isTechSource', () => {
    it('should identify tech sources', () => {
      expect(isTechSource('https://github.com/repo')).toBe(true);
      expect(isTechSource('https://stackoverflow.blog/post')).toBe(true);
      expect(isTechSource('https://dev.to/article')).toBe(true);
      expect(isTechSource('https://aws.amazon.com/blog')).toBe(true);
    });

    it('should reject non-tech sources', () => {
      expect(isTechSource('https://example.com')).toBe(false);
      expect(isTechSource('https://random-blog.net')).toBe(false);
    });
  });

  describe('addAllowedHost', () => {
    const originalHosts = getAllowedHosts();

    afterEach(() => {
      // Reset allowed hosts after each test
      const currentHosts = getAllowedHosts();
      currentHosts.forEach(host => {
        if (!originalHosts.includes(host)) {
          // Note: In real implementation, we'd need a removeAllowedHost function
          // For testing, we're assuming the list is reset between tests
        }
      });
    });

    it('should add new allowed host', () => {
      const testHost = 'test.example.com';
      const initialCount = getAllowedHosts().length;

      addAllowedHost(testHost);
      const newHosts = getAllowedHosts();

      expect(newHosts.length).toBe(initialCount + 1);
      expect(newHosts).toContain(testHost);
      expect(isAllowedHost(`https://${testHost}/path`)).toBe(true);
    });

    it('should not add duplicate hosts', () => {
      const testHost = 'github.com'; // Already in the list
      const initialCount = getAllowedHosts().length;

      addAllowedHost(testHost);

      expect(getAllowedHosts().length).toBe(initialCount);
    });

    it('should normalize host before adding', () => {
      const testHost = 'TEST.EXAMPLE.COM';
      addAllowedHost(testHost);

      expect(getAllowedHosts()).toContain('test.example.com');
    });

    it('should throw error for invalid input', () => {
      expect(() => addAllowedHost('')).toThrow('Invalid host');
      expect(() => addAllowedHost(null as any)).toThrow('Invalid host');
      expect(() => addAllowedHost(undefined as any)).toThrow('Invalid host');
    });
  });

  describe('Security Tests', () => {
    it('should prevent SSRF attacks', () => {
      // These URLs attempt to bypass validation
      const ssrfAttempts = [
        'https://evil.com#github.com',
        'https://evil.com?github.com',
        'https://evil.com/github.com',
        'https://github.com@evil.com',
        'https://github.com.evil.com',
        'https://github.com..evil.com',
        'https://github.com%2eevil.com',
        'https://0x7f.0x0.0x0.0x1', // 127.0.0.1 in hex
        'https://2130706433', // 127.0.0.1 as decimal
        'https://127.0.0.1',
        'https://localhost',
        'https://[::1]', // IPv6 localhost
      ];

      ssrfAttempts.forEach(url => {
        expect(isAllowedHost(url)).toBe(false);
      });
    });

    it('should handle URL encoding attacks', () => {
      const encodedAttacks = [
        'https://evil.com%2fgithub.com',
        'https://evil.com%252fgithub.com',
        'https://evil%2ecom/github.com',
        'https://github%2ecom%2eevil.com',
      ];

      encodedAttacks.forEach(url => {
        expect(isAllowedHost(url)).toBe(false);
      });
    });

    it('should handle international domain names', () => {
      // These should be handled safely
      const idnUrls = [
        'https://xn--fsq.com', // 中.com in punycode
        'https://xn--e1afmkfd.xn--p1ai', // пример.рф in punycode
      ];

      idnUrls.forEach(url => {
        // Should validate as proper URLs but not be in allowed list
        expect(validateUrl(url)).toBe(true);
        expect(isAllowedHost(url)).toBe(false);
      });
    });
  });
});