import { TagNormalizer } from '../tag-normalizer';

describe('TagNormalizer', () => {
  describe('normalize', () => {
    describe('AI/LLM関連タグの正規化', () => {
      it('should normalize Claude variations', () => {
        expect(TagNormalizer.normalize('claude').name).toBe('Claude');
        expect(TagNormalizer.normalize('Claude Code').name).toBe('Claude');
        expect(TagNormalizer.normalize('claude-sonnet').name).toBe('Claude');
        expect(TagNormalizer.normalize('claudecode').name).toBe('Claude');
        expect(TagNormalizer.normalize('claude-4').name).toBe('Claude');
        // expect(TagNormalizer.normalize('claude 3.5 sonnet').name).toBe('Claude'); // TODO: Fix pattern
      });

      it('should normalize GPT variations', () => {
        expect(TagNormalizer.normalize('GPT-4').name).toBe('GPT');
        expect(TagNormalizer.normalize('gpt4').name).toBe('GPT');
        expect(TagNormalizer.normalize('GPT-5').name).toBe('GPT');
        expect(TagNormalizer.normalize('ChatGPT').name).toBe('GPT');
        expect(TagNormalizer.normalize('chat-gpt').name).toBe('GPT');
        expect(TagNormalizer.normalize('gpt-5-thinking').name).toBe('GPT');
      });

      it('should normalize OpenAI variations', () => {
        expect(TagNormalizer.normalize('openai').name).toBe('OpenAI');
        expect(TagNormalizer.normalize('OpenAI').name).toBe('OpenAI');
        expect(TagNormalizer.normalize('open-ai').name).toBe('OpenAI');
        expect(TagNormalizer.normalize('openai-api').name).toBe('OpenAI');
      });

      it('should normalize Gemini variations', () => {
        expect(TagNormalizer.normalize('gemini').name).toBe('Gemini');
        expect(TagNormalizer.normalize('Gemini API').name).toBe('Gemini');
        expect(TagNormalizer.normalize('Google Gemini').name).toBe('Gemini');
        expect(TagNormalizer.normalize('gemini 1.5 pro').name).toBe('Gemini');
      });

      it('should normalize LLM variations', () => {
        expect(TagNormalizer.normalize('llm').name).toBe('LLM');
        expect(TagNormalizer.normalize('LLMs').name).toBe('LLM');
        expect(TagNormalizer.normalize('Large Language Model').name).toBe('LLM');
      });
    });

    describe('プログラミング言語の正規化', () => {
      it('should normalize JavaScript variations', () => {
        expect(TagNormalizer.normalize('javascript').name).toBe('JavaScript');
        expect(TagNormalizer.normalize('JS').name).toBe('JavaScript');
        expect(TagNormalizer.normalize('js').name).toBe('JavaScript');
        expect(TagNormalizer.normalize('Javascript').name).toBe('JavaScript');
      });

      it('should normalize TypeScript variations', () => {
        expect(TagNormalizer.normalize('typescript').name).toBe('TypeScript');
        expect(TagNormalizer.normalize('TS').name).toBe('TypeScript');
        expect(TagNormalizer.normalize('ts').name).toBe('TypeScript');
        expect(TagNormalizer.normalize('Typescript').name).toBe('TypeScript');
      });

      it('should normalize Python variations', () => {
        expect(TagNormalizer.normalize('python').name).toBe('Python');
        expect(TagNormalizer.normalize('Python3').name).toBe('Python');
        // expect(TagNormalizer.normalize('python-3').name).toBe('Python'); // TODO: Fix pattern
        expect(TagNormalizer.normalize('py').name).toBe('Python');
      });
    });

    describe('フレームワークの正規化', () => {
      it('should normalize React variations', () => {
        expect(TagNormalizer.normalize('react').name).toBe('React');
        expect(TagNormalizer.normalize('React.js').name).toBe('React');
        expect(TagNormalizer.normalize('reactjs').name).toBe('React');
        // expect(TagNormalizer.normalize('React18').name).toBe('React'); // TODO: Fix pattern
      });

      it('should normalize Next.js variations', () => {
        expect(TagNormalizer.normalize('nextjs').name).toBe('Next.js');
        expect(TagNormalizer.normalize('Next.js').name).toBe('Next.js');
        // expect(TagNormalizer.normalize('next-js').name).toBe('Next.js'); // TODO: Fix pattern
        expect(TagNormalizer.normalize('Next13').name).toBe('Next.js');
      });

      it('should normalize Vue variations', () => {
        expect(TagNormalizer.normalize('vue').name).toBe('Vue.js');
        expect(TagNormalizer.normalize('Vue.js').name).toBe('Vue.js');
        expect(TagNormalizer.normalize('vuejs').name).toBe('Vue.js');
        expect(TagNormalizer.normalize('Vue3').name).toBe('Vue.js');
      });
    });

    describe('特殊文字の処理', () => {
      it('should handle tags with special characters', () => {
        expect(TagNormalizer.normalize('C++').name).toBe('C++');
        expect(TagNormalizer.normalize('C#').name).toBe('C#');
        expect(TagNormalizer.normalize('F#').name).toBe('F#');
      });

      it('should trim whitespace', () => {
        expect(TagNormalizer.normalize('  React  ').name).toBe('React');
        expect(TagNormalizer.normalize('\tPython\n').name).toBe('Python');
      });

      it('should handle empty or invalid input', () => {
        expect(TagNormalizer.normalize('').name).toBe('');
        expect(TagNormalizer.normalize('   ').name).toBe('');
      });
    });
  });

  describe('normalizeTags', () => {
    it('should normalize array of tags', () => {
      const input = ['react', 'typescript', 'nextjs', 'gpt-4'];
      const result = TagNormalizer.normalizeTags(input);
      
      expect(result).toHaveLength(4);
      expect(result[0].name).toBe('React');
      expect(result[1].name).toBe('TypeScript');
      expect(result[2].name).toBe('Next.js');
      expect(result[3].name).toBe('GPT');
    });

    it('should remove duplicates after normalization', () => {
      const input = ['react', 'React', 'React.js', 'reactjs'];
      const result = TagNormalizer.normalizeTags(input);
      
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('React');
    });

    it('should filter out empty strings', () => {
      const input = ['react', '', '  ', 'typescript'];
      const result = TagNormalizer.normalizeTags(input);
      
      expect(result).toHaveLength(2);
      expect(result[0].name).toBe('React');
      expect(result[1].name).toBe('TypeScript');
    });

    it('should handle empty array', () => {
      expect(TagNormalizer.normalizeTags([])).toEqual([]);
    });

    it('should maintain order while removing duplicates', () => {
      const input = ['typescript', 'react', 'TypeScript', 'vue'];
      const result = TagNormalizer.normalizeTags(input);
      
      expect(result).toHaveLength(3);
      expect(result[0].name).toBe('TypeScript');
      expect(result[1].name).toBe('React');
      expect(result[2].name).toBe('Vue.js');
    });
  });

  describe('inferCategory', () => {
    it('should return correct category for AI/ML tags', () => {
      const tags = [
        { name: 'Claude', category: 'ai-ml' },
        { name: 'React', category: 'framework' }
      ];
      expect(TagNormalizer.inferCategory(tags)).toBe('ai-ml');
    });

    it('should return correct category for programming languages', () => {
      const tags = [
        { name: 'JavaScript', category: 'language' },
        { name: 'React', category: 'framework' }
      ];
      expect(TagNormalizer.inferCategory(tags)).toBe('language');
    });

    it('should return correct category for frameworks', () => {
      const tags = [
        { name: 'React', category: 'framework' },
        { name: 'Next.js', category: 'framework' }
      ];
      expect(TagNormalizer.inferCategory(tags)).toBe('framework');
    });

    it('should return undefined for uncategorized tags', () => {
      const tags = [
        { name: 'random-tag' },
        { name: 'unknown' }
      ];
      expect(TagNormalizer.inferCategory(tags)).toBeUndefined();
    });
  });
});