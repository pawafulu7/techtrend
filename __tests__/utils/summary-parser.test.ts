import { parseSummary } from '@/lib/utils/summary-parser';

describe('parseSummary with summaryVersion 8', () => {
  it('コロン後が空のメイン項目を正しく処理する', () => {
    const summary = `・項目1：内容1
・項目2：
- サブ項目1：サブ内容1
- サブ項目2：サブ内容2
・項目3：内容3`;
    
    const sections = parseSummary(summary, { summaryVersion: 8 });
    
    expect(sections).toHaveLength(3);
    expect(sections[0].title).toBe('項目1');
    expect(sections[0].content).toBe('内容1');
    expect(sections[1].title).toBe('項目2');
    expect(sections[1].content).toContain('サブ項目1');
    expect(sections[1].content).toContain('サブ内容1');
    expect(sections[1].content).toContain('サブ項目2');
    expect(sections[1].content).toContain('サブ内容2');
    expect(sections[2].title).toBe('項目3');
    expect(sections[2].content).toBe('内容3');
  });
  
  it('問題のある実際のデータを正しく処理する', () => {
    const summary = `・コメントの基本方針：「What」より「Why」：優れたコメントは内容です
・コードの価値を高める「良いコメント」の具体例：
- 意図や背景を説明するコメント：内容1
- 複雑なロジックを要約するコメント：内容2`;
    
    const sections = parseSummary(summary, { summaryVersion: 8 });
    
    // 「詳細」というデフォルトタイトルが出現しないこと
    const detailSections = sections.filter(s => s.title === '詳細');
    expect(detailSections).toHaveLength(0);
    
    // 項目が正しく処理されること
    expect(sections[0].title).toBe('コメントの基本方針');
    expect(sections[1].title).toBe('コードの価値を高める「良いコメント」の具体例');
    expect(sections[1].content).toContain('意図や背景を説明するコメント');
    expect(sections[1].content).toContain('複雑なロジックを要約するコメント');
  });

  it('サブ項目がないコロン後が空のメイン項目も処理する', () => {
    const summary = `・項目1：内容1
・項目2：
・項目3：内容3`;
    
    const sections = parseSummary(summary, { summaryVersion: 8 });
    
    expect(sections).toHaveLength(3);
    expect(sections[0].title).toBe('項目1');
    expect(sections[0].content).toBe('内容1');
    expect(sections[1].title).toBe('項目2');
    expect(sections[1].content).toBe('');
    expect(sections[2].title).toBe('項目3');
    expect(sections[2].content).toBe('内容3');
  });

  it('独立したサブ項目を正しく処理する', () => {
    const summary = `・項目1：内容1
- サブ項目1：サブ内容1
- サブ項目2：サブ内容2`;
    
    const sections = parseSummary(summary, { summaryVersion: 8 });
    
    expect(sections).toHaveLength(3);
    expect(sections[0].title).toBe('項目1');
    expect(sections[0].content).toBe('内容1');
    expect(sections[1].title).toBe('サブ項目1');
    expect(sections[1].content).toBe('サブ内容1');
    expect(sections[2].title).toBe('サブ項目2');
    expect(sections[2].content).toBe('サブ内容2');
  });

  it('コロンがない項目も処理する', () => {
    const summary = `・項目1：内容1
・これはコロンがない項目です
・項目3：内容3`;
    
    const sections = parseSummary(summary, { summaryVersion: 8 });
    
    expect(sections).toHaveLength(3);
    expect(sections[0].title).toBe('項目1');
    expect(sections[0].content).toBe('内容1');
    expect(sections[1].title).toBe('詳細');
    expect(sections[1].content).toBe('これはコロンがない項目です');
    expect(sections[2].title).toBe('項目3');
    expect(sections[2].content).toBe('内容3');
  });

  it('複雑な階層構造を持つ実際のデータを処理する', () => {
    const actualSummary = `・コメントの基本方針：「What」より「Why」：優れたコメントは、コードから読み取れる「何をしているか(What)」ではなく、「なぜそうしているか(Why)」を説明する必要がある。ビジネス上の背景や技術的な意図を記述することで、コードの理解度を高め、保守性を向上させる。例として、新規ユーザーの強制リダイレクト処理における背景説明が挙げられている。
・コードの価値を高める「良いコメント」の具体例：
- 意図や背景を説明するコメント：コードだけでは理解できないビジネス上の理由や技術的な判断を記述する。例として、GitHub経由の新規ユーザーの電話番号未入力状態への対応が挙げられている。これにより、他の開発者や将来の自分が仕様を理解しやすくなる。
- 複雑なロジックを要約するコメント：正規表現や難解なアルゴリズムなど、理解しにくいコードの前に、平易な言葉で要約する。例として、全角カタカナ、半角カタカナ、長音符のみを許可する正規表現の解説が挙げられている。
- \`TODO\` や \`FIXME\` といったコメント：将来的な対応が必要な事項や既知の問題点を明確に示す。\`TODO\`は今後の機能追加やリファクタリング、\`FIXME\`は修正が必要な箇所を示す。例として、N+1問題の最適化や外部APIのタイムアウト処理への対応が挙げられている。
・コードの価値を下げる「悪いコメント」の具体例：
- コードの「日本語訳」にすぎないコメント：コードを読めばわかることをそのままコメントに書くことは、コードの重複でありノイズとなる。例として、「iを1増やす」というコメントが挙げられている。
- メンテナンスされていない古いコメント：コードを修正した際にコメントを更新しないと、コードとコメントに食い違いが生じ、混乱を招く。間違ったコメントは、コメントがないよりも有害である。
- コメントアウトされたコードの残骸：Gitなどのバージョン管理システムを使用している場合は、不要になったコードはコメントアウトせず、削除するべきである。過去のコードはGitの履歴で管理できる。`;

    const sections = parseSummary(actualSummary, { summaryVersion: 8 });
    
    // セクション数の確認
    expect(sections.length).toBeGreaterThan(0);
    
    // 「詳細」というデフォルトタイトルが出現しないこと
    const detailSections = sections.filter(s => s.title === '詳細');
    expect(detailSections).toHaveLength(0);
    
    // 主要な項目が存在すること
    const titles = sections.map(s => s.title);
    expect(titles).toContain('コメントの基本方針');
    expect(titles).toContain('コードの価値を高める「良いコメント」の具体例');
    expect(titles).toContain('コードの価値を下げる「悪いコメント」の具体例');
    
    // サブ項目が適切にグループ化されていること
    const goodCommentSection = sections.find(s => s.title === 'コードの価値を高める「良いコメント」の具体例');
    expect(goodCommentSection).toBeDefined();
    if (goodCommentSection) {
      expect(goodCommentSection.content).toContain('意図や背景を説明するコメント');
      expect(goodCommentSection.content).toContain('複雑なロジックを要約するコメント');
      expect(goodCommentSection.content).toContain('TODO');
      expect(goodCommentSection.content).toContain('FIXME');
    }
    
    const badCommentSection = sections.find(s => s.title === 'コードの価値を下げる「悪いコメント」の具体例');
    expect(badCommentSection).toBeDefined();
    if (badCommentSection) {
      expect(badCommentSection.content).toContain('コードの「日本語訳」にすぎないコメント');
      expect(badCommentSection.content).toContain('メンテナンスされていない古いコメント');
      expect(badCommentSection.content).toContain('コメントアウトされたコードの残骸');
    }
  });
});

describe('parseSummary with summaryVersion 7', () => {
  it('Version 7でも同様に処理される', () => {
    const summary = `・項目1：内容1
・項目2：
- サブ項目1：サブ内容1
・項目3：内容3`;
    
    const sections = parseSummary(summary, { summaryVersion: 7 });
    
    expect(sections).toHaveLength(3);
    expect(sections[0].title).toBe('項目1');
    expect(sections[1].title).toBe('項目2');
    expect(sections[2].title).toBe('項目3');
    
    // 「詳細」というデフォルトタイトルが出現しないこと
    const detailSections = sections.filter(s => s.title === '詳細');
    expect(detailSections).toHaveLength(0);
  });
});