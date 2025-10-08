/**
 * NVIDIA Developer Blog Fetcher テストケース
 */

import { NVIDIADeveloperBlogFetcher } from '@/lib/fetchers/nvidia-developer-blog';
import { Source } from '@prisma/client';
import { aiLLMFilter } from '@/lib/filters/ai-llm-filter';

// モックデータ
const mockSource: Source = {
  id: 'test-nvidia-source',
  name: 'NVIDIA Developer Blog',
  url: 'https://developer.nvidia.com/blog/feed',
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

describe('NVIDIADeveloperBlogFetcher', () => {
  let fetcher: NVIDIADeveloperBlogFetcher;
  let mockParser: any;

  beforeEach(() => {
    jest.clearAllMocks();
    fetcher = new NVIDIADeveloperBlogFetcher(mockSource);

    // parserのモックを取得
    const Parser = require('rss-parser');
    mockParser = new Parser();
  });

  describe('fetch', () => {
    it('AI/LLM関連記事のみを取得する', async () => {
      const mockFeed = {
        items: [
          {
            title: 'Accelerating Large Language Models with TensorRT',
            link: 'https://developer.nvidia.com/blog/llm-tensorrt',
            content: 'Optimize LLM inference using TensorRT for faster performance',
            contentSnippet: 'Learn how to accelerate LLM inference',
            pubDate: new Date().toISOString(),
            categories: ['AI', 'Deep Learning'],
          },
          {
            title: 'CUDA Programming Best Practices',
            link: 'https://developer.nvidia.com/blog/cuda-best-practices',
            content: 'GPU programming optimization techniques',
            contentSnippet: 'CUDA optimization guide',
            pubDate: new Date().toISOString(),
            categories: ['CUDA', 'GPU'],
          },
          {
            title: 'Gaming Graphics Update', // AI関連でない記事
            link: 'https://developer.nvidia.com/blog/gaming-graphics',
            content: 'Latest gaming graphics features',
            contentSnippet: 'Gaming graphics news',
            pubDate: new Date().toISOString(),
            categories: ['Gaming'],
          },
        ],
      };

      mockParser.parseURL.mockResolvedValue(mockFeed);

      const result = await fetcher.fetch();

      // AI/LLM関連記事のみが含まれることを確認
      expect(result.articles).toHaveLength(2);
      expect(result.articles[0].title).toContain('Large Language Models');
      expect(result.articles[1].title).toContain('CUDA');

      // Gaming記事は除外されている
      const titles = result.articles.map(a => a.title);
      expect(titles).not.toContain('Gaming Graphics Update');
    });

    it('30日以内の記事のみを取得する', async () => {
      const now = new Date();
      const oldDate = new Date();
      oldDate.setDate(oldDate.getDate() - 40); // 40日前

      const mockFeed = {
        items: [
          {
            title: 'Recent AI Development with GPT',
            link: 'https://developer.nvidia.com/blog/recent-ai',
            content: 'Recent GPT developments',
            pubDate: now.toISOString(),
            categories: ['AI'],
          },
          {
            title: 'Old AI Article about LLM',
            link: 'https://developer.nvidia.com/blog/old-ai',
            content: 'Old LLM article',
            pubDate: oldDate.toISOString(),
            categories: ['AI'],
          },
        ],
      };

      mockParser.parseURL.mockResolvedValue(mockFeed);

      const result = await fetcher.fetch();

      expect(result.articles).toHaveLength(1);
      expect(result.articles[0].title).toContain('Recent AI Development');
    });

    it('NVIDIA特有のキーワードをタグに追加する', async () => {
      const mockFeed = {
        items: [
          {
            title: 'TensorRT Optimization for Transformer Models',
            link: 'https://developer.nvidia.com/blog/tensorrt-transformers',
            content: 'Using TensorRT and CUDA for optimizing transformer inference on DGX systems',
            pubDate: new Date().toISOString(),
            categories: ['AI', 'Inference'],
          },
        ],
      };

      mockParser.parseURL.mockResolvedValue(mockFeed);

      const result = await fetcher.fetch();

      expect(result.articles).toHaveLength(1);

      // contentにNVIDIA特有のキーワードが含まれることを確認
      const content = result.articles[0].content.toLowerCase();
      expect(content).toContain('tensorrt');
      expect(content).toContain('cuda');
      expect(content).toContain('dgx');
    });

    it('記事が見つからない場合は空配列を返す', async () => {
      const mockFeed = {
        items: [],
      };

      mockParser.parseURL.mockResolvedValue(mockFeed);

      const result = await fetcher.fetch();

      expect(result.articles).toHaveLength(0);
      expect(result.errors).toHaveLength(0);
    });

    it('フィード取得エラー時はエラー配列に含める', async () => {
      mockParser.parseURL.mockRejectedValue(new Error('Network error'));

      const result = await fetcher.fetch();

      expect(result.articles).toHaveLength(0);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].message).toContain('Network error');
    });

    it('最大50件まで取得する', async () => {
      const items = Array.from({ length: 60 }, (_, i) => ({
        title: `AI Article ${i + 1} about LLM`,
        link: `https://developer.nvidia.com/blog/ai-article-${i + 1}`,
        content: `Content about LLM and AI ${i + 1}`,
        pubDate: new Date().toISOString(),
        categories: ['AI'],
      }));

      const mockFeed = { items };
      mockParser.parseURL.mockResolvedValue(mockFeed);

      const result = await fetcher.fetch();

      expect(result.articles).toHaveLength(50);
    });

    it('サムネイル画像を正しく抽出する', async () => {
      const mockFeed = {
        items: [
          {
            title: 'AI Model Deployment',
            link: 'https://developer.nvidia.com/blog/ai-deployment',
            content: '<img src="https://developer.nvidia.com/images/ai-model.jpg" /> AI deployment guide',
            pubDate: new Date().toISOString(),
            categories: ['AI'],
          },
        ],
      };

      mockParser.parseURL.mockResolvedValue(mockFeed);

      const result = await fetcher.fetch();

      expect(result.articles).toHaveLength(1);
      expect(result.articles[0].thumbnail).toBe('https://developer.nvidia.com/images/ai-model.jpg');
    });

    it('相対URLのサムネイルを絶対URLに変換する', async () => {
      const mockFeed = {
        items: [
          {
            title: 'Deep Learning Framework',
            link: 'https://developer.nvidia.com/blog/dl-framework',
            content: '<img src="/images/deep-learning.png" /> Deep learning content',
            pubDate: new Date().toISOString(),
            categories: ['AI'],
          },
        ],
      };

      mockParser.parseURL.mockResolvedValue(mockFeed);

      const result = await fetcher.fetch();

      expect(result.articles).toHaveLength(1);
      expect(result.articles[0].thumbnail).toBe('https://developer.nvidia.com/images/deep-learning.png');
    });

    it('HTMLエンティティを正しくデコードする', async () => {
      const mockFeed = {
        items: [
          {
            title: 'AI &amp; Machine Learning &#8211; What&#8217;s Next',
            link: 'https://developer.nvidia.com/blog/ai-ml-next',
            content: 'AI and ML developments',
            pubDate: new Date().toISOString(),
            categories: ['AI'],
          },
        ],
      };

      mockParser.parseURL.mockResolvedValue(mockFeed);

      const result = await fetcher.fetch();

      expect(result.articles).toHaveLength(1);
      expect(result.articles[0].title).toBe("AI & Machine Learning – What's Next");
    });

    it('著者情報をコンテンツに含める', async () => {
      const mockFeed = {
        items: [
          {
            title: 'Advanced AI Techniques',
            link: 'https://developer.nvidia.com/blog/advanced-ai',
            content: 'Advanced AI content',
            'dc:creator': 'John Doe',
            pubDate: new Date().toISOString(),
            categories: ['AI'],
          },
        ],
      };

      mockParser.parseURL.mockResolvedValue(mockFeed);

      const result = await fetcher.fetch();

      expect(result.articles).toHaveLength(1);
      expect(result.articles[0].content).toContain('Author: John Doe');
    });
  });

  describe('AI/LLMフィルタリング統合', () => {
    it('aiLLMFilterを使用して記事をフィルタリングする', async () => {
      const mockFeed = {
        items: [
          {
            title: 'Transformers and GPT Models',
            link: 'https://developer.nvidia.com/blog/transformers',
            content: 'Deep dive into transformer architecture',
            pubDate: new Date().toISOString(),
          },
          {
            title: 'Generic Software Development', // AI関連でない
            link: 'https://developer.nvidia.com/blog/software-dev',
            content: 'Software development best practices',
            pubDate: new Date().toISOString(),
          },
        ],
      };

      mockParser.parseURL.mockResolvedValue(mockFeed);

      const result = await fetcher.fetch();

      // Transformerの記事は含まれる
      const hasTrans = result.articles.some(a => a.title.includes('Transformers'));
      expect(hasTrans).toBe(true);

      // Generic Softwareの記事は含まれない
      const hasGeneric = result.articles.some(a => a.title.includes('Generic Software'));
      expect(hasGeneric).toBe(false);
    });

    it('マッチしたAIキーワードをタグに追加する', async () => {
      const mockFeed = {
        items: [
          {
            title: 'Fine-tuning LLMs with LoRA',
            link: 'https://developer.nvidia.com/blog/lora-finetuning',
            content: 'Learn about PEFT methods and efficient fine-tuning',
            pubDate: new Date().toISOString(),
            categories: ['ML'],
          },
        ],
      };

      mockParser.parseURL.mockResolvedValue(mockFeed);

      const result = await fetcher.fetch();

      expect(result.articles).toHaveLength(1);

      const content = result.articles[0].content.toLowerCase();
      // AI/LLMキーワードがコンテンツに含まれる
      expect(content).toContain('lora');
      expect(content).toContain('llm');
    });
  });
});