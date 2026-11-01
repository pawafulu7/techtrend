# WSL2 の開発サーバーにほかの PC から接続する

WSL2 は仮想マシンとして独自の内部ネットワークを持つため、同じ LAN のほかの PC（Mac など）から WSL2 内の `npm run dev`（ポート 3000）には直接つながらない。Windows 側でポートを転送する。

## 設定（Windows の PowerShell を管理者で開いて実行）

```powershell
# Windows の 3000 番への接続を WSL2 に転送する。
# connectaddress を 127.0.0.1 にすると、再起動で WSL2 の IP が変わっても設定し直さずに済む
netsh interface portproxy add v4tov4 listenport=3000 listenaddress=0.0.0.0 connectport=3000 connectaddress=127.0.0.1

# ファイアウォールで 3000 番を開ける
netsh advfirewall firewall add rule name="WSL2 TechTrend" dir=in action=allow protocol=TCP localport=3000
```

127.0.0.1 で転送されない環境では、`hostname -I`（WSL2 で実行）で調べた WSL2 の IP を connectaddress に入れる。この場合は Windows を再起動するたびに IP が変わるので設定し直す。

## 接続する

1. WSL2 で `npm run dev` を起動する
2. Windows で `ipconfig` を実行し、「イーサネット アダプター」か「Wi-Fi」の IPv4 アドレスを調べる
3. ほかの PC のブラウザで `http://<Windows の IP>:3000` を開く

家庭内など信頼できるネットワークでだけ使う。

## うまくいかないとき

- WSL2 で `npm run dev` が動いているか
- 転送の設定を確かめる: `netsh interface portproxy show all`
- Windows のファイアウォールで 3000 番が開いているか

## 元に戻す

```powershell
netsh interface portproxy delete v4tov4 listenport=3000 listenaddress=0.0.0.0
netsh advfirewall firewall delete rule name="WSL2 TechTrend"
```

参考: https://qiita.com/oligami/items/b377acbb5c32188492ad
