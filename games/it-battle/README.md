# IT用語カードバトル（IT TERMS CARD BATTLE）

IT用語をカード化したHTMLベースのコレクション＆対戦ゲーム（DBなし・静的ファイルのみ）。

共通エンジン（`engine/`）＋このフォルダ（テーマ設定・データ）の合成で動く。
モノレポ全体の構成・デプロイ・共通仕様は、リポジトリ直下の [README.md](../../README.md) と
姉妹作 [games/battle/README.md](../battle/README.md)（地域カードバトル）を参照。

## 起動方法

**`ゲーム起動.bat` をダブルクリック**（ポート8001。地域版と同時起動できる）。

手動で起動する場合（リポジトリ直下で）:

```
node scripts/serve.mjs it-battle 8001
```

## ゲーム仕様（地域版との差分）

- **カード**: 10分野・全442枚（言語 lang / 技術 tech / 用語 term / ツール tool の4種別）
  - 分野: ネットワーク / セキュリティ / データベース / OS・ハードウェア / 基礎理論・アルゴリズム /
    プログラミング言語 / Web技術 / クラウド・インフラ / AI・データサイエンス / 開発プロセス・ツール
- **得意分野確変**: 地域版の「地元」に相当。選んだ分野の排出重み×2.5
- **分野制覇**: 各分野に門番・番人・主の3段階×10分野＋最終ボス「シンギュラリティ」＝全31体。
  チケットは5体ごと+2、全制覇+5＝生涯17枚
- **タグ36種・シナジー64種**（`data/tag_master.csv` / `data/synergy_master.csv`）
- **カード画像**: Wikipedia(ja/en)の代表画像をCommonsのフリーライセンス品に限って取得
  （`node tools/fetch_images.mjs --rarity=all` → `node tools/make_thumbs.mjs` → `node tools/build_credits.mjs`）。
  画像が無いカードはプログラム描画のデザインで表示される
- 広告ID・GA IDは未設定（`js/config.js` の `ADS` / `ANALYTICS`。新ドメインの審査後に設定）

## カードの追加手順

1. `data/card_master.csv` に1行追加（id は `T443` のように連番を続ける）
   - `type`: `lang` / `tech` / `term` / `tool`、`field`: 上記10分野のいずれか
2. `data/card_detail.csv` に同じidで攻/防と豆知識を追加
3. `data/card_tag.csv` にタグ行を追加（新タグは先に `tag_master.csv` へ定義）
4. ボスへ影響させたい場合は再生成: `cd games/it-battle && node tools/build_bosses.mjs`

詳細行の欠落や未定義タグはロード時にブラウザのコンソールへ警告が出る。

## ボスの再生成

```
cd games/it-battle
node tools/build_bosses.mjs
```

各分野のカードだけでデッキを組み、理論最強値の15%→90%の幾何級数カーブに乗るよう
強さを調整して `data/boss_master.csv` を書き出す。カードを追加・調整したら再実行する。
