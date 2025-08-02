import {
  normalizeTag,
  isValidTag,
  normalizeTags,
  TAG_NORMALIZATION_MAP
} from '@/lib/utils/tag-normalizer';

describe('tag-normalizer', () => {
  describe('normalizeTag', () => {
    it('小文字のタグを正規化する', () => {
      expect(normalizeTag('javascript')).toBe('JavaScript');
      expect(normalizeTag('typescript')).toBe('TypeScript');
      expect(normalizeTag('nodejs')).toBe('Node.js');
      expect(normalizeTag('react')).toBe('React');
    });

    it('エイリアスを正しく変換する', () => {
      expect(normalizeTag('js')).toBe('JavaScript');
      expect(normalizeTag('ts')).toBe('TypeScript');
      expect(normalizeTag('node')).toBe('Node.js');
      expect(normalizeTag('k8s')).toBe('Kubernetes');
      expect(normalizeTag('postgres')).toBe('PostgreSQL');
    });

    it('大文字小文字が混在するタグを正規化する', () => {
      expect(normalizeTag('JavaScript')).toBe('JavaScript');
      expect(normalizeTag('JAVASCRIPT')).toBe('JavaScript');
      expect(normalizeTag('jAvAsCrIpT')).toBe('JavaScript');
    });

    it('前後の空白を削除する', () => {
      expect(normalizeTag('  react  ')).toBe('React');
      expect(normalizeTag('\tpython\n')).toBe('Python');
      expect(normalizeTag(' aws ')).toBe('AWS');
    });

    it('特殊文字を含むタグを正規化する', () => {
      expect(normalizeTag('c#')).toBe('C#');
      expect(normalizeTag('c++')).toBe('C++');
    });

    it('日本語タグを正規化する', () => {
      expect(normalizeTag('ml')).toBe('機械学習');
      expect(normalizeTag('machinelearning')).toBe('機械学習');
      expect(normalizeTag('deeplearning')).toBe('ディープラーニング');
      expect(normalizeTag('microservices')).toBe('マイクロサービス');
    });

    it('マップにないタグは先頭文字を大文字化する', () => {
      expect(normalizeTag('flutter')).toBe('Flutter');
      expect(normalizeTag('kotlin')).toBe('Kotlin');
      expect(normalizeTag('swift')).toBe('Swift');
    });

    it('すでに正規化されているタグはそのまま返す', () => {
      expect(normalizeTag('React Native')).toBe('React Native');
      expect(normalizeTag('Machine Learning')).toBe('Machine Learning');
    });

    it('全カテゴリのタグを正規化する', () => {
      // JavaScript関連
      expect(normalizeTag('nextjs')).toBe('Next.js');
      expect(normalizeTag('vue')).toBe('Vue.js');
      
      // バックエンド
      expect(normalizeTag('express')).toBe('Express');
      expect(normalizeTag('spring')).toBe('Spring Boot');
      
      // 言語
      expect(normalizeTag('golang')).toBe('Go');
      expect(normalizeTag('csharp')).toBe('C#');
      
      // クラウド
      expect(normalizeTag('gcp')).toBe('GCP');
      expect(normalizeTag('vercel')).toBe('Vercel');
      
      // データベース
      expect(normalizeTag('mysql')).toBe('MySQL');
      expect(normalizeTag('mongodb')).toBe('MongoDB');
      
      // ツール
      expect(normalizeTag('github')).toBe('GitHub');
      expect(normalizeTag('vscode')).toBe('VS Code');
      
      // その他
      expect(normalizeTag('graphql')).toBe('GraphQL');
      expect(normalizeTag('cicd')).toBe('CI/CD');
    });
  });

  describe('isValidTag', () => {
    it('有効なタグを判定する', () => {
      expect(isValidTag('React')).toBe(true);
      expect(isValidTag('JavaScript')).toBe(true);
      expect(isValidTag('AI')).toBe(true);
      expect(isValidTag('Next.js')).toBe(true);
    });

    it('空文字列や空白のみのタグは無効', () => {
      expect(isValidTag('')).toBe(false);
      expect(isValidTag('   ')).toBe(false);
      expect(isValidTag('\t\n')).toBe(false);
    });

    it('null、undefined、非文字列は無効', () => {
      expect(isValidTag(null as any)).toBe(false);
      expect(isValidTag(undefined as any)).toBe(false);
      expect(isValidTag(123 as any)).toBe(false);
      expect(isValidTag({} as any)).toBe(false);
    });

    it('30文字を超えるタグは無効', () => {
      expect(isValidTag('a'.repeat(30))).toBe(true);
      expect(isValidTag('a'.repeat(31))).toBe(false);
      expect(isValidTag('非常に長いタグ名前を持つタグのテストケースでこれは31文字以上になります')).toBe(false);
    });

    it('一般的すぎるタグは無効', () => {
      expect(isValidTag('プログラミング')).toBe(false);
      expect(isValidTag('programming')).toBe(false);
      expect(isValidTag('開発')).toBe(false);
      expect(isValidTag('development')).toBe(false);
      expect(isValidTag('技術')).toBe(false);
      expect(isValidTag('technology')).toBe(false);
      expect(isValidTag('ソフトウェア')).toBe(false);
      expect(isValidTag('software')).toBe(false);
    });

    it('大文字小文字に関わらず一般的なタグは無効', () => {
      expect(isValidTag('PROGRAMMING')).toBe(false);
      expect(isValidTag('Technology')).toBe(false);
      expect(isValidTag('SOFTWARE')).toBe(false);
    });

    it('1文字のタグは有効', () => {
      expect(isValidTag('C')).toBe(true);
      expect(isValidTag('R')).toBe(true);
    });
  });

  describe('normalizeTags', () => {
    it('タグの配列を正規化する', () => {
      const tags = ['javascript', 'react', 'nodejs'];
      const result = normalizeTags(tags);
      
      expect(result).toEqual(['JavaScript', 'React', 'Node.js']);
    });

    it('重複を除去する', () => {
      const tags = ['js', 'javascript', 'JS', 'JavaScript'];
      const result = normalizeTags(tags);
      
      expect(result).toEqual(['JavaScript']);
    });

    it('無効なタグを除外する', () => {
      const tags = [
        'React',
        '',
        'プログラミング',
        'TypeScript',
        '非常に長いタグ名前を持つタグのテストケースでこれは31文字以上になります',
        '開発'
      ];
      const result = normalizeTags(tags);
      
      expect(result).toEqual(['React', 'TypeScript']);
    });

    it('複雑な配列を正規化する', () => {
      const tags = [
        'js',
        'typescript',
        'node',
        'nodejs',
        'react',
        'React',
        '',
        'プログラミング',
        'aws',
        'AWS',
        '   python   ',
        null as any,
        undefined as any,
        'kubernetes',
        'k8s'
      ];
      const result = normalizeTags(tags);
      
      expect(result).toEqual([
        'JavaScript',
        'TypeScript',
        'Node.js',
        'React',
        'AWS',
        'Python',
        'Kubernetes'
      ]);
    });

    it('空の配列を処理できる', () => {
      expect(normalizeTags([])).toEqual([]);
    });

    it('すべて無効なタグの配列を処理できる', () => {
      const tags = ['', '   ', 'プログラミング', '開発', 'a'.repeat(31)];
      const result = normalizeTags(tags);
      
      expect(result).toEqual([]);
    });

    it('正規化後も順序を保持する（重複除去を除く）', () => {
      const tags = ['vue', 'angular', 'react', 'svelte'];
      const result = normalizeTags(tags);
      
      expect(result).toEqual(['Vue.js', 'Angular', 'React', 'Svelte']);
    });
  });

  describe('TAG_NORMALIZATION_MAP', () => {
    it('すべてのマップエントリが文字列である', () => {
      Object.entries(TAG_NORMALIZATION_MAP).forEach(([key, value]) => {
        expect(typeof key).toBe('string');
        expect(typeof value).toBe('string');
        expect(key).toBe(key.toLowerCase()); // キーは小文字であるべき
        expect(value.length).toBeGreaterThan(0); // 値は空でない
      });
    });

    it('エイリアスが正しく設定されている', () => {
      // 同じ技術の異なる表記が同じ値にマップされることを確認
      expect(TAG_NORMALIZATION_MAP['js']).toBe(TAG_NORMALIZATION_MAP['javascript']);
      expect(TAG_NORMALIZATION_MAP['ts']).toBe(TAG_NORMALIZATION_MAP['typescript']);
      expect(TAG_NORMALIZATION_MAP['node']).toBe(TAG_NORMALIZATION_MAP['nodejs']);
      expect(TAG_NORMALIZATION_MAP['k8s']).toBe(TAG_NORMALIZATION_MAP['kubernetes']);
      expect(TAG_NORMALIZATION_MAP['postgres']).toBe(TAG_NORMALIZATION_MAP['postgresql']);
    });
  });
});