/**
 * DeepMind Blog Fetcher テストケース
 */

import { DeepMindBlogFetcher } from '@/lib/fetchers/deepmind-blog';
import { Source } from '@prisma/client';

// モックデータ
const mockSource: Source = {
  id: 'test-deepmind-source',
  name: 'DeepMind Blog',
  url: 'https://deepmind.google/blog/rss.xml',
  type: 'RSS',
  category: 'AI',
  enabled: true,
  createdAt: new Date(),
  updatedAt: new Date(),
};

// rss-parserのモック
jest.mock('rss-parser', () => {
  return jest.fn().mockImplementation(() => ({
    parseURL: jest.fn(),
  }));
});

describe('DeepMindBlogFetcher', () => {
  let fetcher: DeepMindBlogFetcher;
  let mockParser: any;

  beforeEach(() => {
    jest.clearAllMocks();
    fetcher = new DeepMindBlogFetcher(mockSource);

    // parserのモックを取得
    const Parser = require('rss-parser');
    mockParser = new Parser();
  });

  describe('fetch', () => {
    it('DeepMindのAI研究記事を取得する', async () => {
      const mockFeed = {
        items: [
          {
            title: 'AlphaFold 3: Revolutionizing Protein Structure Prediction',
            link: 'https://deepmind.google/blog/alphafold-3',
            content: 'New AlphaFold model achieves breakthrough accuracy',
            contentSnippet: 'Protein folding breakthrough',
            pubDate: new Date().toISOString(),
            categories: ['Research', 'AlphaFold'],
          },
          {
            title: 'Gemini: Our Most Capable AI Model',
            link: 'https://deepmind.google/blog/gemini',
            content: 'Introducing Gemini, a multimodal AI model',
            contentSnippet: 'Multimodal AI breakthrough',
            pubDate: new Date().toISOString(),
            categories: ['LLM', 'Multimodal'],
          },
        ],
      };

      mockParser.parseURL.mockResolvedValue(mockFeed);

      const result = await fetcher.fetch();

      expect(result.articles).toHaveLength(2);
      expect(result.articles[0].title).toContain('AlphaFold');
      expect(result.articles[1].title).toContain('Gemini');
    });

    it('302リダイレクトを処理して代替URLを試行する', async () => {
      // 最初のURL試行でリダイレクトエラー
      mockParser.parseURL
        .mockRejectedValueOnce(new Error('redirect error'))
        .mockResolvedValueOnce({
          items: [
            {
              title: 'AI Safety Research',
              link: 'https://deepmind.google/blog/ai-safety',
              content: 'AI alignment and safety research',
              pubDate: new Date().toISOString(),
            },
          ],
        });

      const result = await fetcher.fetch();

      // 代替URLで成功
      expect(result.articles).toHaveLength(1);
      expect(result.articles[0].title).toContain('AI Safety');
      expect(mockParser.parseURL).toHaveBeenCalledTimes(2);
    });

    it('DeepMind特有のキーワードをタグに追加する', async () => {
      const mockFeed = {
        items: [
          {
            title: 'Reinforcement Learning for Robotics',
            link: 'https://deepmind.google/blog/rl-robotics',
            content: 'Using reinforcement learning and neural networks for robotics control',
            pubDate: new Date().toISOString(),
            categories: ['Research'],
          },
        ],
      };

      mockParser.parseURL.mockResolvedValue(mockFeed);

      const result = await fetcher.fetch();

      expect(result.articles).toHaveLength(1);

      const content = result.articles[0].content.toLowerCase();
      expect(content).toContain('reinforcement learning');
      expect(content).toContain('neural network');
      expect(content).toContain('robotics');
    });

    it('DeepMind記事は低い信頼度でも採用する', async () => {
      const mockFeed = {
        items: [
          {
            title: 'Mathematical Reasoning Progress', // AI/LLMキーワードが少ない
            link: 'https://deepmind.google/blog/math-reasoning',
            content: 'Advances in mathematical problem solving',
            pubDate: new Date().toISOString(),
          },
        ],
      };

      mockParser.parseURL.mockResolvedValue(mockFeed);

      const result = await fetcher.fetch();

      // DeepMindの記事なので信頼度が低くても採用される
      expect(result.articles).toHaveLength(1);
      expect(result.articles[0].title).toContain('Mathematical Reasoning');
    });

    it('30日以内の記事のみを取得する', async () => {
      const now = new Date();
      const oldDate = new Date();
      oldDate.setDate(oldDate.getDate() - 40); // 40日前

      const mockFeed = {
        items: [
          {
            title: 'Recent Breakthrough in AI',
            link: 'https://deepmind.google/blog/recent',
            content: 'Recent AI research',
            pubDate: now.toISOString(),
          },
          {
            title: 'Old Research Paper',
            link: 'https://deepmind.google/blog/old',
            content: 'Old research',
            pubDate: oldDate.toISOString(),
          },
        ],
      };

      mockParser.parseURL.mockResolvedValue(mockFeed);

      const result = await fetcher.fetch();

      expect(result.articles).toHaveLength(1);
      expect(result.articles[0].title).toContain('Recent Breakthrough');
    });

    it('最大40件まで取得する', async () => {
      const items = Array.from({ length: 50 }, (_, i) => ({
        title: `AI Research Paper ${i + 1}`,
        link: `https://deepmind.google/blog/paper-${i + 1}`,
        content: `Research content ${i + 1}`,
        pubDate: new Date().toISOString(),
      }));

      const mockFeed = { items };
      mockParser.parseURL.mockResolvedValue(mockFeed);

      const result = await fetcher.fetch();

      expect(result.articles).toHaveLength(40);
    });

    it('メディアサムネイルを抽出する', async () => {
      const mockFeed = {
        items: [
          {
            title: 'Vision-Language Models',
            link: 'https://deepmind.google/blog/vision-language',
            content: 'Multimodal AI research',
            'media:thumbnail': {
              $: {
                url: 'https://deepmind.google/images/vision-model.jpg',
              },
            },
            pubDate: new Date().toISOString(),
          },
        ],
      };

      mockParser.parseURL.mockResolvedValue(mockFeed);

      const result = await fetcher.fetch();

      expect(result.articles).toHaveLength(1);
      expect(result.articles[0].thumbnail).toBe('https://deepmind.google/images/vision-model.jpg');
    });

    it('コンテンツからサムネイルを抽出する', async () => {
      const mockFeed = {
        items: [
          {
            title: 'Neural Architecture Search',
            link: 'https://deepmind.google/blog/nas',
            content: '<img src="https://deepmind.google/assets/nas-diagram.png" /> NAS research',
            pubDate: new Date().toISOString(),
          },
        ],
      };

      mockParser.parseURL.mockResolvedValue(mockFeed);

      const result = await fetcher.fetch();

      expect(result.articles).toHaveLength(1);
      expect(result.articles[0].thumbnail).toBe('https://deepmind.google/assets/nas-diagram.png');
    });

    it('デフォルトのDeepMindロゴを使用する', async () => {
      const mockFeed = {
        items: [
          {
            title: 'AI Ethics Research',
            link: 'https://deepmind.google/blog/ai-ethics',
            content: 'Ethics in AI development', // 画像なし
            pubDate: new Date().toISOString(),
          },
        ],
      };

      mockParser.parseURL.mockResolvedValue(mockFeed);

      const result = await fetcher.fetch();

      expect(result.articles).toHaveLength(1);
      expect(result.articles[0].thumbnail).toBe('https://deepmind.google/assets/images/deepmind-logo.png');
    });

    it('deepmind.comからdeepmind.googleへのURL変換', async () => {
      const mockFeed = {
        items: [
          {
            title: 'Legacy Research',
            link: 'https://deepmind.com/blog/legacy',
            content: '<img src="https://deepmind.com/images/old.jpg" />',
            pubDate: new Date().toISOString(),
          },
        ],
      };

      mockParser.parseURL.mockResolvedValue(mockFeed);

      const result = await fetcher.fetch();

      expect(result.articles).toHaveLength(1);
      expect(result.articles[0].thumbnail).toBe('https://deepmind.google/images/old.jpg');
    });

    it('HTMLエンティティを正しくデコードする', async () => {
      const mockFeed = {
        items: [
          {
            title: 'AI &amp; Society &#8212; DeepMind&#8217;s Approach',
            link: 'https://deepmind.google/blog/ai-society',
            content: 'AI and society research',
            pubDate: new Date().toISOString(),
          },
        ],
      };

      mockParser.parseURL.mockResolvedValue(mockFeed);

      const result = await fetcher.fetch();

      expect(result.articles).toHaveLength(1);
      expect(result.articles[0].title).toBe("AI & Society — DeepMind's Approach");
    });

    it('DeepMind特有のプロジェクトをカテゴリに追加', async () => {
      const mockFeed = {
        items: [
          {
            title: 'AlphaGo Beats World Champion',
            link: 'https://deepmind.google/blog/alphago-victory',
            content: 'AlphaGo achievement in Go game. Also mentions AlphaFold and Sparrow.',
            pubDate: new Date().toISOString(),
          },
        ],
      };

      mockParser.parseURL.mockResolvedValue(mockFeed);

      const result = await fetcher.fetch();

      expect(result.articles).toHaveLength(1);

      const content = result.articles[0].content.toLowerCase();
      // DeepMind特有のプロジェクト名が含まれる
      expect(content).toContain('alphago');
      expect(content).toContain('alphafold');
      expect(content).toContain('sparrow');
    });

    it('研究分野のハイライトを生成', async () => {
      const mockFeed = {
        items: [
          {
            title: 'Transformer Models for Language Understanding',
            link: 'https://deepmind.google/blog/transformers',
            content: 'Research on attention mechanisms and self-supervised learning',
            pubDate: new Date().toISOString(),
          },
        ],
      };

      mockParser.parseURL.mockResolvedValue(mockFeed);

      const result = await fetcher.fetch();

      expect(result.articles).toHaveLength(1);
      expect(result.articles[0].content).toContain('Research Areas:');
      expect(result.articles[0].content).toContain('About DeepMind:');
    });

    it('著者情報をコンテンツに含める', async () => {
      const mockFeed = {
        items: [
          {
            title: 'New AI Safety Framework',
            link: 'https://deepmind.google/blog/safety-framework',
            content: 'Safety research',
            author: 'Demis Hassabis, Shane Legg',
            pubDate: new Date().toISOString(),
          },
        ],
      };

      mockParser.parseURL.mockResolvedValue(mockFeed);

      const result = await fetcher.fetch();

      expect(result.articles).toHaveLength(1);
      expect(result.articles[0].content).toContain('Authors: Demis Hassabis, Shane Legg');
    });
  });
});