# WSL2 TechTrendを外部PCからアクセスする設定

## 簡単な設定方法（Qiita記事の方法）

### 1. バッチファイルを使用

1. **バッチファイルをWindowsにコピー**
   ```bash
   # WSL2で実行
   cp /home/tomoaki/work/techtrend/scripts/open-wsl-port.bat /mnt/c/Users/[あなたのWindowsユーザー名]/Desktop/
   ```

2. **Windowsデスクトップで右クリック → 「管理者として実行」**

3. **完了！**
   - 表示されたURL（例: `http://192.168.1.100:3000`）でMacからアクセス可能

### 2. Next.jsサーバーの起動

WSL2で以下を実行：
```bash
cd /home/tomoaki/work/techtrend
npm run dev
```

## この方法の利点

- `connectaddress=127.0.0.1` を使用するため、WSL2のIPアドレスが変わっても問題ない
- Windows再起動後も、バッチファイルを再実行するだけでOK
- シンプルで分かりやすい

## 動作確認

1. Macのブラウザで `http://[WindowsのIP]:3000` にアクセス
2. TechTrendの画面が表示されればOK

## トラブルシューティング

### 接続できない場合
1. Next.jsが起動しているか確認
2. Windowsファイアウォールでポート3000が開いているか確認
3. 以下のコマンドで設定を確認：
   ```cmd
   netsh interface portproxy show all
   ```

### 設定を元に戻したい場合
**restore-wsl-port.bat** を使用：
1. バッチファイルをWindowsにコピー
   ```bash
   cp /home/tomoaki/work/techtrend/scripts/restore-wsl-port.bat /mnt/c/Users/[ユーザー名]/Desktop/
   ```
2. 右クリック → 「管理者として実行」

このスクリプトは：
- TechTrendで追加した設定のみを削除
- 他のアプリケーションの設定は維持
- 追加前の状態に安全に戻す

## 参考
- https://qiita.com/oligami/items/b377acbb5c32188492ad