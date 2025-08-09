import fetch from 'node-fetch';
// import { detectArticleType } from '../utils/article-type-detector';  // 統一プロンプト移行により無効化
// import { generatePromptForArticleType } from '../utils/article-type-prompts';  // 統一プロンプト移行により無効化
import { generateUnifiedPrompt } from '../utils/article-type-prompts';

interface SummaryAndTags {
  summary: string;
  detailedSummary: string;
  tags: string[];
  articleType: string;
}

export async function generateSummaryAndTags(
  title: string,
  content: string
): Promise<SummaryAndTags> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not set');
  }

  const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;
  
  // 統一プロンプトを使用（記事タイプ判定を廃止）
  const prompt = generateUnifiedPrompt(title, content);
  const articleType = 'unified';  // 統一タイプを設定

  const response = await fetch(apiUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{
        parts: [{ text: prompt }]
      }],
      generationConfig: {
        temperature: 0.3,
        maxOutputTokens: 2000,  // ユーザー提案に基づき余裕を持った設定（最大使用量1,925トークンを100%カバー）
      }
    })
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`API request failed: ${response.status} - ${error}`);
  }

  const data = await response.json() as any;
  const responseText = data.candidates[0].content.parts[0].text.trim();
  
  const result = parseSummaryAndTags(responseText);
  return { ...result, articleType };
}

// テキストクリーンアップ関数
function cleanupText(text: string): string {
  return text
    .replace(/\*\*/g, '') // マークダウン除去
    .replace(/^(本記事は、|本記事は|本稿では、|本稿では|記事では、|記事では|この記事は、|この記事は)/g, '')
    .trim();
}

// 最終クリーンアップ関数
function finalCleanup(text: string): string {
  if (!text) return text;
  
  // 冒頭の重複ラベル除去
  const cleanupPatterns = [
    /^(\*\*)?要約[:：]\s*(\*\*)?/,
    /^【要約】[:：]?\s*/,
    /^(\*\*)?短い要約[:：]\s*(\*\*)?/,
    /^【短い要約】[:：]?\s*/,
    /^(\*\*)?詳細要約[:：]\s*(\*\*)?/,
    /^【詳細要約】[:：]?\s*/,
    /^【?\d+-\d+文字.*?】?\s*/,  // プロンプト指示の除去
    /^【?簡潔にまとめ.*?】?\s*/
  ];
  
  cleanupPatterns.forEach(pattern => {
    text = text.replace(pattern, '');
  });
  
  // 先頭の句読点を除去
  text = text.replace(/^[、。]\s*/, '');
  
  // 改行の正規化
  text = text.replace(/\n+/g, '\n').trim();
  
  // 文末に句点がない場合は追加（箇条書きの場合は除く）
  if (text && !text.includes('・') && !text.match(/[。！？]$/)) {
    text += '。';
  }
  
  return text;
}

function parseSummaryAndTags(text: string): SummaryAndTags {
  const lines = text.split('\n');
  let summary = '';
  let detailedSummary = '';
  let tags: string[] = [];
  let isDetailedSummary = false;
  let tagSectionStarted = false; // タグセクション開始フラグを追加
  
  // 各行を解析（新形式: タグが次の行に来る場合に対応）
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    
    // タグセクションの検出（改良版）
    if (/^(タグ|Tags)[:：]?\s*$/.test(line) || /^(タグ|Tags)[:：]\s*[^\s]/.test(line)) {
      tagSectionStarted = true;
      isDetailedSummary = false;
      
      // 同じ行にタグがある場合
      const tagMatch = line.match(/^(?:タグ|Tags)[:：]\s*(.+)$/);
      if (tagMatch && tagMatch[1]) {
        const tagLine = tagMatch[1];
        tags = tagLine.split(/[,、，]/).map(tag => tag.trim()).filter(tag => tag.length > 0);
      }
      continue;
    }
    
    // タグセクションが開始されていて、まだタグが取得されていない場合
    if (tagSectionStarted && tags.length === 0 && line && !line.includes(':') && !line.includes('：')) {
      tags = line.split(/[,、，]/).map(tag => tag.trim()).filter(tag => tag.length > 0);
      tagSectionStarted = false; // タグ取得完了
      continue;
    }
    
    // 詳細要約セクションの検出
    if (/^(詳細要約|詳細な要約|Detailed Summary)[:：]/.test(line)) {
      isDetailedSummary = true;
      tagSectionStarted = false; // タグセクション終了
      const content = line.replace(/^(?:詳細要約|詳細な要約|Detailed Summary)[:：]\s*/, '');
      if (content) {
        detailedSummary += content + '\n';
      }
      continue;
    }
    
    // 通常要約セクションの検出
    if (/^(要約|Summary|短い要約)[:：]/.test(line) && !isDetailedSummary) {
      const content = line.replace(/^(?:要約|Summary|短い要約)[:：]\s*/, '');
      if (content) {
        summary = content;
      }
      continue;
    }
    
    // セクションに応じて内容を追加
    if (isDetailedSummary && line) {
      detailedSummary += line + '\n';
    } else if (!summary && !isDetailedSummary && !tagSectionStarted && line) {
      // 要約がまだ設定されていない場合
      summary = line;
    }
  }
  
  // クリーンアップ
  summary = finalCleanup(cleanupText(summary));
  detailedSummary = finalCleanup(cleanupText(detailedSummary.trim()));
  
  // フォールバック: 要約が空の場合は詳細要約の最初の文を使用
  if (!summary && detailedSummary) {
    const firstSentence = detailedSummary.split('。')[0];
    if (firstSentence) {
      summary = firstSentence + '。';
    }
  }
  
  // フォールバック: 詳細要約が空の場合は通常要約を使用
  if (!detailedSummary && summary) {
    detailedSummary = summary;
  }
  
  return {
    summary,
    detailedSummary,
    tags,
    articleType: 'general' // parseSummaryAndTagsでは判定しない
  };
}