import imageLoader from '@/lib/image-loader';

describe('imageLoader', () => {
  describe('External HTTPS URLs', () => {
    it('should return HTTPS URL as-is', () => {
      const result = imageLoader({
        src: 'https://example.com/image.jpg',
        width: 800,
        quality: 75,
      });
      expect(result).toBe('https://example.com/image.jpg');
    });

    it('should handle hashnode.com URLs', () => {
      const hashnodeUrl = 'https://hashnode.com/utility/r?url=https%3A%2F%2Fcdn.hashnode.com%2Fres%2Fhashnode%2Fimage%2Fupload%2Fv1759596328359%2Ff3ef7ba4-53e1-4350-97cf-ca4b5725b50d.jpeg';
      const result = imageLoader({
        src: hashnodeUrl,
        width: 800,
        quality: 75,
      });
      expect(result).toBe(hashnodeUrl);
    });

    it('should handle cloudinary URLs', () => {
      const cloudinaryUrl = 'https://res.cloudinary.com/demo/image/upload/w_300,c_limit,q_auto/turtles.jpg';
      const result = imageLoader({
        src: cloudinaryUrl,
        width: 800,
        quality: 75,
      });
      expect(result).toBe(cloudinaryUrl);
    });

    it('should handle googleapis URLs', () => {
      const googleUrl = 'https://storage.googleapis.com/bucket/image.png';
      const result = imageLoader({
        src: googleUrl,
        width: 800,
        quality: 75,
      });
      expect(result).toBe(googleUrl);
    });
  });

  describe('Data URLs', () => {
    it('should return data URL as-is', () => {
      const dataUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
      const result = imageLoader({
        src: dataUrl,
        width: 800,
        quality: 75,
      });
      expect(result).toBe(dataUrl);
    });

    it('should handle SVG data URLs', () => {
      const svgDataUrl = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMzAwIiBoZWlnaHQ9IjIwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48L3N2Zz4=';
      const result = imageLoader({
        src: svgDataUrl,
        width: 800,
        quality: 75,
      });
      expect(result).toBe(svgDataUrl);
    });
  });

  describe('Parameter handling', () => {
    it('should ignore width parameter', () => {
      const src = 'https://example.com/image.jpg';
      const result1 = imageLoader({ src, width: 400, quality: 75 });
      const result2 = imageLoader({ src, width: 800, quality: 75 });
      expect(result1).toBe(result2);
      expect(result1).toBe(src);
    });

    it('should ignore quality parameter', () => {
      const src = 'https://example.com/image.jpg';
      const result1 = imageLoader({ src, width: 800, quality: 50 });
      const result2 = imageLoader({ src, width: 800, quality: 90 });
      expect(result1).toBe(result2);
      expect(result1).toBe(src);
    });

    it('should ignore both width and quality parameters', () => {
      const src = 'https://example.com/image.jpg';
      const result1 = imageLoader({ src, width: 400, quality: 50 });
      const result2 = imageLoader({ src, width: 800, quality: 90 });
      expect(result1).toBe(result2);
      expect(result1).toBe(src);
    });
  });

  describe('Various URL formats', () => {
    it('should handle URLs with query parameters', () => {
      const url = 'https://example.com/image.jpg?v=123&w=300';
      const result = imageLoader({ src: url, width: 800, quality: 75 });
      expect(result).toBe(url);
    });

    it('should handle URLs with hash fragments', () => {
      const url = 'https://example.com/image.jpg#section';
      const result = imageLoader({ src: url, width: 800, quality: 75 });
      expect(result).toBe(url);
    });

    it('should handle encoded URLs', () => {
      const url = 'https://example.com/path%20with%20spaces/image.jpg';
      const result = imageLoader({ src: url, width: 800, quality: 75 });
      expect(result).toBe(url);
    });
  });

  describe('Edge cases', () => {
    it('should handle empty string', () => {
      const result = imageLoader({ src: '', width: 800, quality: 75 });
      expect(result).toBe('');
    });

    it('should handle blob URLs', () => {
      const blobUrl = 'blob:http://localhost:3000/abc123-def456';
      const result = imageLoader({ src: blobUrl, width: 800, quality: 75 });
      expect(result).toBe(blobUrl);
    });
  });

  describe('Real-world domains', () => {
    it('should handle various tech article source domains', () => {
      const domains = [
        'https://res.cloudinary.com/demo/image.jpg',
        'https://files.speakerdeck.com/presentations/abc.jpg',
        'https://image.itmedia.co.jp/pcuser/articles/123/456.jpg',
        'https://cdn.image.st-hatena.com/image/123.jpg',
        'https://storage.googleapis.com/bucket/image.png',
        'https://huggingface.co/spaces/123/456.png',
        'https://opengraph.githubassets.com/123/repo.png',
      ];

      domains.forEach((url) => {
        const result = imageLoader({ src: url, width: 800, quality: 75 });
        expect(result).toBe(url);
      });
    });
  });
});
