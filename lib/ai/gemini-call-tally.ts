/**
 * 定期ジョブの 1 回の実行で、Gemini の呼び出しが届いたか（応答が返ったか）を数える。
 *
 * 呼び出しが 1 件も届かずに失敗だけが出た回は、モデルの提供終了・API キーの不備・利用上限・
 * その回を通した障害のどれかで、ジョブを失敗（終了コード 1）にしてワークフローの通知に載せる。
 * 以前は翻訳の補完ジョブが、提供終了したモデルで全件 404 になっても成功で終わり、数か月気づけなかった。
 *
 * 応答は返ったが中身が使えなかった呼び出し（訳文が原文のまま・形式が崩れたなど）は「届いた」に数える。
 * 毎回残りうる失敗で、毎回通知が出ないようにするため
 */
export class GeminiCallTally {
  /** 応答が返った呼び出しの数 */
  reached = 0;
  /** 応答が返らなかった呼び出しの数（HTTP エラー・タイムアウト・通信の失敗） */
  failed = 0;

  /** Gemini を呼び、応答が返ったか（例外が出なかったか）を数える */
  async track<T>(call: () => Promise<T>): Promise<T> {
    try {
      const result = await call();
      this.reached++;
      return result;
    } catch (error) {
      this.failed++;
      throw error;
    }
  }

  /** 呼び出しが 1 件も届かずに失敗だけが出たか */
  get allFailed(): boolean {
    return this.failed > 0 && this.reached === 0;
  }

  /** ログ用の 1 行（件数だけ） */
  summary(): string {
    return `gemini_calls_reached=${this.reached} gemini_calls_failed=${this.failed}`;
  }
}
