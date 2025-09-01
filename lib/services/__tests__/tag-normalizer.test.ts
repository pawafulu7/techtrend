import { TagNormalizer } from '../tag-normalizer';

describe('TagNormalizer', () => {
  describe('normalizeTag', () => {
    describe('AI/LLM関連タグの正規化', () => {
      it('should normalize Claude variations', () => {
        expect(TagNormalizer.normalizeTag('claude')).toBe('Claude');
        expect(TagNormalizer.normalizeTag('Claude Code')).toBe('Claude');
        expect(TagNormalizer.normalizeTag('claude-sonnet')).toBe('Claude');
        expect(TagNormalizer.normalizeTag('claudecode')).toBe('Claude');
        expect(TagNormalizer.normalizeTag('claude-4')).toBe('Claude');
        expect(TagNormalizer.normalizeTag('claude 3.5 sonnet')).toBe('Claude');
      });

      it('should normalize GPT variations', () => {
        expect(TagNormalizer.normalizeTag('GPT-4')).toBe('GPT');
        expect(TagNormalizer.normalizeTag('gpt4')).toBe('GPT');
        expect(TagNormalizer.normalizeTag('GPT-5')).toBe('GPT');
        expect(TagNormalizer.normalizeTag('ChatGPT')).toBe('GPT');
        expect(TagNormalizer.normalizeTag('chat-gpt')).toBe('GPT');
        expect(TagNormalizer.normalizeTag('gpt-5-thinking')).toBe('GPT');
      });

      it('should normalize OpenAI variations', () => {
        expect(TagNormalizer.normalizeTag('openai')).toBe('OpenAI');
        expect(TagNormalizer.normalizeTag('OpenAI')).toBe('OpenAI');
        expect(TagNormalizer.normalizeTag('open-ai')).toBe('OpenAI');
        expect(TagNormalizer.normalizeTag('openai-api')).toBe('OpenAI');
      });

      it('should normalize Gemini variations', () => {
        expect(TagNormalizer.normalizeTag('gemini')).toBe('Gemini');
        expect(TagNormalizer.normalizeTag('Gemini API')).toBe('Gemini');
        expect(TagNormalizer.normalizeTag('Google Gemini')).toBe('Gemini');
        expect(TagNormalizer.normalizeTag('gemini 1.5 pro')).toBe('Gemini');
      });

      it('should normalize LLM variations', () => {
        expect(TagNormalizer.normalizeTag('llm')).toBe('LLM');
        expect(TagNormalizer.normalizeTag('LLMs')).toBe('LLM');
        expect(TagNormalizer.normalizeTag('Large Language Model')).toBe('LLM');
      });
    });

    describe('プログラミング言語の正規化', () => {
      it('should normalize JavaScript variations', () => {
        expect(TagNormalizer.normalizeTag('javascript')).toBe('JavaScript');
        expect(TagNormalizer.normalizeTag('JS')).toBe('JavaScript');
        expect(TagNormalizer.normalizeTag('js')).toBe('JavaScript');
        expect(TagNormalizer.normalizeTag('Javascript')).toBe('JavaScript');
      });

      it('should normalize TypeScript variations', () => {
        expect(TagNormalizer.normalizeTag('typescript')).toBe('TypeScript');
        expect(TagNormalizer.normalizeTag('TS')).toBe('TypeScript');
        expect(TagNormalizer.normalizeTag('ts')).toBe('TypeScript');
        expect(TagNormalizer.normalizeTag('Typescript')).toBe('TypeScript');
      });

      it('should normalize Python variations', () => {
        expect(TagNormalizer.normalizeTag('python')).toBe('Python');
        expect(TagNormalizer.normalizeTag('Python3')).toBe('Python');
        expect(TagNormalizer.normalizeTag('python-3')).toBe('Python');
        expect(TagNormalizer.normalizeTag('py')).toBe('Python');
      });
    });

    describe('フレームワークの正規化', () => {
      it('should normalize React variations', () => {
        expect(TagNormalizer.normalizeTag('react')).toBe('React');
        expect(TagNormalizer.normalizeTag('React.js')).toBe('React');
        expect(TagNormalizer.normalizeTag('reactjs')).toBe('React');
        expect(TagNormalizer.normalizeTag('React18')).toBe('React');
      });

      it('should normalize Next.js variations', () => {
        expect(TagNormalizer.normalizeTag('nextjs')).toBe('Next.js');
        expect(TagNormalizer.normalizeTag('Next.js')).toBe('Next.js');
        expect(TagNormalizer.normalizeTag('next-js')).toBe('Next.js');
        expect(TagNormalizer.normalizeTag('Next13')).toBe('Next.js');
      });

      it('should normalize Vue variations', () => {
        expect(TagNormalizer.normalizeTag('vue')).toBe('Vue.js');
        expect(TagNormalizer.normalizeTag('Vue.js')).toBe('Vue.js');
        expect(TagNormalizer.normalizeTag('vuejs')).toBe('Vue.js');
        expect(TagNormalizer.normalizeTag('Vue3')).toBe('Vue.js');
      });
    });

    describe('特殊文字の処理', () => {
      it('should handle tags with special characters', () => {
        expect(TagNormalizer.normalizeTag('C++')).toBe('C++');
        expect(TagNormalizer.normalizeTag('C#')).toBe('C#');
        expect(TagNormalizer.normalizeTag('F#')).toBe('F#');
      });

      it('should trim whitespace', () => {
        expect(TagNormalizer.normalizeTag('  React  ')).toBe('React');
        expect(TagNormalizer.normalizeTag('\tPython\n')).toBe('Python');
      });

      it('should handle empty or invalid input', () => {
        expect(TagNormalizer.normalizeTag('')).toBe('');
        expect(TagNormalizer.normalizeTag('   ')).toBe('');
      });
    });
  });

  describe('normalizeTags', () => {
    it('should normalize array of tags', () => {
      const input = ['react', 'typescript', 'nextjs', 'gpt-4'];
      const expected = ['React', 'TypeScript', 'Next.js', 'GPT'];
      
      expect(TagNormalizer.normalizeTags(input)).toEqual(expected);
    });

    it('should remove duplicates after normalization', () => {
      const input = ['react', 'React', 'React.js', 'reactjs'];
      const expected = ['React'];
      
      expect(TagNormalizer.normalizeTags(input)).toEqual(expected);
    });

    it('should filter out empty strings', () => {
      const input = ['react', '', '  ', 'typescript'];
      const expected = ['React', 'TypeScript'];
      
      expect(TagNormalizer.normalizeTags(input)).toEqual(expected);
    });

    it('should handle empty array', () => {
      expect(TagNormalizer.normalizeTags([])).toEqual([]);
    });

    it('should maintain order while removing duplicates', () => {
      const input = ['typescript', 'react', 'TypeScript', 'vue'];
      const expected = ['TypeScript', 'React', 'Vue.js'];
      
      expect(TagNormalizer.normalizeTags(input)).toEqual(expected);
    });
  });

  describe('getCategory', () => {
    it('should return correct category for AI/ML tags', () => {
      expect(TagNormalizer.getCategory('Claude')).toBe('ai-ml');
      expect(TagNormalizer.getCategory('GPT')).toBe('ai-ml');
      expect(TagNormalizer.getCategory('LLM')).toBe('ai-ml');
    });

    it('should return correct category for programming languages', () => {
      expect(TagNormalizer.getCategory('JavaScript')).toBe('programming-language');
      expect(TagNormalizer.getCategory('Python')).toBe('programming-language');
      expect(TagNormalizer.getCategory('TypeScript')).toBe('programming-language');
    });

    it('should return correct category for frameworks', () => {
      expect(TagNormalizer.getCategory('React')).toBe('framework');
      expect(TagNormalizer.getCategory('Next.js')).toBe('framework');
      expect(TagNormalizer.getCategory('Vue.js')).toBe('framework');
    });

    it('should return undefined for uncategorized tags', () => {
      expect(TagNormalizer.getCategory('random-tag')).toBeUndefined();
      expect(TagNormalizer.getCategory('unknown')).toBeUndefined();
    });
  });
});