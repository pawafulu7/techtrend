import {
  buildArticlePostPrompt,
  buildOpinionPrompt,
  ArticlePostPromptInput,
  extractBalancedJson,
} from '@/lib/social-post/prompts/x-post-prompt';
import type { OpinionForPrompt } from '@/lib/social-post/types';

describe('buildArticlePostPrompt', () => {
  it('should include article title and detailedSummary in prompt', () => {
    const input: ArticlePostPromptInput = {
      title: 'Grafana 11.0リリース',
      detailedSummary:
        '## 主な変更点\n- アラート統合の改善\n- ダッシュボード性能向上',
      category: 'DevOps',
      tags: ['Grafana', 'Observability'],
    };

    const prompt = buildArticlePostPrompt(input);

    expect(prompt).toContain('Grafana 11.0リリース');
    expect(prompt).toContain('アラート統合の改善');
    expect(prompt).toContain('SREエンジニア');
  });

  it('should include style options', () => {
    const input: ArticlePostPromptInput = {
      title: 'Test Article',
      detailedSummary: 'Test summary',
      category: 'Tech',
      tags: [],
    };

    const prompt = buildArticlePostPrompt(input);

    expect(prompt).toContain('感想型');
    expect(prompt).toContain('示唆型');
    expect(prompt).toContain('文脈型');
  });

  it('should include prohibition rules', () => {
    const input: ArticlePostPromptInput = {
      title: 'Test Article',
      detailedSummary: 'Test summary',
      category: 'Tech',
      tags: [],
    };

    const prompt = buildArticlePostPrompt(input);

    expect(prompt).toContain('驚き屋');
    expect(prompt).toContain('誇張');
    expect(prompt).toContain('嘘');
  });

  it('should handle missing detailedSummary by using fallback summary', () => {
    const input: ArticlePostPromptInput = {
      title: 'Test Article',
      detailedSummary: null,
      summary: 'Fallback summary content',
      category: 'Tech',
      tags: [],
    };

    const prompt = buildArticlePostPrompt(input);

    expect(prompt).toContain('Fallback summary content');
  });

  it('should throw error when both detailedSummary and summary are empty', () => {
    const input: ArticlePostPromptInput = {
      title: 'Test Article',
      detailedSummary: null,
      summary: null,
      category: 'Tech',
      tags: [],
    };

    expect(() => buildArticlePostPrompt(input)).toThrow(
      'Either detailedSummary or summary must be provided'
    );
  });

  it('should throw error when content is only whitespace', () => {
    const input: ArticlePostPromptInput = {
      title: 'Test Article',
      detailedSummary: '   ',
      summary: null,
      category: 'Tech',
      tags: [],
    };

    expect(() => buildArticlePostPrompt(input)).toThrow(
      'Either detailedSummary or summary must be provided'
    );
  });

  it('should include category and tags when provided', () => {
    const input: ArticlePostPromptInput = {
      title: 'Test Article',
      detailedSummary: 'Test summary',
      category: 'Infrastructure',
      tags: ['Kubernetes', 'Docker'],
    };

    const prompt = buildArticlePostPrompt(input);

    expect(prompt).toContain('Infrastructure');
    expect(prompt).toContain('Kubernetes');
    expect(prompt).toContain('Docker');
  });

  it('should handle null category gracefully', () => {
    const input: ArticlePostPromptInput = {
      title: 'Test Article',
      detailedSummary: 'Test summary',
      category: null,
      tags: [],
    };

    const prompt = buildArticlePostPrompt(input);

    // Should not throw and should not contain "カテゴリ: null"
    expect(prompt).not.toContain('カテゴリ: null');
    expect(prompt).toContain('Test Article');
  });
});

describe('extractBalancedJson', () => {
  it('should extract simple JSON object', () => {
    const input = '{"comment": "test", "style": "感想型"}';
    const result = extractBalancedJson(input);
    expect(result).toBe('{"comment": "test", "style": "感想型"}');
  });

  it('should extract JSON from text with prefix', () => {
    const input = 'Here is the result: {"comment": "test"}';
    const result = extractBalancedJson(input);
    expect(result).toBe('{"comment": "test"}');
  });

  it('should extract JSON from text with suffix', () => {
    const input = '{"comment": "test"} is the output';
    const result = extractBalancedJson(input);
    expect(result).toBe('{"comment": "test"}');
  });

  it('should handle nested JSON objects', () => {
    const input = '{"comment": "test", "meta": {"key": "value"}}';
    const result = extractBalancedJson(input);
    expect(result).toBe('{"comment": "test", "meta": {"key": "value"}}');
  });

  it('should handle braces inside strings', () => {
    const input = '{"comment": "function() { return {}; }"}';
    const result = extractBalancedJson(input);
    expect(result).toBe('{"comment": "function() { return {}; }"}');
  });

  it('should handle escaped quotes inside strings', () => {
    const input = '{"comment": "He said \\"hello\\""}';
    const result = extractBalancedJson(input);
    expect(result).toBe('{"comment": "He said \\"hello\\""}');
  });

  it('should handle escaped backslashes', () => {
    const input = '{"path": "C:\\\\Users\\\\test"}';
    const result = extractBalancedJson(input);
    expect(result).toBe('{"path": "C:\\\\Users\\\\test"}');
  });

  it('should return null when no JSON found', () => {
    const input = 'No JSON here';
    const result = extractBalancedJson(input);
    expect(result).toBeNull();
  });

  it('should return null for empty input', () => {
    const result = extractBalancedJson('');
    expect(result).toBeNull();
  });

  it('should handle JSON with newlines', () => {
    const input = `{
      "comment": "test",
      "style": "示唆型"
    }`;
    const result = extractBalancedJson(input);
    expect(result).not.toBeNull();
    expect(JSON.parse(result!)).toEqual({
      comment: 'test',
      style: '示唆型',
    });
  });

  it('should extract first JSON when multiple objects exist', () => {
    const input = '{"first": 1} {"second": 2}';
    const result = extractBalancedJson(input);
    expect(result).toBe('{"first": 1}');
  });
});

