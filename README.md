# Chev_2dist_sweeper

周囲5×5マス（中央を除く24マス）の爆弾数を表示するマインスイーパーです。

## ローカルで動かす

`index.html` をブラウザで開けば動作します。ビルドやサーバーは不要です。

## GitHub Pagesで公開する

1. GitHubで新しいリポジトリを作成する（例: `Chev_2dist_sweeper`）。
2. このフォルダ内の `index.html`、`style.css`、`script.js`、`README.md` をリポジトリの直下にアップロードする。
3. リポジトリの **Settings → Pages** を開く。
4. **Build and deployment** の **Source** を `Deploy from a branch` にする。
5. Branch を `main`、Folder を `/(root)` にして **Save**。
6. 数分待ち、Settings → Pages に表示されるURLを開く。

公開URLは通常 `https://tanuki31514.github.io/Chev_2dist_sweeper/` です。

## 操作

- 左クリック / タップ: マスを開く
- 右クリック: 旗を立てる / 外す
- スマートフォン: 長押しで旗
- `R`: リスタート
- `ESC`: 難易度選択に戻る

## 難易度

| 難易度 | 盤面 | 爆弾 | マス |
|---|---:|---:|---:|
| 初級 | 10 × 10 | 7 | 50px |
| 中級 | 16 × 30 | 35 | 30px |
| 上級 | 40 × 60 | 150 | 20px |
