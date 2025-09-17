# TechTrend

技術記事アグリゲーター / Tech Article Aggregator

## 概要

複数の技術情報源から記事を自動収集し、AI要約を生成する個人プロジェクトです。

## 技術スタック

- **Frontend**: Next.js 15, React 18, TypeScript
- **Backend**: Next.js API Routes, Prisma
- **Database**: PostgreSQL
- **AI**: Google Gemini API
- **Styling**: Tailwind CSS
- **Cache**: Redis

## ⚠️ 重要なお知らせ

**このプロジェクトは個人の学習・実験用プロジェクトです。**

- 🚫 **Pull Requestは受け付けていません**
- 🚫 **Issueへの対応は行いません**
- 🚫 **フォークは自由ですが、サポートは提供しません**

## セットアップ（参考）

環境変数の例は `.env.example` を参照してください。

```bash
# 依存関係インストール
npm install

# データベースセットアップ
npx prisma migrate dev

# 開発サーバー起動
npm run dev
```

### ローカル環境でのスクリプト実行

ローカル環境でスケジューラースクリプトを実行する場合は、環境変数を読み込むため以下のコマンドを使用してください：

```bash
# 記事収集（環境変数自動読み込み）
npm run collect:local

# 要約生成（環境変数自動読み込み）
npm run summarize:local

# スケジューラー（環境変数自動読み込み）
npm run scheduler:local
```

### PM2でのローカル実行

PM2を使用してスケジューラーをバックグラウンドで実行する場合：

```bash
# PM2でスケジューラー起動（ローカル環境用）
npm run scheduler:start:local

# ログ確認
npm run scheduler:logs:local

# 再起動
npm run scheduler:restart:local

# 停止
npm run scheduler:stop:local
```

### Docker環境での実行

Docker環境でテストやビルドを実行する場合、macOS等でUID/GIDが異なることがあるため、以下の設定が必要です：

```bash
# ホストのUID/GIDを環境変数として設定（.envまたはシェルプロファイルに追加）
export HOST_UID=$(id -u)
export HOST_GID=$(id -g)

# Dockerでのテスト実行
npm run docker:test

# DockerでのE2Eテスト実行
npm run docker:e2e

# Dockerでのビルド実行
npm run docker:build
```

**注意**: これらの値はDockerコンテナ内でファイル権限を適切に設定するために使用されます。

**注意**:
- 通常の `npx tsx scripts/...` コマンドでは `.env` ファイルが読み込まれないため、上記のローカル実行用コマンドを使用してください。
- PM2のローカル実行では `ecosystem.local.config.js` が使用され、`.env` ファイルが自動的に読み込まれます。

## ライセンス

MIT License

---

*This is a personal learning project. Not accepting contributions.*

