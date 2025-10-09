/**
 * AI/LLM記事フィルタリングユーティリティ
 * AI/LLM関連の技術記事を判定するためのキーワードベースフィルタ
 */

export interface AILLMKeywords {
  core_llm: string[];
  technical: string[];
  infrastructure: string[];
  research: string[];
  applications: string[];
}

export interface ArticleInput {
  title: string;
  summary?: string;
  content?: string;
  url?: string;
}

export interface FilterResult {
  isAILLM: boolean;
  matchedKeywords: string[];
  confidence: number; // 0-1の信頼度スコア
}

export class AILLMFilter {
  private readonly aiKeywords: AILLMKeywords;
  private readonly aiKeywordsJa: AILLMKeywords;
  private readonly excludePatterns: RegExp[];

  constructor() {
    // 英語キーワード辞書
    this.aiKeywords = {
      core_llm: [
        'LLM', 'Large Language Model', 'Generative AI', 'GenAI',
        'GPT', 'GPT-4', 'GPT-3', 'ChatGPT', 'BERT', 'T5', 'Transformer',
        'Mistral', 'Llama', 'Llama 2', 'Llama 3', 'Gemini', 'Claude', 'PaLM',
        'Anthropic', 'OpenAI', 'Cohere', 'Stability AI', 'Midjourney',
        'Stable Diffusion', 'DALL-E', 'Bard'
      ],
      technical: [
        'Diffusion', 'Diffusion Model', 'RAG', 'Retrieval Augmented', 'Retrieval-Augmented Generation',
        'Vector Database', 'Vector DB', 'Embedding', 'Embeddings', 'Word Embedding',
        'Fine-tuning', 'Fine-tune', 'Finetuning', 'PEFT', 'LoRA', 'QLoRA', 'Adapter',
        'Prompt Engineering', 'Prompt Design', 'Few-shot', 'Zero-shot', 'One-shot',
        'Instruction Tuning', 'Instruction Following', 'RLHF', 'Constitutional AI',
        'Chain of Thought', 'CoT', 'Self-Supervised', 'Multimodal', 'Vision-Language',
        'Audio-Language', 'Cross-modal', 'Attention Mechanism', 'Self-Attention',
        'Context Window', 'Token Limit', 'Tokenization', 'BPE', 'SentencePiece'
      ],
      infrastructure: [
        'MLOps', 'LLMOps', 'Model Deployment', 'Model Serving', 'Model Registry',
        'Inference Optimization', 'Inference Engine', 'Quantization', 'Model Compression',
        'LangChain', 'LlamaIndex', 'Hugging Face', 'HuggingFace', 'Weights & Biases',
        'OpenAI API', 'Anthropic API', 'Cohere API', 'Azure OpenAI', 'Vertex AI',
        'SageMaker', 'Model Hub', 'ONNX', 'TensorRT', 'vLLM', 'Text Generation Inference',
        'Gradio', 'Streamlit', 'FastAPI', 'Ray Serve', 'Triton'
      ],
      research: [
        'Reinforcement Learning', 'Deep Learning', 'Machine Learning', 'ML',
        'machine learning', 'deep learning', // 小文字版も追加
        'Neural Network', 'Neural Architecture', 'Attention', 'Transformer Architecture',
        'Transfer Learning', 'Meta-Learning', 'Few-Shot Learning', 'Continual Learning',
        'Federated Learning', 'Active Learning', 'Contrastive Learning', 'Self-Supervised Learning',
        'Representation Learning', 'Emergent Abilities', 'Scaling Laws', 'Benchmark',
        'Evaluation Metrics', 'Perplexity', 'BLEU', 'ROUGE', 'F1 Score'
      ],
      applications: [
        'Code Generation', 'Code Completion', 'GitHub Copilot', 'Copilot', 'Codewhisperer',
        'AI Assistant', 'Virtual Assistant', 'Conversational AI', 'Dialogue System',
        'Chatbot', 'Question Answering', 'QA System', 'Summarization', 'Text Summarization',
        'Machine Translation', 'Neural Machine Translation', 'NMT',
        'Image Generation', 'Text-to-Image', 'Image-to-Image', 'Inpainting',
        'Speech Recognition', 'ASR', 'Text-to-Speech', 'TTS', 'Voice Synthesis',
        'Sentiment Analysis', 'Named Entity Recognition', 'NER', 'Information Extraction',
        'Document Understanding', 'OCR', 'Layout Analysis'
      ]
    };

    // 日本語キーワード辞書
    this.aiKeywordsJa = {
      core_llm: [
        '大規模言語モデル', 'LLM', '生成ai', '生成的ai', '人工知能',
        'ChatGPT', 'GPT', 'Transformer', 'トランスフォーマー',
        'ジェミニ', 'クロード', 'ラマ', 'ミストラル'
      ],
      technical: [
        '強化学習', '深層学習', 'ディープラーニング', '機械学習',
        '微調整', 'ファインチューニング', 'プロンプト', 'プロンプトエンジニアリング',
        'ベクトルDB', 'ベクトルデータベース', 'ベクトル検索', 'RAG',
        '埋め込み', 'エンベディング', '自己注意機構', 'アテンション',
        'マルチモーダル', 'ビジョン言語モデル'
      ],
      infrastructure: [
        'MLOps', 'モデル運用', 'モデルデプロイ', 'モデル配信',
        '推論最適化', '量子化', 'モデル圧縮',
        'ラングチェーン', 'ラマインデックス', 'ハギングフェイス'
      ],
      research: [
        'ニューラルネットワーク', 'ニューラルネット', 'アテンション機構',
        '転移学習', 'メタ学習', '自己教師あり学習', '対照学習',
        'スケーリング則', 'ベンチマーク', '評価指標'
      ],
      applications: [
        'コード生成', 'コード補完', 'AIアシスタント',
        'チャットボット', '対話システム', '質問応答', '要約生成',
        '機械翻訳', '自動翻訳', '画像生成', 'テキスト画像生成',
        '音声認識', '音声合成', '感情分析', '固有表現抽出'
      ]
    };

    // 除外パターン（マーケティング、無関係なコンテンツ）
    this.excludePatterns = [
      // 純粋な金融・投資（AI言及なし）
      // AIキーワードがない場合のみ除外
      // 除外パターンは単純化して、AIキーワードチェック後に適用

      // 製品マーケティング（技術詳細なし）
      /\b(?:product launch|now available|coming soon|pre-order)(?!.*(?:API|model|framework|library))/i,

      // イベント告知のみ（技術内容なし）
      /\b(?:join us|register now|save the date|early bird)(?!.*(?:paper|research|tutorial|workshop))/i,

      // 求人・採用情報
      /\b(?:we're hiring|join our team|career opportunity|job opening)(?!.*(?:AI|ML|engineer|researcher))/i
    ];
  }

  /**
   * 記事がAI/LLM関連かどうかを判定
   */
  isAILLMArticle(article: ArticleInput): boolean {
    const result = this.analyze(article);
    return result.isAILLM;
  }

  /**
   * 詳細な分析結果を返す
   */
  analyze(article: ArticleInput): FilterResult {
    const text = this.normalizeText(article);

    // キーワードマッチング（先に実施）
    const matchedKeywords = this.getMatchedKeywords(article);

    // AI/LLMキーワードがあれば除外パターンをスキップ
    const hasAIKeywords = matchedKeywords.length > 0;

    // AI関連キーワードがない場合のみ除外パターンチェック
    if (!hasAIKeywords) {
      for (const pattern of this.excludePatterns) {
        if (pattern.test(text)) {
          return {
            isAILLM: false,
            matchedKeywords: [],
            confidence: 0
          };
        }
      }
    }

    // 信頼度計算
    const confidence = this.calculateConfidence(matchedKeywords, text);

    // AI/LLM判定
    const isAILLM = this.determineAILLM(matchedKeywords, confidence);

    return {
      isAILLM,
      matchedKeywords,
      confidence
    };
  }

  /**
   * マッチしたキーワードを取得
   */
  getMatchedKeywords(article: ArticleInput): string[] {
    const rawText = `${article.title} ${article.summary || ''} ${article.content || ''}`;
    const text = rawText.toLowerCase();
    const matched: Set<string> = new Set();

    // 英語キーワードチェック
    Object.entries(this.aiKeywords).forEach(([_category, keywords]) => {
      keywords.forEach(kw => {
        if (this.containsKeyword(rawText, text, kw)) {
          matched.add(kw);
        }
      });
    });

    // 日本語キーワードチェック（大文字小文字を考慮）
    Object.entries(this.aiKeywordsJa).forEach(([_category, keywords]) => {
      keywords.forEach(kw => {
        if (text.includes(kw.toLowerCase())) {
          matched.add(kw);
        }
      });
    });

    return Array.from(matched);
  }

  /**
   * テキストの正規化
   */
  private normalizeText(article: ArticleInput): string {
    const parts = [
      article.title,
      article.summary || '',
      article.content || ''
    ];

    return parts.join(' ').toLowerCase();
  }

  /**
   * キーワードが含まれるかチェック（大文字小文字、単語境界考慮）
   */
  private containsKeyword(rawText: string, lowerText: string, keyword: string): boolean {
    const lowerKeyword = keyword.toLowerCase();

    // CamelCaseキーワード（PaLM等）は大文字小文字を厳密にチェック
    // ただし、短い略語的なCamelCase（PaLM、CoT等、5文字以下）のみ厳密化
    const hasMixedCase = /[a-z]/.test(keyword) && /[A-Z]/.test(keyword);
    const isShortMixedCase = hasMixedCase && keyword.length <= 5;

    if (isShortMixedCase) {
      const exactPattern = new RegExp(`\\b${this.escapeRegex(keyword)}\\b`);
      if (exactPattern.test(rawText)) {
        return true;
      }

      // 大文字を含む境界マッチのみ許可（palm tree等の誤検知を防ぐ）
      const boundaryPattern = new RegExp(`\\b${this.escapeRegex(lowerKeyword)}\\b`, 'i');
      const match = rawText.match(boundaryPattern);
      if (match && /[A-Z]/.test(match[0])) {
        return true;
      }

      // 短いCamelCaseで厳密マッチしない場合は不一致
      return false;
    }

    // 短い略語（4文字以下）は完全一致
    const isShortAcronym = keyword.length <= 4 && /^[A-Z0-9-]+$/.test(keyword);
    if (isShortAcronym || keyword === keyword.toUpperCase()) {
      const pattern = new RegExp(`\\b${this.escapeRegex(lowerKeyword)}\\b`, 'i');
      return pattern.test(lowerText);
    }

    // それ以外は部分一致（小文字で比較）
    return lowerText.includes(lowerKeyword);
  }

  /**
   * 正規表現用のエスケープ
   */
  private escapeRegex(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  /**
   * 信頼度スコアの計算
   */
  private calculateConfidence(matchedKeywords: string[], _text: string): number {
    if (matchedKeywords.length === 0) return 0;

    let score = 0;

    // コアLLMキーワードは高スコア
    const coreMatches = matchedKeywords.filter(kw =>
      this.aiKeywords.core_llm.includes(kw) ||
      this.aiKeywordsJa.core_llm.includes(kw)
    );
    score += coreMatches.length * 0.3;

    // 技術キーワードは中スコア
    const techMatches = matchedKeywords.filter(kw =>
      this.aiKeywords.technical.includes(kw) ||
      this.aiKeywordsJa.technical.includes(kw)
    );
    score += techMatches.length * 0.15;

    // その他のキーワード
    const otherMatches = matchedKeywords.length - coreMatches.length - techMatches.length;
    score += otherMatches * 0.1;

    // 正規化（0-1の範囲に）
    return Math.min(1, score);
  }

  /**
   * AI/LLM記事かどうかの最終判定
   */
  private determineAILLM(matchedKeywords: string[], confidence: number): boolean {
    // コアLLMキーワードが1つ以上あれば採用
    const hasCoreKeyword = matchedKeywords.some(kw =>
      this.aiKeywords.core_llm.includes(kw) ||
      this.aiKeywordsJa.core_llm.includes(kw)
    );

    if (hasCoreKeyword) return true;

    // 技術・研究キーワードが2つ以上あれば採用
    const techAndResearchCount = matchedKeywords.filter(kw =>
      this.aiKeywords.technical.includes(kw) ||
      this.aiKeywords.research.includes(kw) ||
      this.aiKeywordsJa.technical.includes(kw) ||
      this.aiKeywordsJa.research.includes(kw)
    ).length;

    if (techAndResearchCount >= 2) return true;

    // 信頼度が0.3以上なら採用
    if (confidence >= 0.3) return true;

    // 全カテゴリで3つ以上マッチすれば採用
    if (matchedKeywords.length >= 3) return true;

    return false;
  }

  /**
   * フィルタのカテゴリ別統計を取得
   */
  getStatistics(articles: ArticleInput[]): {
    total: number;
    aiLLM: number;
    percentage: number;
    keywordFrequency: Map<string, number>;
  } {
    const keywordFreq = new Map<string, number>();
    let aiLLMCount = 0;

    articles.forEach(article => {
      const result = this.analyze(article);
      if (result.isAILLM) {
        aiLLMCount++;
        result.matchedKeywords.forEach(kw => {
          keywordFreq.set(kw, (keywordFreq.get(kw) || 0) + 1);
        });
      }
    });

    return {
      total: articles.length,
      aiLLM: aiLLMCount,
      percentage: articles.length > 0 ? (aiLLMCount / articles.length) * 100 : 0,
      keywordFrequency: keywordFreq
    };
  }
}

// シングルトンインスタンスをエクスポート
export const aiLLMFilter = new AILLMFilter();