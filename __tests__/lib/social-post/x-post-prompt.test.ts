import {
  buildArticlePostPrompt,
  ArticlePostPromptInput,
} from '@/lib/social-post/prompts/x-post-prompt';

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