describe('buildOpinionPrompt', () => {
  const mockOpinionData: OpinionForPrompt = {
    trendingTopics: [
      { topic: 'Kubernetes', count: 15 },
      { topic: 'Terraform', count: 12 },
      { topic: 'Docker', count: 10 },
    ],
    recentArticles: [
      { title: 'k8sでのGPUワークロード管理', category: 'Infrastructure' },
      { title: 'TerraformのState管理ベストプラクティス', category: 'IaC' },
    ],
    period: '1/23〜1/26',
  };

  it('should include detailed persona', () => {
    const prompt = buildOpinionPrompt(mockOpinionData);
    expect(prompt).toContain('運用歴10年のSREエンジニア');
    expect(prompt).toContain('ペルソナ');
  });

  it('should include style options', () => {
    const prompt = buildOpinionPrompt(mockOpinionData);
    expect(prompt).toContain('問題提起型');
    expect(prompt).toContain('主張型');
    expect(prompt).toContain('比較型');
  });

  it('should include prohibition rules', () => {
    const prompt = buildOpinionPrompt(mockOpinionData);
    expect(prompt).toContain('禁止事項');
    expect(prompt).toContain('AIっぽい表現');
  });

  it('should include assertion criteria', () => {
    const prompt = buildOpinionPrompt(mockOpinionData);
    expect(prompt).toContain('言い切りの基準');
  });

  it('should include trending topics', () => {
    const prompt = buildOpinionPrompt(mockOpinionData);
    expect(prompt).toContain('Kubernetes');
    expect(prompt).toContain('15件');
    expect(prompt).toContain('Terraform');
  });

  it('should include recent articles', () => {
    const prompt = buildOpinionPrompt(mockOpinionData);
    expect(prompt).toContain('k8sでのGPUワークロード管理');
  });

  it('should require style in output JSON', () => {
    const prompt = buildOpinionPrompt(mockOpinionData);
    expect(prompt).toContain('"style"');
  });

  it('should instruct to reference specific topic names', () => {
    const prompt = buildOpinionPrompt(mockOpinionData);
    expect(prompt).toMatch(/具体的.*トピック|トピック.*具体的|必ず.*言及/);
  });

  it('should use dynamic examples with actual topic names and article titles', () => {
    const prompt = buildOpinionPrompt(mockOpinionData);
    // 動的な例文に実際のトピック名が含まれているか
    expect(prompt).toContain('Kubernetes運用');
    expect(prompt).toContain('Terraform');
    // 記事タイトルも例文に使われているか
    expect(prompt).toContain('k8sでのGPUワークロード管理');
  });

  it('should handle empty trending topics gracefully', () => {
    const emptyData: OpinionForPrompt = {
      trendingTopics: [],
      recentArticles: [{ title: 'Test Article', category: 'Test' }],
      period: '1/23〜1/26',
    };
    const prompt = buildOpinionPrompt(emptyData);
    expect(prompt).toContain('特になし');
    // デフォルト値が使われる
    expect(prompt).toContain('k8s');
  });

  it('should handle empty recent articles gracefully', () => {
    const emptyData: OpinionForPrompt = {
      trendingTopics: [{ topic: 'Docker', count: 5 }],
      recentArticles: [],
      period: '1/23〜1/26',
    };
    const prompt = buildOpinionPrompt(emptyData);
    expect(prompt).toContain('Docker');
    expect(prompt).toContain('5件');
  });

  it('should include opinion-specific prohibition rules', () => {
    const prompt = buildOpinionPrompt(mockOpinionData);
    // Opinion固有の禁止ルール
    expect(prompt).toContain('圧倒的に多い');
    expect(prompt).toContain('具体的なトピック名を1つも含まない投稿は禁止');
  });
});
