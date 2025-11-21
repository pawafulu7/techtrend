import { articleQaAgent } from '@/lib/rag/agents/article-qa-agent';

describe('ArticleQaAgent', () => {
  it('should be defined', () => {
    expect(articleQaAgent).toBeDefined();
  });

  it('should be an Agent instance with expected structure', () => {
    // Agent is opaque, but we can verify basic structure
    expect(articleQaAgent).toBeTruthy();
    expect(typeof articleQaAgent).toBe('object');
  });

  it('should have tools configured', () => {
    // Verify tools property exists (Agent SDK internal structure)
    expect(articleQaAgent).toHaveProperty('tools');
  });

  it('should be ready for execution', () => {
    // Verify agent can be invoked (has necessary methods)
    expect(articleQaAgent).toHaveProperty('generate');
    expect(articleQaAgent).toHaveProperty('stream');
    expect(typeof articleQaAgent.generate).toBe('function');
    expect(typeof articleQaAgent.stream).toBe('function');
  });
});
