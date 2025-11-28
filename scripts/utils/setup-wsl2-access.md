# WSL2 TechTrendを他のPCからアクセスする方法

## 問題の原因
WSL2は仮想マシンとして動作しており、独自の内部ネットワークを持っています。そのため、外部からWSL2内のサービスに直接アクセスすることはできません。

## 解決方法

### 方法1: PowerShellスクリプトを使用（推奨）

1. **Windows側でPowerShellを管理者権限で開く**
   - Windowsキー + X → Windows PowerShell (管理者)

2. **ポートフォワーディングスクリプトを実行**
   ```powershell
   # WSL2から以下のコマンドでスクリプトをWindowsにコピー
   cp /home/tomoaki/work/techtrend/scripts/setup-port-forward.ps1 /mnt/c/Users/[あなたのWindowsユーザー名]/Desktop/
   ```

3. **Windowsのデスクトップからスクリプトを実行**
   ```powershell
   cd C:\Users\[あなたのWindowsユーザー名]\Desktop
   .\setup-port-forward.ps1
   ```

### 方法2: 手動設定

1. **WSL2のIPアドレスを確認**
   ```bash
   hostname -I
   ```

2. **Windows PowerShell（管理者）で以下を実行**
   ```powershell
   # WSL2のIPアドレス（上記で確認したもの）
   $wslIp = "172.17.1.124"  # あなたの環境に合わせて変更
   
   # ポートフォワーディング設定
   netsh interface portproxy add v4tov4 listenport=3000 listenaddress=0.0.0.0 connectport=3000 connectaddress=$wslIp
   
   # ファイアウォール設定
   netsh advfirewall firewall add rule name="WSL2 TechTrend" dir=in action=allow protocol=TCP localport=3000
   ```

3. **WindowsのIPアドレスを確認**
   ```powershell
   ipconfig
   ```
   「イーサネット アダプター」または「Wi-Fi」のIPv4アドレスを確認

### アクセス方法

設定完了後、他のPC（Mac含む）から以下のURLでアクセス：
```
http://[WindowsのIPアドレス]:3000
```

例：`http://192.168.1.100:3000`

### 注意事項

- **再起動時の対応**: Windowsを再起動するとWSL2のIPアドレスが変わるため、再度設定が必要
- **セキュリティ**: ホームネットワーク内でのみ使用を推奨
- **Next.jsの起動**: WSL2内でNext.jsサーバーが起動していることを確認

### トラブルシューティング

1. **接続できない場合**
   - Windowsファイアウォールが無効になっていないか確認
   - Next.jsが起動しているか確認（`npm run dev`）
   - ポートフォワーディングが正しく設定されているか確認：
     ```powershell
     netsh interface portproxy show all
     ```

2. **設定をリセットする場合**
   ```powershell
   netsh interface portproxy reset
   netsh advfirewall firewall delete rule name="WSL2 TechTrend"
   ```