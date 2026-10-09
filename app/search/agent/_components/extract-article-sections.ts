/**
 * AI 回答の Markdown から、番号付きの記事の節と、まとめの文を取り出す。
 * answer-content.tsx から切り出した（400行を超えていたため。Issue #700 の PR で分割）
 */

// Article section extracted from AI response
export interface ArticleSection {
  articleId: string | null;
  title: string;
  summary: string;
  index: number;
}

// Result of extracting article sections and summary from AI response
export interface ExtractedAnswer {
  sections: ArticleSection[];
  summary: string;
}

// Extract article sections and summary from markdown response
export function extractArticleSections(text: string): ExtractedAnswer {
  const sections: ArticleSection[] = [];

  // Match numbered list items: 1. **Title** (match: X%) - Description
  // Pattern captures: 1=title, 2=articleId token, 3=description
  // Format: "1. **Title** [#id] (match: 80%) - Description"
  //   - [#id] and (match%) are optional
  //   - Lookahead stops at next numbered item or double newline
  const listItemPattern =
    /^\d+\.\s+\*\*(.+?)\*\*\s*(?:\[#([a-zA-Z0-9_-]+)\])?\s*(?:\(.*?(?:\d+(?:\.\d+)?%?).*?\))?\s*[-\u2013\u2014]?\s*([\s\S]*?)(?=\n\d+\.\s+\*\*|\n\n(?!\s)|$)/gm;

  let match;
  let index = 0;
  let lastEnd = 0;

  while ((match = listItemPattern.exec(text)) !== null) {
    const title = match[1].trim();
    const articleId = match[2] || null;
    let summary = match[3] ? match[3].trim() : '';

    // Clean up summary: remove article ID tokens and extra whitespace
    summary = summary.replace(/\[#[a-zA-Z0-9_-]+\]/g, '').trim();
    // Remove trailing link mentions
    summary = summary.replace(/\s*\n\s*\[.*?\]\(.*?\)\s*$/g, '').trim();
    // Truncate to reasonable length
    if (summary.length > 200) {
      summary = summary.slice(0, 200) + '...';
    }

    sections.push({
      articleId,
      title,
      summary,
      index: index++,
    });

    lastEnd = listItemPattern.lastIndex;
  }

  // Extract summary/conclusion after the article list
  let extractedSummary = '';
  if (lastEnd > 0 && lastEnd < text.length) {
    let tail = text.slice(lastEnd).trim();

    // Remove markdown links and reference-style links
    tail = tail.replace(/^\s*-\s*\[.*?\]\(.*?\)\s*$/gm, '').trim();
    tail = tail.replace(/\[.*?\]\(.*?\)/g, '').trim();

    // Remove article ID tokens
    tail = tail.replace(/\[#[a-zA-Z0-9_-]+\]/g, '').trim();

    // Remove "---" separators
    tail = tail.replace(/^---+\s*/gm, '').trim();

    // Only use if it looks like actual content (not just whitespace or very short)
    if (tail.length > 20) {
      extractedSummary = tail;
    }
  }

  return { sections, summary: extractedSummary };
}
