/**
 * E2E テスト用の設定ファイル
 * CI環境と開発環境の差異を吸収する
 */

export const testConfig = {
  // アプリケーションのポート設定（環境変数 > デフォルト）
  port: Number.isNaN(Number.parseInt(process.env.PORT ?? '', 10))
    ? 3000
    : Number.parseInt(process.env.PORT ?? '', 10),
  
  // ベースURL（環境に応じて自動設定）
  get baseUrl() {
    if (process.env.BASE_URL) {
      return process.env.BASE_URL;
    }
    return `http://localhost:${this.port}`;
  },
  
  // CI環境でのサーバー起動設定
  get webServer() {
    // CI環境でのみ有効、ローカルではnull
    if (!process.env.CI) {
      return null;
    }
    return {
      command: 'npm run build && npm run start',
      url: this.baseUrl,
      timeout: 300 * 1000,  // 5分に延長
      reuseExistingServer: true,
      stdout: 'pipe',  // ログ出力を有効化
      stderr: 'pipe',  // エラーログ出力を有効化
      env: { PORT: String(this.port), BASE_URL: this.baseUrl },
    };
  },
  
  // テストユーザー情報（e2e-helpersからインポートして使用）
  testUser: {
    email: 'test@example.com',
    password: 'TestPassword123',
    name: 'Test User',
    id: 'test-user-id',
  },
} as const;