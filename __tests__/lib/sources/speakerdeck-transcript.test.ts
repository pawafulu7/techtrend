import * as cheerio from 'cheerio';
import {
  extractSpeakerDeckTranscript,
  speakerDeckTitle,
} from '@/lib/sources/speakerdeck-transcript';

/** Speaker Deck の発表ページの形（Transcript 欄はスライドごとに見出しのリンクと本文が並ぶ） */
const deckPage = ({
  slides,
  descriptionHtml = '<div class="deck-description text-break mb-4"><p>勉強会で\n  発表した資料です。</p></div>',
  head = '<title>Deck Title - Speaker Deck</title><meta property="og:title" content="Deck Title">',
}: {
  slides: Array<{ heading: string; body?: string }>;
  descriptionHtml?: string;
  head?: string;
}) => `
  <!DOCTYPE html>
  <html>
  <head>${head}</head>
  <body>
    ${descriptionHtml}
    <details class="container mb-4 transcript text-break">
      <summary><h2 class="m-0">Transcript</h2></summary>
      <div id="transcript"><ol>
        ${slides
          .map(
            ({ heading, body = '' }, i) => `
        <li class="mb-2"><div class="slide-transcript">
          <h3 class="fs-6 fw-normal">
            <a title="Deck Title ${heading.slice(0, 10)}..." href="https://files.speakerdeck.com/presentations/abc/slide_${i}.jpg">${heading}</a>
          </h3>
          ${body}
        </div></li>`
          )
          .join('')}
      </ol></div>
    </details>
  </body>
  </html>
`;

describe('extractSpeakerDeckTranscript', () => {
  it('タイトル・説明文・スライドごとの文字を空行で区切る（リンクの title 属性は入れない）', () => {
    const $ = cheerio.load(
      deckPage({
        slides: [
          { heading: 'Deck Title 2026/11/24', body: '発表者 所属' },
          { heading: 'アジェンダ', body: '背景と課題\n   計測の方法' },
          { heading: 'まとめ' },
        ],
      })
    );

    expect(extractSpeakerDeckTranscript($)).toBe(
      [
        'Deck Title',
        '勉強会で 発表した資料です。',
        'Deck Title 2026/11/24 発表者 所属',
        'アジェンダ 背景と課題 計測の方法',
        'まとめ',
      ].join('\n\n')
    );
  });

  it('文字の無いスライドは飛ばす', () => {
    const $ = cheerio.load(
      deckPage({
        slides: [
          { heading: '' },
          { heading: '本題', body: '' },
          { heading: '  ' },
        ],
      })
    );

    expect(extractSpeakerDeckTranscript($)).toBe(
      ['Deck Title', '勉強会で 発表した資料です。', '本題'].join('\n\n')
    );
  });

  it('説明文が無ければ og:description を使い、それも無ければ入れない', () => {
    const withOg = cheerio.load(
      deckPage({
        slides: [{ heading: '本題' }],
        descriptionHtml: '',
        head: '<meta property="og:title" content="Deck Title"><meta property="og:description" content="OG の説明">',
      })
    );
    expect(extractSpeakerDeckTranscript(withOg)).toBe(
      ['Deck Title', 'OG の説明', '本題'].join('\n\n')
    );

    const without = cheerio.load(
      deckPage({ slides: [{ heading: '本題' }], descriptionHtml: '' })
    );
    expect(extractSpeakerDeckTranscript(without)).toBe(
      ['Deck Title', '本題'].join('\n\n')
    );
  });

  it('説明文の欄が空白や改行だけなら、og:description を使う', () => {
    const $ = cheerio.load(
      deckPage({
        slides: [{ heading: '本題' }],
        descriptionHtml: '<div class="deck-description text-break mb-4">\n   <p>  </p>\n</div>',
        head: '<meta property="og:title" content="Deck Title"><meta property="og:description" content="OG の説明">',
      })
    );
    expect(extractSpeakerDeckTranscript($)).toBe(['Deck Title', 'OG の説明', '本題'].join('\n\n'));
  });

  it('文字のあるスライドが1枚も無ければ null（画像だけの資料）', () => {
    expect(
      extractSpeakerDeckTranscript(cheerio.load(deckPage({ slides: [] })))
    ).toBeNull();
    expect(
      extractSpeakerDeckTranscript(
        cheerio.load(deckPage({ slides: [{ heading: '' }] }))
      )
    ).toBeNull();
  });
});

describe('speakerDeckTitle', () => {
  it('og:title が無ければ title から末尾の " - Speaker Deck" を除いて使う', () => {
    expect(
      speakerDeckTitle(
        cheerio.load(
          '<html><head><title>Only Title - Speaker Deck</title></head></html>'
        )
      )
    ).toBe('Only Title');
  });
});
