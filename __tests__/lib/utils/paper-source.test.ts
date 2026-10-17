/**
 * 論文のソース（arXiv AI・Hugging Face Papers）の判定
 */
import {
  ARXIV_SOURCE_ID,
  HUGGINGFACE_PAPERS_SOURCE_ID,
} from '@/lib/constants/source-categories';
import {
  PAPER_SOURCE_IDS_PARAM,
  isPaperSourceId,
  withoutPaperSourceGroups,
  withoutPaperSourceIds,
  withoutPaperSources,
} from '@/lib/utils/source/paper-source';

describe('paper-source', () => {
  it('arXiv AI と Hugging Face Papers を論文のソースとする', () => {
    expect(isPaperSourceId(ARXIV_SOURCE_ID)).toBe(true);
    expect(isPaperSourceId(HUGGINGFACE_PAPERS_SOURCE_ID)).toBe(true);
    expect(isPaperSourceId('zenn')).toBe(false);
    expect(PAPER_SOURCE_IDS_PARAM).toBe(
      `${ARXIV_SOURCE_ID},${HUGGINGFACE_PAPERS_SOURCE_ID}`
    );
  });

  it('ソースの一覧から論文のソースを除く', () => {
    const sources = [
      { id: 'zenn', name: 'Zenn' },
      { id: HUGGINGFACE_PAPERS_SOURCE_ID, name: 'Hugging Face Papers' },
      { id: ARXIV_SOURCE_ID, name: 'arXiv AI' },
    ];

    expect(withoutPaperSources(sources)).toEqual([{ id: 'zenn', name: 'Zenn' }]);
  });

  it('グループから論文のソースを除き、空になったグループも除く', () => {
    const groups = [
      {
        id: 'ai',
        sources: [
          { id: 'openai', name: 'OpenAI Blog' },
          { id: HUGGINGFACE_PAPERS_SOURCE_ID, name: 'Hugging Face Papers' },
        ],
      },
      { id: 'papers', sources: [{ id: ARXIV_SOURCE_ID, name: 'arXiv AI' }] },
    ];

    expect(withoutPaperSourceGroups(groups)).toEqual([
      { id: 'ai', sources: [{ id: 'openai', name: 'OpenAI Blog' }] },
    ]);
  });

  it.each([
    [`${HUGGINGFACE_PAPERS_SOURCE_ID}`, undefined],
    [`${ARXIV_SOURCE_ID},${HUGGINGFACE_PAPERS_SOURCE_ID}`, undefined],
    [`zenn,${ARXIV_SOURCE_ID}, qiita`, 'zenn,qiita'],
    ['all', 'all'],
    ['none', 'none'],
    [',', undefined],
  ])('URL の sources=%s は %s にする', (input, expected) => {
    expect(withoutPaperSourceIds(input)).toBe(expected);
  });
});
