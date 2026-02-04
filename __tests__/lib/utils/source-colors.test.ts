import { getSourceColor } from '@/lib/utils/source-colors';

describe('getSourceColor', () => {
  // New sources that need color mappings
  const newSources = [
    // Foreign Tech (Big Tech)
    'Netflix TechBlog',
    'Meta Engineering',
    'Spotify Engineering',
    'Pinterest Engineering',
    'Discord Engineering',
    'Slack Engineering',
    'Stripe Engineering',
    'GitHub Blog',
    'Medium Engineering',
    'Mozilla Hacks',
    // AI/ML Sources
    'Claude Blog',
    'OpenAI Blog',
    'Hugging Face Blog',
    'Hugging Face Papers',
    'Google AI Blog',
    'Google Developers Blog',
    'DeepMind Blog',
    'NVIDIA Developer Blog',
    // Infrastructure/Cloud
    'Cloudflare Blog',
    'CNCF Blog',
    'Kubernetes Blog',
    'The New Stack',
    // Frontend/Web
    'Chrome Developers',
    // Language/Runtime
    'Go Blog',
    'Rust Blog',
    // Japanese Company Blogs
    'freee Developers Hub',
    'CyberAgent Developers Blog',
    'DeNA Engineering',
    'SmartHR Tech Blog',
    'LY Corporation Tech Blog',
    'GMO Developers',
    'Sansan Builders Box',
    'Mercari Engineering',
    'ZOZO TECH BLOG',
    'Money Forward Developers Blog',
    'Hatena Developer Blog',
    'Cookpad Tech Life',
    'ペパボテックブログ',
    '企業技術ブログ',
    // DevelopersIO
    'DevelopersIO AWS',
    'DevelopersIO Security',
    'DevelopersIO AI',
    'DevelopersIO Claude',
    'DevelopersIO MCP',
    // Other
    'Zenn AI',
    'Qiita AI',
    'arXiv AI',
    'Corporate Tech Blog',
  ];

  describe('new source color mappings', () => {
    test.each(newSources)(
      'should return non-gray color for %s',
      (sourceName) => {
        const color = getSourceColor(sourceName);
        expect(color.borderLeft).not.toContain('gray');
        expect(color.dot).not.toContain('gray');
      }
    );
  });

  describe('existing sources', () => {
    const existingSources = [
      'Qiita',
      'Zenn',
      'はてなブックマーク',
      'Dev.to',
      'Publickey',
      'Hacker News',
    ];

    test.each(existingSources)(
      'should still return correct color for %s',
      (sourceName) => {
        const color = getSourceColor(sourceName);
        expect(color.borderLeft).not.toContain('gray');
        expect(color.dot).not.toContain('gray');
      }
    );
  });

  describe('unknown sources', () => {
    it('should return gray for unknown sources', () => {
      const color = getSourceColor('Unknown Source XYZ');
      expect(color.borderLeft).toContain('gray');
      expect(color.dot).toContain('gray');
    });
  });

  describe('color theme structure', () => {
    it('should return all required properties', () => {
      const color = getSourceColor('Netflix TechBlog');
      expect(color).toHaveProperty('gradient');
      expect(color).toHaveProperty('border');
      expect(color).toHaveProperty('hover');
      expect(color).toHaveProperty('tag');
      expect(color).toHaveProperty('dot');
      expect(color).toHaveProperty('bar');
      expect(color).toHaveProperty('borderLeft');
    });
  });
});
