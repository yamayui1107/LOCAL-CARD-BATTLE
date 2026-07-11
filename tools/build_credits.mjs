// 画像クレジット一覧ページ(credits.html)を data/card_image.csv から生成する
//   node tools/build_credits.mjs
// カード画像を追加・変更したら再実行すること
import { readFileSync, writeFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { parseCSV } from '../js/csv.js';

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
<title>画像クレジット | 地域カードバトル</title>
<meta name="description" content="地域カードバトルで使用しているカード画像の出典・撮影者・ライセンスの一覧です。">
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='7' fill='%230b0e17'/%3E%3Crect x='3.5' y='3.5' width='25' height='25' rx='5' fill='none' stroke='%23f2c14e' stroke-width='1.6'/%3E%3Ctext x='16' y='22.5' font-family='serif' font-size='17' font-weight='bold' fill='%23f2c14e' text-anchor='middle'%3E地%3C/text%3E%3C/svg%3E">
<link rel="stylesheet" href="css/style.css">
</head>
<body>
<div class="doc-page">
  <header class="doc-header">
    <a class="doc-logo" href="./">地域カードバトル</a>
    <a class="sub-btn small" href="./">ゲームで遊ぶ</a>
  </header>

  <h1>画像クレジット</h1>
  <p class="doc-date">このページは card_image.csv から自動生成されています（全${images.length}枚）</p>

  <p>「地域カードバトル」のカード写真は、Wikipedia / Wikimedia Commons で公開されているクリエイティブ・コモンズ等のライセンス画像を利用しています。撮影者・ライセンス・出典は以下のとおりです（ゲーム内の各カード詳細画面にも表示しています）。素晴らしい写真を公開してくださっている撮影者の皆さまに感謝します。</p>
  <p>ライセンスの詳細: <a href="https://creativecommons.org/licenses/?lang=ja" target="_blank" rel="noopener">クリエイティブ・コモンズ・ライセンス</a></p>

  <div style="overflow-x:auto">
    <table>
      <thead><tr><th>カード</th><th>撮影者・作者</th><th>ライセンス</th><th>出典</th></tr></thead>
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
  <p class="doc-footer">© 2026 地域カードバトル</p>
</div>
</body>
</html>
`;

writeFileSync(path.join(ROOT, 'credits.html'), html, 'utf8');
console.log(`credits.html 書き出し完了（${images.length}枚）`);
