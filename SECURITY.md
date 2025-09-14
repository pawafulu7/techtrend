# Security Policy

## セキュリティ修正履歴

### 2025年9月14日 - GitHub Code Scanningアラート対応

#### 概要
GitHub Code Scanningで検出された9個のセキュリティアラート（全てHigh severity）を修正しました。

#### 修正内容

##### 1. HTMLサニタイゼーション脆弱性（XSS対策）
- **影響ファイル**: `text-processor.ts`, `base.ts`
- **修正方法**: sanitize-htmlライブラリを使用した安全な実装に置き換え
- **アラート**: #45, #5

##### 2. URL検証脆弱性（SSRF/Open Redirect対策）
- **影響ファイル**: `hacker-news.ts`, `unified-summary-service.ts`
- **修正方法**: URL APIを使用した安全なドメイン検証を実装
- **新規ファイル**: `lib/utils/url-validator.ts`
- **アラート**: #27, #26, #25, #24, #10, #9

##### 3. 機密情報のログ出力
- **影響ファイル**: `test-registration.js`
- **修正方法**: console.logを削除
- **アラート**: #38

#### 関連PR
- https://github.com/pawafulu7/techtrend/pull/50

## セキュリティ脆弱性の報告

このプロジェクトは個人の学習用プロジェクトであり、セキュリティ脆弱性の報告は受け付けていません。

## Supported Versions

個人プロジェクトのため、セキュリティサポートは提供していません。

| Version | Supported          |
| ------- | ------------------ |
| all     | :x:                |

## License

MIT License