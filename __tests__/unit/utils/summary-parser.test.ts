import { parseSummary, highlightKeywords, SummarySection } from '@/lib/utils/summary-parser';

describe('summary-parser', () => {
  describe('parseSummary', () => {
    it('空の要約の場合は空の配列を返す', () => {
      expect(parseSummary('')).toEqual([]);
      expect(parseSummary(null as any)).toEqual([]);
      expect(parseSummary(undefined as any)).toEqual([]);
    });

    it('単一セクションの要約を正しく解析する', () => {
      const summary = '記事の主題：Next.jsとReactの最新機能について解説しています。';
      const result = parseSummary(summary);

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        title: '技術的背景',
        content: '記事の主題：Next.jsとReactの最新機能について解説しています。',
        icon: '📋'
      });
    });

    it('複数セクションの要約を正しく解析する', () => {
      const summary = `記事の主題：Next.jsのApp Routerについて
解決しようとしている問題：従来のPages Routerの制限
提示されている解決策：App Routerの新機能を活用`;

      const result = parseSummary(summary);

      expect(result).toHaveLength(3);
      expect(result[0].title).toBe('技術的背景');
      expect(result[1].title).toBe('解決する問題');
      expect(result[2].title).toBe('解決策');
    });

    it('箇条書き形式の要約を正しく解析する', () => {
      const summary = `・記事の主題：TypeScriptの型安全性向上
・解決しようとしている問題：実行時エラーの削減
・提示されている解決策：厳密な型定義の実装`;

      const result = parseSummary(summary);

      expect(result).toHaveLength(3);
      // 箇条書きの「・」が削除されていることを確認
      expect(result[0].content).toBe('記事の主題：TypeScriptの型安全性向上');
      expect(result[1].content).toBe('解決しようとしている問題：実行時エラーの削減');
      expect(result[2].content).toBe('提示されている解決策：厳密な型定義の実装');
    });

    it('複数行にわたるセクションを正しく結合する', () => {
      const summary = `記事の主題：マイクロサービスアーキテクチャの実装
サービス間の通信について詳しく説明
APIゲートウェイの役割も解説
解決しようとしている問題：モノリシックアプリケーションのスケーラビリティ`;

      const result = parseSummary(summary);

      expect(result).toHaveLength(2);
      expect(result[0].content).toBe(
        '記事の主題：マイクロサービスアーキテクチャの実装 サービス間の通信について詳しく説明 APIゲートウェイの役割も解説'
      );
      expect(result[1].content).toBe('解決しようとしている問題：モノリシックアプリケーションのスケーラビリティ');
    });

    it('すべてのセクションタイプを正しく認識する', () => {
      const summary = `記事の主題：テスト駆動開発
解決しようとしている問題：バグの早期発見
提示されている解決策：TDDサイクルの導入
実装方法：Red-Green-Refactorのサイクル
期待される効果：品質向上とリファクタリングの容易さ
実装時の注意点：テストの保守性を考慮`;

      const result = parseSummary(summary);

      expect(result).toHaveLength(6);
      
      const expectedSections: Partial<SummarySection>[] = [
        { title: '技術的背景', icon: '📋' },
        { title: '解決する問題', icon: '❓' },
        { title: '解決策', icon: '💡' },
        { title: '実装方法', icon: '🔧' },
        { title: '期待される効果', icon: '📈' },
        { title: '注意点', icon: '⚠️' }
      ];

      expectedSections.forEach((expected, index) => {
        expect(result[index].title).toBe(expected.title);
        expect(result[index].icon).toBe(expected.icon);
      });
    });

    it('空行を含む要約を正しく処理する', () => {
      const summary = `記事の主題：React Hooks

      解決しようとしている問題：クラスコンポーネントの複雑性


      提示されている解決策：関数コンポーネントでの状態管理`;

      const result = parseSummary(summary);

      expect(result).toHaveLength(3);
      expect(result[0].content).toBe('記事の主題：React Hooks');
      expect(result[1].content).toBe('解決しようとしている問題：クラスコンポーネントの複雑性');
      expect(result[2].content).toBe('提示されている解決策：関数コンポーネントでの状態管理');
    });

    it('セクションキーワードが文中に含まれる場合も正しく処理する', () => {
      const summary = `記事の主題について説明：GraphQLとRESTの比較
この記事では解決しようとしている問題を詳しく解説
提示されている解決策として複数のアプローチを紹介`;

      const result = parseSummary(summary);

      expect(result).toHaveLength(3);
      expect(result[0].title).toBe('技術的背景');
      expect(result[1].title).toBe('解決する問題');
      expect(result[2].title).toBe('解決策');
    });

    it('順序が異なるセクションも正しく処理する', () => {
      const summary = `提示されている解決策：コンテナ化による環境統一
記事の主題：Docker入門
解決しようとしている問題：環境差異によるトラブル`;

      const result = parseSummary(summary);

      expect(result).toHaveLength(3);
      // 出現順に処理されることを確認
      expect(result[0].title).toBe('解決策');
      expect(result[1].title).toBe('技術的背景');
      expect(result[2].title).toBe('解決する問題');
    });

    it('セクションに該当しない行は無視される', () => {
      const summary = `この記事は技術ブログです
記事の主題：CI/CDパイプラインの構築
GitHubActionsを使った自動化
解決しようとしている問題：手動デプロイのミス`;

      const result = parseSummary(summary);

      expect(result).toHaveLength(2);
      expect(result[0].title).toBe('技術的背景');
      expect(result[1].title).toBe('解決する問題');
      // 「この記事は技術ブログです」は無視される
    });
  });

  describe('highlightKeywords', () => {
    it('テキストをそのまま返す（現在の実装）', () => {
      const text = '問題はパフォーマンスで、解決策は最適化です。';
      const result = highlightKeywords(text);
      
      // 現在の実装ではテキストをそのまま返す
      expect(result).toBe(text);
    });

    it('空のテキストを処理できる', () => {
      expect(highlightKeywords('')).toBe('');
    });

    it('特殊文字を含むテキストを処理できる', () => {
      const text = '問題は<script>alert("XSS")</script>で解決策は&エスケープです。';
      const result = highlightKeywords(text);
      
      expect(result).toBe(text);
    });
  });
});