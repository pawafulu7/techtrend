/**
 * Quality Score計算ロジックのユニットテスト
 */

import { calculateQualityScore } from '@/lib/utils/quality-score';

describe('Quality Score Calculation', () => {
  const baseArticle = {
    id: 'test-id',
    title: 'Test Article',
    url: 'https://test.com',
    summary: 'This is a test summary with reasonable length to get good score.',
    publishedAt: new Date(),
    sourceId: 'test-source',
    source: {
      id: 'test-source',
      name: 'Dev.to',
      type: 'blog',
      url: 'https://dev.to',
      enabled: true,
      createdAt: new Date(),
      updatedAt: new Date(),
      articles: [],
    },
    tags: [],
    bookmarks: 0,
    userVotes: 0,
    content: null,
    thumbnail: null,
    qualityScore: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
    difficulty: null,
    detailedSummary: null,
    articleType: null,
    summaryVersion: 1,
  };

  describe('Tag Scoring (max 30 points)', () => {
    it('should give 30 points for 5+ tech tags', () => {
      const article = {
        ...baseArticle,
        tags: [
          { id: '1', name: 'JavaScript', category: 'tech', articles: [] },
          { id: '2', name: 'React', category: 'tech', articles: [] },
          { id: '3', name: 'Node.js', category: 'tech', articles: [] },
          { id: '4', name: 'TypeScript', category: 'tech', articles: [] },
          { id: '5', name: 'Vue.js', category: 'tech', articles: [] },
        ],
      };
      
      const score = calculateQualityScore(article);
      // Tags(30) + Summary(20) + Source(15) + Freshness(15) = 80
      expect(score).toBeGreaterThanOrEqual(75);
    });

    it('should give 25 points for 3-4 tech tags', () => {
      const article = {
        ...baseArticle,
        tags: [
          { id: '1', name: 'JavaScript', category: 'tech', articles: [] },
          { id: '2', name: 'React', category: 'tech', articles: [] },
          { id: '3', name: 'Node.js', category: 'tech', articles: [] },
        ],
      };
      
      const score = calculateQualityScore(article);
      // Tags(25) + Summary(20) + Source(15) + Freshness(15) = 75
      expect(score).toBeGreaterThanOrEqual(70);
    });

    it('should ignore non-tech tags', () => {
      const article = {
        ...baseArticle,
        tags: [
          { id: '1', name: 'AWS', category: 'exclude', articles: [] },
          { id: '2', name: 'SRE', category: 'exclude', articles: [] },
          { id: '3', name: 'JavaScript', category: 'tech', articles: [] },
        ],
      };
      
      const score = calculateQualityScore(article);
      // Only 1 tech tag counts
      expect(score).toBeLessThan(60);
    });
  });

  describe('Summary Scoring (max 20 points)', () => {
    it('should give full points for optimal summary length', () => {
      const article = {
        ...baseArticle,
        summary: 'A'.repeat(80), // 80 characters - optimal length
      };
      
      const score = calculateQualityScore(article);
      expect(score).toBeGreaterThanOrEqual(45); // Better summary score
    });

    it('should give no points for missing summary', () => {
      const article = {
        ...baseArticle,
        summary: null,
      };
      
      const score = calculateQualityScore(article);
      expect(score).toBeLessThan(35); // Lower without summary
    });
  });

  describe('Source Reliability (max 20 points)', () => {
    it('should give high scores for trusted sources', () => {
      const trustedSources = ['Qiita Popular', 'Publickey', 'AWS'];
      
      trustedSources.forEach(sourceName => {
        const article = {
          ...baseArticle,
          source: { ...baseArticle.source, name: sourceName },
        };
        
        const score = calculateQualityScore(article);
        expect(score).toBeGreaterThanOrEqual(50); // High source score
      });
    });

    it('should give lower scores for less trusted sources', () => {
      const article = {
        ...baseArticle,
        source: { ...baseArticle.source, name: 'Unknown Source' },
      };
      
      const score = calculateQualityScore(article);
      expect(score).toBeLessThan(50); // Lower source score
    });
  });

  describe('Freshness Scoring (max 15 points)', () => {
    it('should give full points for articles published today', () => {
      const article = {
        ...baseArticle,
        publishedAt: new Date(),
      };
      
      const score = calculateQualityScore(article);
      expect(score).toBeGreaterThanOrEqual(45);
    });

    it('should give less points for older articles', () => {
      const oldDate = new Date();
      oldDate.setDate(oldDate.getDate() - 30); // 30 days old
      
      const article = {
        ...baseArticle,
        publishedAt: oldDate,
      };
      
      const score = calculateQualityScore(article);
      expect(score).toBeLessThan(45); // No freshness points
    });
  });

  describe('Engagement Scoring (max 15 points)', () => {
    it('should give points based on bookmark count', () => {
      const scenarios = [
        { bookmarks: 0, minScore: 0, maxScore: 50 },
        { bookmarks: 25, minScore: 35, maxScore: 55 },
        { bookmarks: 100, minScore: 40, maxScore: 60 },
        { bookmarks: 500, minScore: 45, maxScore: 65 },
      ];
      
      scenarios.forEach(({ bookmarks, minScore, maxScore }) => {
        const article = {
          ...baseArticle,
          bookmarks,
        };
        
        const score = calculateQualityScore(article);
        expect(score).toBeGreaterThanOrEqual(minScore);
        expect(score).toBeLessThanOrEqual(maxScore);
      });
    });
  });

  describe('Clickbait Penalty', () => {
    it('should penalize clickbait titles', () => {
      const clickbaitTitles = [
        '10個の驚きの方法',
        '知らないと損する技術',
        '絶対に知っておくべき',
        'これはヤバすぎる',
        'プログラマーが選ぶ理由',
        '衝撃の事実',
        '必見のツール',
      ];
      
      clickbaitTitles.forEach(title => {
        const normalArticle = { ...baseArticle };
        const clickbaitArticle = { ...baseArticle, title };
        
        const normalScore = calculateQualityScore(normalArticle);
        const clickbaitScore = calculateQualityScore(clickbaitArticle);
        
        expect(clickbaitScore).toBeLessThan(normalScore);
        expect(normalScore - clickbaitScore).toBeGreaterThanOrEqual(10);
      });
    });
  });

  describe('User Votes Bonus', () => {
    it('should add bonus points for user votes', () => {
      const article = {
        ...baseArticle,
        userVotes: 5,
      };
      
      const baseScore = calculateQualityScore(baseArticle);
      const votedScore = calculateQualityScore(article);
      
      expect(votedScore).toBeGreaterThan(baseScore);
      expect(votedScore - baseScore).toBe(10); // 5 votes * 2 points
    });

    it('should cap user vote bonus at 20 points', () => {
      const article = {
        ...baseArticle,
        userVotes: 20, // Should cap at 20 points (10 * 2)
      };
      
      const baseScore = calculateQualityScore(baseArticle);
      const votedScore = calculateQualityScore(article);
      
      expect(votedScore - baseScore).toBe(20);
    });
  });

  describe('Score Normalization', () => {
    it('should never exceed 100', () => {
      const perfectArticle = {
        ...baseArticle,
        tags: Array(10).fill(null).map((_, i) => ({
          id: `${i}`,
          name: `Tech${i}`,
          category: 'tech',
          articles: [],
        })),
        summary: 'A'.repeat(80),
        source: { ...baseArticle.source, name: 'Publickey' },
        publishedAt: new Date(),
        bookmarks: 1000,
        userVotes: 20,
      };
      
      const score = calculateQualityScore(perfectArticle);
      expect(score).toBeLessThanOrEqual(100);
    });

    it('should never be negative', () => {
      const terribleArticle = {
        ...baseArticle,
        title: '絶対に知らないと損する10個の理由',
        tags: [],
        summary: null,
        source: { ...baseArticle.source, name: 'Unknown' },
        publishedAt: new Date('2020-01-01'),
        bookmarks: 0,
        userVotes: 0,
      };
      
      const score = calculateQualityScore(terribleArticle);
      expect(score).toBeGreaterThanOrEqual(0);
    });
  });
});