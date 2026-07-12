# カードバトル モノレポ

「集めて・組んで・戦う」カードバトルゲームの共通エンジンと、テーマ別ゲームを1つのリポジトリで管理する。
DBなし・ビルドはファイルコピーのみの静的サイト構成。

```
engine/            共通エンジン（全ゲームで共有。ここを直すと全ゲームに反映される）
  js/              画面制御・ガチャ・対戦・セーブ・シェア・広告・解析
  css/style.css    スタイル・レアリティ演出
games/
  battle/          地域カードバトル（テーマ設定 js/config.js・データ・画像・OGP等）
  （新ゲームはここにフォルダを追加）
scripts/
  build.mjs        engine + games/<名前> を dist/ に合成（コピーのみ・依存なし）
  serve.mjs        開発用サーバー。games/<名前> 優先・engine フォールバックのオーバーレイ配信
vercel.json        共有ヘッダ設定（画像キャッシュ・CSVのContent-Type）
```

## ローカルで遊ぶ・開発する

```
node scripts/serve.mjs battle 8000
```

→ http://localhost:8000 を開く（`games/battle/ゲーム起動.bat` のダブルクリックでも同じ）。
オーバーレイ配信なので**開発中のビルドは不要**。engine と games のファイルをそのまま編集すればよい。

## デプロイ用ビルド

```
node scripts/build.mjs battle    # → dist/ に合成される
```

デプロイと開発で同じ「engine に games を重ねる」ルールを使うので、ローカルの見た目がそのまま本番になる。
同名ファイルはゲーム側が勝つ（index.html や js/config.js を差し替える仕組み）。

## Vercel デプロイ（ゲームごとに1プロジェクト）

1つのリポジトリに対して Vercel プロジェクトをゲームの数だけ作る。**URLはプロジェクトに紐づくので、
リポジトリ構成を変えても既存プロジェクトの設定を更新するだけで同じURLで配信され続ける**。

各プロジェクトの Settings → Build and Deployment:

| 設定 | 値 |
|---|---|
| Framework Preset | Other |
| Build Command | `node scripts/build.mjs battle` （ゲーム名を変える） |
| Output Directory | `dist` |
| Install Command | （空。依存なし） |
| Root Directory | （空のまま） |

任意: Settings → Git → Ignored Build Step に
`git diff --quiet HEAD^ HEAD -- engine/ games/battle/ scripts/ vercel.json`
を設定すると、他のゲームだけ変更したpushではデプロイをスキップできる。

## 新しいゲーム（テーマ）を追加する

1. `games/battle/` を参考に `games/<新ゲーム名>/` を作る。必要なのは:
   - `js/config.js` — テーマ設定（タイトル・グループ定義・文言・広告/GA ID）。
     **`GAME.storageKey` は必ず固有値にする**（同じだとセーブデータが混ざる）
   - `index.html` — `<head>`（title / OGP / favicon）と footer を書き換えたもの
   - `about.html` / `credits.html` / `terms.html` / `privacy.html` / `ads.txt`
   - `data/*.csv` — カード・タグ・シナジー・ボスのマスタ（列仕様は games/battle/README.md 参照）
   - `images/` — カード画像（`data/card_image.csv` に出典を記録）
2. `node scripts/serve.mjs <新ゲーム名>` で動作確認
3. Vercel で New Project → このリポジトリを Import → 上記の表の通り設定
   （Build Command のゲーム名だけ変える）→ 新しいURL/ドメインが割り当てられる

エンジン（engine/）への修正は、次のデプロイから**全ゲームに自動で反映される**。

## 各ゲームの詳細

- [games/battle/README.md](games/battle/README.md) — 地域カードバトル（ゲーム仕様・データ作成ツール）
