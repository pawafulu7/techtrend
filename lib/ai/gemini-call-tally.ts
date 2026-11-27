/**
 * 定期ジョブの 1 回の実行で、Gemini の呼び出しが届いたか（応答が返ったか）を数える。
 *
 * 呼び出しが 1 件も届かずに失敗だけが出た回は、モデルの提供終了・API キーの不備・利用上限・
 * その回を通した障害のどれかで、ジョブを失敗（終了コード 1）にしてワークフローの通知に載せる。
 * 以前は翻訳の補完ジョブが、提供終了したモデルで全件 404 になっても成功で終わり、数か月気づけなかった。
 *
 * 応答は返ったが中身が使えなかった呼び出し（訳文が原文のまま・安全性のフィルタで止められた・
 * 形式が崩れたなど）は「届いた」に数える。毎回残りうる失敗で、毎回通知が出ないようにするため。
 * 正体の分からない例外は「届かなかった」に数える（全件失敗を見逃さない側に倒す）
 */
export class GeminiCallTally {
  private reachedCount = 0;
  private failedCount = 0;

  /** 応答が返った呼び出しの数 */
  get reached(): number {
    return this.reachedCount;
  }

  /** 応答が返らなかった呼び出しの数（HTTP エラー・タイムアウト・通信の失敗など） */
  get failed(): number {
    return this.failedCount;
  }

  recordReached(): void {
    this.reachedCount++;
  }

  recordFailed(): void {
    this.failedCount++;
  }

  /**
   * Gemini を呼び、応答が返ったかを数える。例外はそのまま投げ直す。
   * isReachedError が true を返す例外（応答は返ったが使えなかったもの）は「届いた」に数える
   */
  async track<T>(
    call: () => Promise<T>,
    options: { isReachedError?: (error: unknown) => boolean } = {}
  ): Promise<T> {
    try {
      const result = await call();
      this.recordReached();
      return result;
    } catch (error) {
      if (options.isReachedError?.(error)) {
        this.recordReached();
      } else {
        this.recordFailed();
      }
      throw error;
    }
  }

  /** 呼び出しが 1 件も届かずに失敗だけが出たか */
  get allFailed(): boolean {
    return this.failedCount > 0 && this.reachedCount === 0;
  }

  /** ログ用の 1 行（件数だけ） */
  summary(): string {
    return `gemini_calls_reached=${this.reachedCount} gemini_calls_failed=${this.failedCount}`;
  }
}
