import { getTagCategory, getCategoryInfo, getAllCategories, TAG_CATEGORIES } from '@/lib/constants/tag-categories';

describe('Tag Categories', () => {
  describe('getTagCategory', () => {
    it('フロントエンドタグを正しく分類する', () => {
      expect(getTagCategory('React')).toBe('frontend');
      expect(getTagCategory('Vue.js')).toBe('frontend');
      expect(getTagCategory('TypeScript')).toBe('frontend');
      expect(getTagCategory('Next.js')).toBe('frontend');
    });

    it('バックエンドタグを正しく分類する', () => {
      expect(getTagCategory('Node.js')).toBe('backend');
      expect(getTagCategory('Python')).toBe('backend');
      expect(getTagCategory('Ruby on Rails')).toBe('backend');
      expect(getTagCategory('Django')).toBe('backend');
    });

    it('インフラタグを正しく分類する', () => {
      expect(getTagCategory('Docker')).toBe('infrastructure');
      expect(getTagCategory('Kubernetes')).toBe('infrastructure');
      expect(getTagCategory('AWS')).toBe('infrastructure');
      expect(getTagCategory('Terraform')).toBe('infrastructure');
    });

    it('データベースタグを正しく分類する', () => {
      expect(getTagCategory('MySQL')).toBe('database');
      expect(getTagCategory('PostgreSQL')).toBe('database');
      expect(getTagCategory('MongoDB')).toBe('database');
      expect(getTagCategory('Redis')).toBe('database');
    });

    it('AI/機械学習タグを正しく分類する', () => {
      expect(getTagCategory('ChatGPT')).toBe('ai_ml');
      expect(getTagCategory('TensorFlow')).toBe('ai_ml');
      expect(getTagCategory('機械学習')).toBe('ai_ml');
      expect(getTagCategory('Deep Learning')).toBe('ai_ml');
    });

    it('DevOpsタグを正しく分類する', () => {
      expect(getTagCategory('CI/CD')).toBe('devops');
      expect(getTagCategory('GitOps')).toBe('devops');
      expect(getTagCategory('Monitoring')).toBe('devops');
      expect(getTagCategory('SRE')).toBe('devops');
    });

    it('大文字小文字を区別せずに分類する', () => {
      expect(getTagCategory('react')).toBe('frontend');
      expect(getTagCategory('REACT')).toBe('frontend');
      expect(getTagCategory('React')).toBe('frontend');
    });

    it('未定義のタグはnullを返す', () => {
      expect(getTagCategory('UnknownTag')).toBeNull();
      expect(getTagCategory('未知のタグ')).toBeNull();
      expect(getTagCategory('')).toBeNull();
    });
  });

  describe('getCategoryInfo', () => {
    it('各カテゴリーの情報を正しく取得する', () => {
      const frontend = getCategoryInfo('frontend');
      expect(frontend.name).toBe('フロントエンド');
      expect(frontend.description).toBe('UI/UX、クライアントサイド技術');
      expect(frontend.color).toContain('blue');
      expect(frontend.tags).toContain('React');

      const backend = getCategoryInfo('backend');
      expect(backend.name).toBe('バックエンド');
      expect(backend.description).toBe('サーバーサイド、API開発');
      expect(backend.color).toContain('green');
      expect(backend.tags).toContain('Node.js');
    });
  });

  describe('getAllCategories', () => {
    it('すべてのカテゴリーを取得する', () => {
      const categories = getAllCategories();
      
      expect(categories).toHaveLength(6);
      expect(categories.map(c => c.key)).toEqual([
        'frontend',
        'backend',
        'infrastructure',
        'database',
        'ai_ml',
        'devops'
      ]);
      
      categories.forEach(category => {
        expect(category).toHaveProperty('key');
        expect(category).toHaveProperty('name');
        expect(category).toHaveProperty('description');
        expect(category).toHaveProperty('color');
        expect(category).toHaveProperty('tags');
        expect(Array.isArray(category.tags)).toBe(true);
      });
    });
  });

  describe('TAG_CATEGORIES定数', () => {
    it('各カテゴリーが必要なプロパティを持つ', () => {
      Object.values(TAG_CATEGORIES).forEach(category => {
        expect(category).toHaveProperty('name');
        expect(category).toHaveProperty('description');
        expect(category).toHaveProperty('color');
        expect(category).toHaveProperty('tags');
        expect(Array.isArray(category.tags)).toBe(true);
        expect(category.tags.length).toBeGreaterThan(0);
      });
    });

    it('タグの重複がない', () => {
      const allTags: string[] = [];
      
      Object.values(TAG_CATEGORIES).forEach(category => {
        category.tags.forEach(tag => {
          allTags.push(tag.toLowerCase());
        });
      });
      
      const uniqueTags = new Set(allTags);
      expect(uniqueTags.size).toBe(allTags.length);
    });
  });
});