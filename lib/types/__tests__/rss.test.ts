import {
  RSSItemSchema,
  isRSSItem,
  getContentFromItem,
  getAuthorFromItem,
  getTagsFromItem,
  getThumbnailFromItem,
} from '../rss';

describe('RSSItemSchema', () => {
  describe('isRSSItem', () => {
    test('should validate complete RSS item', () => {
      const item = {
        title: 'Test Article',
        link: 'https://example.com/article',
        pubDate: '2025-10-05T12:00:00Z',
        contentEncoded: '<p>Full content here</p>',
        dcCreator: 'Test Author',
        categories: ['tech', 'typescript'],
        description: 'Article description',
        guid: 'article-123',
        isoDate: '2025-10-05T12:00:00.000Z',
      };

      expect(isRSSItem(item)).toBe(true);
    });

    test('should validate minimal RSS item', () => {
      const item = {
        title: 'Minimal Article',
      };

      expect(isRSSItem(item)).toBe(true);
    });

    test('should reject null', () => {
      expect(isRSSItem(null)).toBe(false);
    });

    test('should reject undefined', () => {
      expect(isRSSItem(undefined)).toBe(false);
    });

    test('should reject string primitive', () => {
      expect(isRSSItem('string')).toBe(false);
    });

    test('should reject number primitive', () => {
      expect(isRSSItem(123)).toBe(false);
    });

    test('should reject empty object (no title or link)', () => {
      const item = {};
      expect(isRSSItem(item)).toBe(false);
    });

    test('should allow unknown fields (passthrough)', () => {
      const item = {
        title: 'Article with extras',
        unknownField: 'some value',
        anotherUnknown: 123,
      };

      expect(isRSSItem(item)).toBe(true);
    });

    test('should allow items with title but no link', () => {
      const item = {
        title: 'Test',
        link: 'not-a-valid-url',
      };

      // link field is optional, invalid URLs are allowed (RSS feeds vary)
      expect(isRSSItem(item)).toBe(true);
    });
  });

  describe('getContentFromItem', () => {
    test('should extract contentEncoded field', () => {
      const item = {
        title: 'Test',
        contentEncoded: 'Content from contentEncoded',
      };

      expect(getContentFromItem(item)).toBe('Content from contentEncoded');
    });

    test('should extract content:encoded field', () => {
      const item = {
        title: 'Test',
        'content:encoded': 'Content from content:encoded',
      };

      expect(getContentFromItem(item)).toBe('Content from content:encoded');
    });

    test('should prioritize contentEncoded over content:encoded', () => {
      const item = {
        title: 'Test',
        contentEncoded: 'Priority content',
        'content:encoded': 'Fallback content',
      };

      expect(getContentFromItem(item)).toBe('Priority content');
    });

    test('should return undefined for invalid item', () => {
      expect(getContentFromItem(null)).toBeUndefined();
      expect(getContentFromItem('string')).toBeUndefined();
      expect(getContentFromItem(123)).toBeUndefined();
    });

    test('should return undefined when no content fields present', () => {
      const item = {
        title: 'Article without content',
      };

      expect(getContentFromItem(item)).toBeUndefined();
    });
  });

  describe('getAuthorFromItem', () => {
    test('should extract author field', () => {
      const item = {
        title: 'Test',
        author: 'Author from author',
      };

      expect(getAuthorFromItem(item)).toBe('Author from author');
    });

    test('should extract dcCreator field', () => {
      const item = {
        title: 'Test',
        dcCreator: 'Author from dcCreator',
      };

      expect(getAuthorFromItem(item)).toBe('Author from dcCreator');
    });

    test('should extract creator field', () => {
      const item = {
        title: 'Test',
        creator: 'Author from creator',
      };

      expect(getAuthorFromItem(item)).toBe('Author from creator');
    });

    test('should prioritize author > dcCreator > creator', () => {
      const item = {
        title: 'Test',
        author: 'Priority author',
        dcCreator: 'Second author',
        creator: 'Third author',
      };

      expect(getAuthorFromItem(item)).toBe('Priority author');
    });

    test('should return undefined for invalid item', () => {
      expect(getAuthorFromItem(null)).toBeUndefined();
      expect(getAuthorFromItem(undefined)).toBeUndefined();
    });

    test('should return undefined when no author fields present', () => {
      const item = {
        title: 'Article without author',
      };

      expect(getAuthorFromItem(item)).toBeUndefined();
    });
  });

  describe('getTagsFromItem', () => {
    test('should extract categories array', () => {
      const item = {
        title: 'Test',
        categories: ['tag1', 'tag2', 'tag3'],
      };

      expect(getTagsFromItem(item)).toEqual(['tag1', 'tag2', 'tag3']);
    });

    test('should return empty array for invalid item', () => {
      expect(getTagsFromItem(null)).toEqual([]);
      expect(getTagsFromItem(undefined)).toEqual([]);
      expect(getTagsFromItem('string')).toEqual([]);
    });

    test('should return empty array when no categories present', () => {
      const item = {
        title: 'Article without categories',
      };

      expect(getTagsFromItem(item)).toEqual([]);
    });

    test('should handle empty categories array', () => {
      const item = {
        title: 'Test',
        categories: [],
      };

      expect(getTagsFromItem(item)).toEqual([]);
    });
  });

  describe('getThumbnailFromItem', () => {
    test('should extract thumbnail from enclosure.url', () => {
      const item = {
        title: 'Test',
        enclosure: {
          url: 'https://example.com/image.jpg',
        },
      };

      expect(getThumbnailFromItem(item)).toBe('https://example.com/image.jpg');
    });

    test('should extract thumbnail from media:thumbnail', () => {
      const item = {
        title: 'Test',
        'media:thumbnail': {
          '@_url': 'https://example.com/thumb.jpg',
        },
      };

      expect(getThumbnailFromItem(item)).toBe('https://example.com/thumb.jpg');
    });

    test('should prioritize enclosure.url over media:thumbnail', () => {
      const item = {
        title: 'Test',
        enclosure: {
          url: 'https://example.com/priority.jpg',
        },
        'media:thumbnail': {
          '@_url': 'https://example.com/fallback.jpg',
        },
      };

      expect(getThumbnailFromItem(item)).toBe('https://example.com/priority.jpg');
    });

    test('should return undefined for invalid item', () => {
      expect(getThumbnailFromItem(null)).toBeUndefined();
      expect(getThumbnailFromItem(undefined)).toBeUndefined();
    });

    test('should return undefined when no thumbnail fields present', () => {
      const item = {
        title: 'Article without thumbnail',
      };

      expect(getThumbnailFromItem(item)).toBeUndefined();
    });
  });

  describe('RSSItemSchema validation', () => {
    test('should require title or link', () => {
      const itemWithTitle = { title: 'Test' };
      expect(isRSSItem(itemWithTitle)).toBe(true);

      const itemWithLink = { link: 'https://example.com' };
      expect(isRSSItem(itemWithLink)).toBe(true);

      const itemWithBoth = { title: 'Test', link: 'https://example.com' };
      expect(isRSSItem(itemWithBoth)).toBe(true);

      const itemWithNeither = { description: 'No title or link' };
      expect(isRSSItem(itemWithNeither)).toBe(false);
    });

    test('should validate with all optional fields', () => {
      const result = RSSItemSchema.safeParse({
        title: 'Test',
        link: 'https://example.com',
        pubDate: '2025-10-05',
        content: 'Content',
        contentEncoded: 'Encoded',
        'content:encoded': 'Alt encoded',
        contentSnippet: 'Snippet',
        description: 'Desc',
        author: 'Author',
        dcCreator: 'DC Author',
        creator: 'Creator',
        'dc:creator': 'DC Creator alt',
        'itunes:author': 'iTunes Author',
        categories: ['tag1'],
        guid: 'guid-123',
        isoDate: '2025-10-05T00:00:00Z',
      });

      expect(result.success).toBe(true);
    });

    test('should allow passthrough of unknown fields', () => {
      const item = {
        title: 'Test',
        customField: 'custom value',
        nestedObject: { foo: 'bar' },
      };

      const result = RSSItemSchema.safeParse(item);
      expect(result.success).toBe(true);

      if (result.success) {
        expect((result.data as any).customField).toBe('custom value');
        expect((result.data as any).nestedObject).toEqual({ foo: 'bar' });
      }
    });
  });
});
