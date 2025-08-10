import {
  categorizeTag,
  categorizeMultipleTags,
  getTagStatistics,
} from '@/lib/utils/tag-categorizer';

describe('tag-categorizer', () => {
  describe('categorizeTag', () => {
    describe('languages category', () => {
      it('should categorize programming languages correctly', () => {
        expect(categorizeTag('javascript')).toBe('languages');
        expect(categorizeTag('TypeScript')).toBe('languages');
        expect(categorizeTag('python')).toBe('languages');
        expect(categorizeTag('go')).toBe('languages');
        expect(categorizeTag('golang')).toBe('languages');
        expect(categorizeTag('rust')).toBe('languages');
      });

      it('should handle case-insensitive matching', () => {
        expect(categorizeTag('JAVASCRIPT')).toBe('languages');
        expect(categorizeTag('JavaScript')).toBe('languages');
        expect(categorizeTag('javaScript')).toBe('languages');
      });
    });

    describe('frameworks category', () => {
      it('should categorize web frameworks correctly', () => {
        expect(categorizeTag('react')).toBe('frameworks');
        expect(categorizeTag('vue')).toBe('frameworks');
        expect(categorizeTag('angular')).toBe('frameworks');
        expect(categorizeTag('next.js')).toBe('frameworks');
        expect(categorizeTag('nextjs')).toBe('frameworks');
      });

      it('should categorize backend frameworks correctly', () => {
        expect(categorizeTag('django')).toBe('frameworks');
        expect(categorizeTag('flask')).toBe('frameworks');
        expect(categorizeTag('express')).toBe('frameworks');
        expect(categorizeTag('fastapi')).toBe('frameworks');
      });

      it('should handle framework name variations', () => {
        expect(categorizeTag('next.js')).toBe('frameworks');
        expect(categorizeTag('nextjs')).toBe('frameworks');
        expect(categorizeTag('nest.js')).toBe('frameworks');
        expect(categorizeTag('nestjs')).toBe('frameworks');
      });
    });

    describe('tools category', () => {
      it('should categorize development tools correctly', () => {
        expect(categorizeTag('docker')).toBe('tools');
        expect(categorizeTag('kubernetes')).toBe('tools');
        expect(categorizeTag('k8s')).toBe('tools');
        expect(categorizeTag('git')).toBe('tools');
        expect(categorizeTag('webpack')).toBe('tools');
        expect(categorizeTag('vite')).toBe('tools');
      });

      it('should categorize CI/CD tools correctly', () => {
        expect(categorizeTag('jenkins')).toBe('tools');
        expect(categorizeTag('github actions')).toBe('tools');
        expect(categorizeTag('circleci')).toBe('tools');
      });
    });

    describe('concepts category', () => {
      it('should categorize software concepts correctly', () => {
        expect(categorizeTag('algorithm')).toBe('concepts');
        expect(categorizeTag('design pattern')).toBe('concepts');
        expect(categorizeTag('security')).toBe('concepts');
        expect(categorizeTag('performance')).toBe('concepts');
        expect(categorizeTag('testing')).toBe('concepts');
      });

      it('should categorize Japanese concepts correctly', () => {
        expect(categorizeTag('アルゴリズム')).toBe('concepts');
        expect(categorizeTag('セキュリティ')).toBe('concepts');
        expect(categorizeTag('パフォーマンス')).toBe('concepts');
        expect(categorizeTag('テスト')).toBe('concepts');
      });

      it('should categorize architecture patterns correctly', () => {
        expect(categorizeTag('microservices')).toBe('concepts');
        expect(categorizeTag('api')).toBe('frameworks');
        expect(categorizeTag('rest')).toBe('concepts');
        expect(categorizeTag('graphql')).toBe('concepts');
      });
    });

    describe('platforms category', () => {
      it('should categorize cloud platforms correctly', () => {
        expect(categorizeTag('aws')).toBe('platforms');
        expect(categorizeTag('gcp')).toBe('platforms');
        expect(categorizeTag('azure')).toBe('platforms');
        expect(categorizeTag('vercel')).toBe('platforms');
        expect(categorizeTag('netlify')).toBe('platforms');
      });

      it('should handle platform name variations', () => {
        expect(categorizeTag('amazon web services')).toBe('platforms');
        expect(categorizeTag('google cloud')).toBe('platforms');
      });
    });

    describe('databases category', () => {
      it('should categorize SQL databases correctly', () => {
        expect(categorizeTag('mysql')).toBe('databases');
        expect(categorizeTag('postgresql')).toBe('databases');
        expect(categorizeTag('postgres')).toBe('databases');
        expect(categorizeTag('sqlite')).toBe('databases');
      });

      it('should categorize NoSQL databases correctly', () => {
        expect(categorizeTag('mongodb')).toBe('databases');
        expect(categorizeTag('redis')).toBe('tools');
        expect(categorizeTag('cassandra')).toBe('databases');
        expect(categorizeTag('elasticsearch')).toBe('tools');
      });

      it('should categorize ORMs correctly', () => {
        expect(categorizeTag('prisma')).toBe('databases');
        expect(categorizeTag('typeorm')).toBe('databases');
        expect(categorizeTag('sequelize')).toBe('databases');
        expect(categorizeTag('mongoose')).toBe('databases');
      });
    });

    describe('mobile category', () => {
      it('should categorize mobile frameworks correctly', () => {
        expect(categorizeTag('react native')).toBe('frameworks');
        expect(categorizeTag('flutter')).toBe('mobile');
        expect(categorizeTag('swift')).toBe('languages');
        expect(categorizeTag('kotlin')).toBe('languages');
      });

      it('should categorize mobile platforms correctly', () => {
        expect(categorizeTag('android')).toBe('mobile');
        expect(categorizeTag('ios')).toBe('mobile');
        expect(categorizeTag('pwa')).toBe('mobile');
      });

      it('should categorize Japanese mobile terms correctly', () => {
        expect(categorizeTag('モバイル')).toBe('mobile');
        expect(categorizeTag('スマートフォン')).toBe('mobile');
      });
    });

    describe('ai-ml category', () => {
      it('should categorize AI/ML frameworks correctly', () => {
        expect(categorizeTag('tensorflow')).toBe('ai-ml');
        expect(categorizeTag('pytorch')).toBe('ai-ml');
        expect(categorizeTag('keras')).toBe('ai-ml');
        expect(categorizeTag('scikit-learn')).toBe('ai-ml');
      });

      it('should categorize AI concepts correctly', () => {
        expect(categorizeTag('ai')).toBe('frameworks');
        expect(categorizeTag('machine learning')).toBe('ai-ml');
        expect(categorizeTag('deep learning')).toBe('ai-ml');
        expect(categorizeTag('chatgpt')).toBe('ai-ml');
        expect(categorizeTag('llm')).toBe('ai-ml');
      });

      it('should categorize Japanese AI terms correctly', () => {
        expect(categorizeTag('人工知能')).toBe('ai-ml');
        expect(categorizeTag('機械学習')).toBe('ai-ml');
        expect(categorizeTag('深層学習')).toBe('ai-ml');
        expect(categorizeTag('自然言語処理')).toBe('ai-ml');
      });
    });

    describe('edge cases', () => {
      it('should handle tags with special characters', () => {
        expect(categorizeTag('c++')).toBe('languages');
        expect(categorizeTag('c#')).toBe('languages');
        expect(categorizeTag('f#')).toBe('languages');
        expect(categorizeTag('asp.net')).toBe('frameworks');
      });

      it('should handle tags with hyphens and dots flexibly', () => {
        expect(categorizeTag('react-native')).toBe('frameworks');
        expect(categorizeTag('scikit_learn')).toBe('ai-ml');
        expect(categorizeTag('ruby.on.rails')).toBe('languages');
      });

      it('should handle partial matches', () => {
        expect(categorizeTag('react-hooks')).toBe('frameworks');
        expect(categorizeTag('python3')).toBe('languages');
        expect(categorizeTag('nodejs')).toBe(null); // npm, yarn are in tools
      });

      it('should return null for unknown tags', () => {
        expect(categorizeTag('unknown-tag')).toBeNull();
        expect(categorizeTag('random')).toBeNull();
        expect(categorizeTag('xyz123')).toBeNull();
      });

      it('should handle empty and invalid inputs', () => {
        expect(categorizeTag('')).toBeNull();
        expect(categorizeTag('  ')).toBeNull();
        expect(categorizeTag('\t\n')).toBeNull();
      });

      it('should trim whitespace', () => {
        expect(categorizeTag('  javascript  ')).toBe('languages');
        expect(categorizeTag('\treact\n')).toBe('frameworks');
      });
    });
  });

  describe('categorizeMultipleTags', () => {
    it('should categorize multiple tags into groups', () => {
      const tags = ['javascript', 'react', 'docker', 'aws', 'mysql'];
      const result = categorizeMultipleTags(tags);
      
      expect(result).toEqual({
        languages: ['javascript'],
        frameworks: ['react'],
        tools: ['docker'],
        platforms: ['aws'],
        databases: ['mysql'],
      });
    });

    it('should handle mixed known and unknown tags', () => {
      const tags = ['python', 'unknown1', 'react', 'unknown2', 'docker'];
      const result = categorizeMultipleTags(tags);
      
      expect(result).toEqual({
        languages: ['python'],
        frameworks: ['react'],
        tools: ['docker'],
        uncategorized: ['unknown1', 'unknown2'],
      });
    });

    it('should group multiple tags of the same category', () => {
      const tags = ['javascript', 'python', 'go', 'rust'];
      const result = categorizeMultipleTags(tags);
      
      expect(result).toEqual({
        languages: ['javascript', 'python', 'go', 'rust'],
      });
    });

    it('should handle empty array', () => {
      const result = categorizeMultipleTags([]);
      expect(result).toEqual({});
    });

    it('should handle all unknown tags', () => {
      const tags = ['unknown1', 'unknown2', 'unknown3'];
      const result = categorizeMultipleTags(tags);
      
      expect(result).toEqual({
        uncategorized: ['unknown1', 'unknown2', 'unknown3'],
      });
    });

    it('should preserve original tag names while categorizing', () => {
      const tags = ['JavaScript', 'React', 'Docker'];
      const result = categorizeMultipleTags(tags);
      
      expect(result).toEqual({
        languages: ['JavaScript'],
        frameworks: ['React'],
        tools: ['Docker'],
      });
    });

    it('should handle duplicate tags', () => {
      const tags = ['javascript', 'react', 'javascript', 'react'];
      const result = categorizeMultipleTags(tags);
      
      expect(result).toEqual({
        languages: ['javascript', 'javascript'],
        frameworks: ['react', 'react'],
      });
    });
  });

  describe('getTagStatistics', () => {
    it('should count tags by category', () => {
      const tags = ['javascript', 'python', 'react', 'vue', 'docker'];
      const stats = getTagStatistics(tags);
      
      expect(stats).toEqual({
        languages: 2,
        frameworks: 2,
        tools: 1,
      });
    });

    it('should count uncategorized tags', () => {
      const tags = ['javascript', 'unknown1', 'unknown2', 'react'];
      const stats = getTagStatistics(tags);
      
      expect(stats).toEqual({
        languages: 1,
        frameworks: 1,
        uncategorized: 2,
      });
    });

    it('should handle empty array', () => {
      const stats = getTagStatistics([]);
      expect(stats).toEqual({});
    });

    it('should handle all tags from same category', () => {
      const tags = ['mysql', 'postgresql', 'mongodb', 'redis'];
      const stats = getTagStatistics(tags);
      
      expect(stats).toEqual({
        databases: 3,
        tools: 1,
      });
    });

    it('should handle all unknown tags', () => {
      const tags = ['unknown1', 'unknown2', 'unknown3'];
      const stats = getTagStatistics(tags);
      
      expect(stats).toEqual({
        uncategorized: 3,
      });
    });

    it('should count duplicate tags', () => {
      const tags = ['javascript', 'javascript', 'python', 'python', 'python'];
      const stats = getTagStatistics(tags);
      
      expect(stats).toEqual({
        languages: 5,
      });
    });

    it('should handle mixed categories with various counts', () => {
      const tags = [
        'javascript', 'typescript', 'python',  // languages: 3
        'react', 'vue',                        // frameworks: 2
        'docker', 'kubernetes', 'git', 'npm',  // tools: 4
        'aws',                                 // platforms: 1
        'mysql', 'mongodb',                    // databases: 2
        'flutter',                             // mobile: 1
        'tensorflow',                          // ai-ml: 1
        'unknown1', 'unknown2',                // uncategorized: 2
      ];
      const stats = getTagStatistics(tags);
      
      expect(stats).toEqual({
        languages: 3,
        frameworks: 2,
        tools: 4,
        platforms: 1,
        databases: 2,
        mobile: 1,
        'ai-ml': 1,
        uncategorized: 2,
      });
    });
  });
});