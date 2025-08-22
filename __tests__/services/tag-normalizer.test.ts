import { TagNormalizer } from '../../lib/services/tag-normalizer';

describe('TagNormalizer', () => {
  describe('normalize', () => {
    describe('AI/LLM関連', () => {
      it('Claudeの各種バリエーションを正規化', () => {
        expect(TagNormalizer.normalize('claude')).toEqual({ name: 'Claude', category: 'ai-ml' });
        expect(TagNormalizer.normalize('Claude Code')).toEqual({ name: 'Claude', category: 'ai-ml' });
        expect(TagNormalizer.normalize('claude-sonnet')).toEqual({ name: 'Claude', category: 'ai-ml' });
        expect(TagNormalizer.normalize('Claude 4')).toEqual({ name: 'Claude', category: 'ai-ml' });
        expect(TagNormalizer.normalize('claudecode')).toEqual({ name: 'Claude', category: 'ai-ml' });
      });

      it('GPTの各種バリエーションを正規化', () => {
        expect(TagNormalizer.normalize('GPT-4')).toEqual({ name: 'GPT', category: 'ai-ml' });
        expect(TagNormalizer.normalize('gpt4')).toEqual({ name: 'GPT', category: 'ai-ml' });
        expect(TagNormalizer.normalize('ChatGPT')).toEqual({ name: 'GPT', category: 'ai-ml' });
        expect(TagNormalizer.normalize('GPT-5')).toEqual({ name: 'GPT', category: 'ai-ml' });
        expect(TagNormalizer.normalize('gpt-5-thinking')).toEqual({ name: 'GPT', category: 'ai-ml' });
      });

      it('OpenAIの各種バリエーションを正規化', () => {
        expect(TagNormalizer.normalize('openai')).toEqual({ name: 'OpenAI', category: 'ai-ml' });
        expect(TagNormalizer.normalize('Open AI')).toEqual({ name: 'OpenAI', category: 'ai-ml' });
        expect(TagNormalizer.normalize('OpenAI API')).toEqual({ name: 'OpenAI', category: 'ai-ml' });
      });

      it('Geminiの各種バリエーションを正規化', () => {
        expect(TagNormalizer.normalize('gemini')).toEqual({ name: 'Gemini', category: 'ai-ml' });
        expect(TagNormalizer.normalize('Gemini API')).toEqual({ name: 'Gemini', category: 'ai-ml' });
        expect(TagNormalizer.normalize('Google Gemini')).toEqual({ name: 'Gemini', category: 'ai-ml' });
        expect(TagNormalizer.normalize('Gemini 1.5 Pro')).toEqual({ name: 'Gemini', category: 'ai-ml' });
      });

      it('LLMの各種バリエーションを正規化', () => {
        expect(TagNormalizer.normalize('LLM')).toEqual({ name: 'LLM', category: 'ai-ml' });
        expect(TagNormalizer.normalize('llms')).toEqual({ name: 'LLM', category: 'ai-ml' });
        expect(TagNormalizer.normalize('Large Language Model')).toEqual({ name: 'LLM', category: 'ai-ml' });
      });

      it('AIの各種バリエーションを正規化', () => {
        expect(TagNormalizer.normalize('生成AI')).toEqual({ name: 'AI', category: 'ai-ml' });
        expect(TagNormalizer.normalize('GenAI')).toEqual({ name: 'AI', category: 'ai-ml' });
        expect(TagNormalizer.normalize('Generative AI')).toEqual({ name: 'AI', category: 'ai-ml' });
        expect(TagNormalizer.normalize('画像生成AI')).toEqual({ name: 'AI', category: 'ai-ml' });
      });

      it('AIエージェントの各種バリエーションを正規化', () => {
        expect(TagNormalizer.normalize('AIエージェント')).toEqual({ name: 'AIエージェント', category: 'ai-ml' });
        expect(TagNormalizer.normalize('AI Agent')).toEqual({ name: 'AIエージェント', category: 'ai-ml' });
        expect(TagNormalizer.normalize('Agentic AI')).toEqual({ name: 'AIエージェント', category: 'ai-ml' });
      });
    });

    describe('プログラミング言語', () => {
      it('JavaScriptの各種バリエーションを正規化', () => {
        expect(TagNormalizer.normalize('javascript')).toEqual({ name: 'JavaScript', category: 'language' });
        expect(TagNormalizer.normalize('js')).toEqual({ name: 'JavaScript', category: 'language' });
        expect(TagNormalizer.normalize('JS')).toEqual({ name: 'JavaScript', category: 'language' });
      });

      it('TypeScriptの各種バリエーションを正規化', () => {
        expect(TagNormalizer.normalize('typescript')).toEqual({ name: 'TypeScript', category: 'language' });
        expect(TagNormalizer.normalize('ts')).toEqual({ name: 'TypeScript', category: 'language' });
        expect(TagNormalizer.normalize('TS')).toEqual({ name: 'TypeScript', category: 'language' });
      });

      it('Pythonの各種バリエーションを正規化', () => {
        expect(TagNormalizer.normalize('python')).toEqual({ name: 'Python', category: 'language' });
        expect(TagNormalizer.normalize('Python3')).toEqual({ name: 'Python', category: 'language' });
        expect(TagNormalizer.normalize('py')).toEqual({ name: 'Python', category: 'language' });
      });

      it('Goの各種バリエーションを正規化', () => {
        expect(TagNormalizer.normalize('go')).toEqual({ name: 'Go', category: 'language' });
        expect(TagNormalizer.normalize('golang')).toEqual({ name: 'Go', category: 'language' });
        expect(TagNormalizer.normalize('Golang')).toEqual({ name: 'Go', category: 'language' });
      });
    });

    describe('フレームワーク・ライブラリ', () => {
      it('Reactの各種バリエーションを正規化', () => {
        expect(TagNormalizer.normalize('react')).toEqual({ name: 'React', category: 'framework' });
        expect(TagNormalizer.normalize('React.js')).toEqual({ name: 'React', category: 'framework' });
        expect(TagNormalizer.normalize('ReactJS')).toEqual({ name: 'React', category: 'framework' });
      });

      it('Vueの各種バリエーションを正規化', () => {
        expect(TagNormalizer.normalize('vue')).toEqual({ name: 'Vue.js', category: 'framework' });
        expect(TagNormalizer.normalize('Vue.js')).toEqual({ name: 'Vue.js', category: 'framework' });
        expect(TagNormalizer.normalize('vuejs')).toEqual({ name: 'Vue.js', category: 'framework' });
        expect(TagNormalizer.normalize('Vue3')).toEqual({ name: 'Vue.js', category: 'framework' });
      });

      it('Next.jsの各種バリエーションを正規化', () => {
        expect(TagNormalizer.normalize('next.js')).toEqual({ name: 'Next.js', category: 'framework' });
        expect(TagNormalizer.normalize('nextjs')).toEqual({ name: 'Next.js', category: 'framework' });
        expect(TagNormalizer.normalize('Next.js 14')).toEqual({ name: 'Next.js', category: 'framework' });
      });

      it('Node.jsの各種バリエーションを正規化', () => {
        expect(TagNormalizer.normalize('node')).toEqual({ name: 'Node.js', category: 'framework' });
        expect(TagNormalizer.normalize('nodejs')).toEqual({ name: 'Node.js', category: 'framework' });
        expect(TagNormalizer.normalize('Node.js')).toEqual({ name: 'Node.js', category: 'framework' });
      });
    });

    describe('クラウド・インフラ', () => {
      it('AWSの各種バリエーションを正規化', () => {
        expect(TagNormalizer.normalize('aws')).toEqual({ name: 'AWS', category: 'cloud' });
        expect(TagNormalizer.normalize('AWS')).toEqual({ name: 'AWS', category: 'cloud' });
        expect(TagNormalizer.normalize('Amazon Web Services')).toEqual({ name: 'AWS', category: 'cloud' });
      });

      it('GCPの各種バリエーションを正規化', () => {
        expect(TagNormalizer.normalize('gcp')).toEqual({ name: 'GCP', category: 'cloud' });
        expect(TagNormalizer.normalize('Google Cloud')).toEqual({ name: 'GCP', category: 'cloud' });
        expect(TagNormalizer.normalize('Google Cloud Platform')).toEqual({ name: 'GCP', category: 'cloud' });
      });

      it('Azureの各種バリエーションを正規化', () => {
        expect(TagNormalizer.normalize('azure')).toEqual({ name: 'Azure', category: 'cloud' });
        expect(TagNormalizer.normalize('Microsoft Azure')).toEqual({ name: 'Azure', category: 'cloud' });
        expect(TagNormalizer.normalize('Azure OpenAI')).toEqual({ name: 'Azure', category: 'cloud' });
      });

      it('Dockerの各種バリエーションを正規化', () => {
        expect(TagNormalizer.normalize('docker')).toEqual({ name: 'Docker', category: 'cloud' });
        expect(TagNormalizer.normalize('Docker')).toEqual({ name: 'Docker', category: 'cloud' });
        expect(TagNormalizer.normalize('docker-compose')).toEqual({ name: 'Docker', category: 'cloud' });
      });

      it('Kubernetesの各種バリエーションを正規化', () => {
        expect(TagNormalizer.normalize('kubernetes')).toEqual({ name: 'Kubernetes', category: 'cloud' });
        expect(TagNormalizer.normalize('k8s')).toEqual({ name: 'Kubernetes', category: 'cloud' });
        expect(TagNormalizer.normalize('K8s')).toEqual({ name: 'Kubernetes', category: 'cloud' });
      });
    });

    describe('データベース', () => {
      it('PostgreSQLの各種バリエーションを正規化', () => {
        expect(TagNormalizer.normalize('postgres')).toEqual({ name: 'PostgreSQL', category: 'database' });
        expect(TagNormalizer.normalize('postgresql')).toEqual({ name: 'PostgreSQL', category: 'database' });
        expect(TagNormalizer.normalize('PostgreSQL')).toEqual({ name: 'PostgreSQL', category: 'database' });
      });

      it('MySQLの各種バリエーションを正規化', () => {
        expect(TagNormalizer.normalize('mysql')).toEqual({ name: 'MySQL', category: 'database' });
        expect(TagNormalizer.normalize('MySQL')).toEqual({ name: 'MySQL', category: 'database' });
        expect(TagNormalizer.normalize('mariadb')).toEqual({ name: 'MySQL', category: 'database' });
      });

      it('MongoDBの各種バリエーションを正規化', () => {
        expect(TagNormalizer.normalize('mongo')).toEqual({ name: 'MongoDB', category: 'database' });
        expect(TagNormalizer.normalize('mongodb')).toEqual({ name: 'MongoDB', category: 'database' });
        expect(TagNormalizer.normalize('MongoDB')).toEqual({ name: 'MongoDB', category: 'database' });
      });
    });

    describe('基本的な正規化', () => {
      it('ルールに一致しないタグは基本的な正規化のみ適用', () => {
        expect(TagNormalizer.normalize('customtag')).toEqual({ name: 'Customtag', category: undefined });
        expect(TagNormalizer.normalize('some_tag')).toEqual({ name: 'Some-tag', category: undefined });
        expect(TagNormalizer.normalize('  spaced  tag  ')).toEqual({ name: 'Spaced tag', category: undefined });
      });

      it('完全に大文字の略語はそのまま維持', () => {
        expect(TagNormalizer.normalize('API')).toEqual({ name: 'API', category: undefined });
        // RESTはREST APIとして正規化される（webカテゴリ）
        expect(TagNormalizer.normalize('REST')).toEqual({ name: 'REST API', category: 'web' });
        expect(TagNormalizer.normalize('URL')).toEqual({ name: 'URL', category: undefined });
      });
    });
  });

  describe('normalizeTags', () => {
    it('タグ配列を正規化し重複を削除', () => {
      const tags = ['react', 'React.js', 'ReactJS', 'typescript', 'ts'];
      const result = TagNormalizer.normalizeTags(tags);
      
      expect(result).toEqual([
        { name: 'React', category: 'framework' },
        { name: 'TypeScript', category: 'language' }
      ]);
    });

    it('重複するタグは最初のものを保持', () => {
      const tags = ['gpt-4', 'ChatGPT', 'GPT-5', 'openai', 'OpenAI API'];
      const result = TagNormalizer.normalizeTags(tags);
      
      expect(result).toEqual([
        { name: 'GPT', category: 'ai-ml' },
        { name: 'OpenAI', category: 'ai-ml' }
      ]);
    });

    it('異なるカテゴリのタグを混在して処理', () => {
      const tags = ['python', 'docker', 'postgresql', 'react', 'aws'];
      const result = TagNormalizer.normalizeTags(tags);
      
      expect(result).toEqual([
        { name: 'Python', category: 'language' },
        { name: 'Docker', category: 'cloud' },
        { name: 'PostgreSQL', category: 'database' },
        { name: 'React', category: 'framework' },
        { name: 'AWS', category: 'cloud' }
      ]);
    });
  });

  describe('inferCategory', () => {
    it('最初のタグのカテゴリを返す', () => {
      const tags = [
        { name: 'React', category: 'framework' },
        { name: 'TypeScript', category: 'language' }
      ];
      expect(TagNormalizer.inferCategory(tags)).toBe('framework');
    });

    it('カテゴリがない場合はundefinedを返す', () => {
      const tags = [
        { name: 'CustomTag', category: undefined },
        { name: 'AnotherTag', category: undefined }
      ];
      expect(TagNormalizer.inferCategory(tags)).toBeUndefined();
    });

    it('最初のタグにカテゴリがない場合は次のタグのカテゴリを返す', () => {
      const tags = [
        { name: 'CustomTag', category: undefined },
        { name: 'Python', category: 'language' }
      ];
      expect(TagNormalizer.inferCategory(tags)).toBe('language');
    });

    it('空の配列の場合はundefinedを返す', () => {
      expect(TagNormalizer.inferCategory([])).toBeUndefined();
    });
  });
});