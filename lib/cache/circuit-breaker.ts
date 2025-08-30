/**
 * サーキットブレーカーパターンの実装
 * Redis障害時に自動的にフォールバックして、一定期間後に再試行
 */
export class CircuitBreaker {
  private state: 'CLOSED' | 'OPEN' | 'HALF_OPEN' = 'CLOSED';
  private failureCount = 0;
  private lastFailureTime?: number;
  private successCount = 0;
  
  constructor(
    private readonly threshold = 5, // 失敗回数の閾値
    private readonly timeout = 60000, // 回路開放時間（ミリ秒）
    private readonly halfOpenRequests = 3 // HALF_OPEN状態での試行回数
  ) {}

  /**
   * 現在の状態を取得
   */
  getState(): string {
    return this.state;
  }

  /**
   * 統計情報を取得
   */
  getStats() {
    return {
      state: this.state,
      failureCount: this.failureCount,
      successCount: this.successCount,
      lastFailureTime: this.lastFailureTime ? new Date(this.lastFailureTime).toISOString() : null
    };
  }

  /**
   * 操作を実行
   * @param operation 実行する操作
   * @param fallback フォールバック関数
   */
  async execute<T>(
    operation: () => Promise<T>,
    fallback?: () => Promise<T> | T
  ): Promise<T> {
    // 回路が開いている場合
    if (this.state === 'OPEN') {
      const now = Date.now();
      const timeSinceLastFailure = now - (this.lastFailureTime || 0);
      
      // タイムアウト経過後、HALF_OPEN状態に移行
      if (timeSinceLastFailure > this.timeout) {
        this.state = 'HALF_OPEN';
        this.successCount = 0;
      } else {
        if (fallback) {
          return await fallback();
        }
        throw new Error('Circuit breaker is OPEN and no fallback provided');
      }
    }

    try {
      const result = await operation();
      
      // 成功時の処理
      if (this.state === 'HALF_OPEN') {
        this.successCount++;
        
        // 必要な成功回数に達したら回路を閉じる
        if (this.successCount >= this.halfOpenRequests) {
          this.state = 'CLOSED';
          this.failureCount = 0;
          this.successCount = 0;
        }
      } else if (this.state === 'CLOSED') {
        // CLOSED状態での成功はカウントをリセット
        this.failureCount = 0;
      }
      
      return result;
    } catch (_error) {
      // 失敗時の処理
      this.lastFailureTime = Date.now();
      
      if (this.state === 'HALF_OPEN') {
        this.state = 'OPEN';
        this.failureCount = this.threshold;
        this.successCount = 0;
      } else if (this.state === 'CLOSED') {
        this.failureCount++;
        
        // 閾値に達したら回路を開く
        if (this.failureCount >= this.threshold) {
          this.state = 'OPEN';
        }
      }
      
      // フォールバック実行
      if (fallback) {
        return await fallback();
      }
      
      throw _error;
    }
  }

  /**
   * 回路をリセット
   */
  reset() {
    this.state = 'CLOSED';
    this.failureCount = 0;
    this.successCount = 0;
    this.lastFailureTime = undefined;
  }
}

// シングルトンインスタンス
export const redisCircuitBreaker = new CircuitBreaker(5, 60000, 3);
