// 画像クレジット一覧ページ(credits.html)を data/card_image.csv から生成する
//   cd games/it-battle && node tools/build_credits.mjs
// カード画像を追加・変更したら再実行すること
import { readFileSync, writeFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { parseCSV } from '../../../engine/js/csvparse.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = f => parseCSV(readFileSync(path.join(ROOT, 'data', f), 'utf8'));

const names = new Map(read('card_master.csv').map(m => [m.id, m.name]));
const images = read('card_image.csv');

const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const rows = images
  .map(img => ({ ...img, name: names.get(img.card_id) || img.card_id }))
  .sort((a, b) => a.card_id.localeCompare(b.card_id, 'ja'))
  .map(img => `      <tr>
        <td>${esc(img.name)}</td>
        <td>${esc(img.artist)}</td>
        <td>${esc(img.license)}</td>
        <td><a href="${esc(img.source_url)}" target="_blank" rel="noopener">出典</a></td>
      </tr>`)
  .join('\n');

const html = `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>クレジット | IT用語カードバトル</title>
<meta name="description" content="IT用語カードバトルで使用しているカード画像の出典・作者・ライセンスの一覧です。">
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='7' fill='%230b0e17'/%3E%3Crect x='3.5' y='3.5' width='25' height='25' rx='5' fill='none' stroke='%23f2c14e' stroke-width='1.6'/%3E%3Ctext x='16' y='21.5' font-family='serif' font-size='13' font-weight='bold' fill='%23f2c14e' text-anchor='middle'%3EIT%3C/text%3E%3C/svg%3E">
<link rel="stylesheet" href="css/style.css">
</head>
<body>
<div class="doc-page">
  <header class="doc-header">
    <a class="doc-logo" href="./">IT用語カードバトル</a>
    <a class="sub-btn small" href="./">ゲームで遊ぶ</a>
  </header>

  <h1>クレジット</h1>
  <p class="doc-date">画像一覧は card_image.csv から自動生成されています（全${images.length}枚）</p>

  <h2>名称・商標について</h2>
  <p>カード名として使用している技術・製品・サービスの名称（プログラミング言語名、ツール名、プロトコル名など）は、各開発元・権利者の商標または登録商標です。本ゲームは各技術を紹介・応援する目的で名称を使用しており、各権利者との提携・公認関係はありません。</p>

  <h2>用語解説について</h2>
  <p>カードの解説文は、公開されている技術情報をもとにゲーム用へ短く要約・再構成したものです。楽しく読めることを優先しているため、厳密な定義とは異なる場合があります。</p>

  <h2>カード画像について</h2>
  <p>カードの画像（ロゴ・図版・写真）は、Wikipedia / Wikimedia Commons で公開されているクリエイティブ・コモンズ等のフリーライセンス画像を利用しています。作者・ライセンス・出典は以下のとおりです（ゲーム内の各カード詳細画面にも表示しています）。なお、ロゴは各権利者の商標であり、ライセンスは画像データの利用条件を示すものです。</p>
  <p>ライセンスの詳細: <a href="https://creativecommons.org/licenses/?lang=ja" target="_blank" rel="noopener">クリエイティブ・コモンズ・ライセンス</a></p>

  <div style="overflow-x:auto">
    <table>
      <thead><tr><th>カード</th><th>作者</th><th>ライセンス</th><th>出典</th></tr></thead>
      <tbody>
${rows}
      </tbody>
    </table>
  </div>

  <nav class="doc-nav">
    <a href="./">ゲームトップ</a>
    <a href="about.html">このゲームについて・遊び方</a>
    <a href="terms.html">利用規約</a>
    <a href="privacy.html">プライバシーポリシー</a>
    <a href="mailto:batorukado@gmail.com">お問い合わせ</a>
  </nav>
  <p class="doc-footer">© 2026 IT用語カードバトル</p>
</div>
</body>
</html>
`;

writeFileSync(path.join(ROOT, 'credits.html'), html, 'utf8');
console.log(`credits.html 書き出し完了（${images.length}枚）`);
