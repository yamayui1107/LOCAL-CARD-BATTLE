// Wikipedia(ja)の代表画像を一括取得してカード画像にするツール
//   node tools/fetch_images.mjs                → SSR/URのみ取得
//   node tools/fetch_images.mjs --rarity=all   → 全カード
//   node tools/fetch_images.mjs --rarity=SR,SSR,UR
// 出力: images/<card_id>.<ext> と data/card_image.csv（出典・ライセンス記録）
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { parseCSV } from '../../../engine/js/csvparse.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const API = 'https://ja.wikipedia.org/w/api.php';
const UA = 'jimoto-card-game/0.1 (personal hobby project; contact: local)';
const THUMB_SIZE = 640;

// Wikipedia記事名がカード名と異なる場合の上書き（card_id → 記事名）
const TITLE_OVERRIDES = {
  C059: '港区 (東京都)',
  C064: '中央区 (東京都)',
  S24: '端島 (長崎県)',       // 軍艦島
  S12: '浅草寺',
  S20: '札幌市時計台',
};

const rarityArg = (process.argv.find(a => a.startsWith('--rarity=')) || '--rarity=SSR,UR')
  .split('=')[1];
const targetRarities = rarityArg === 'all' ? null : new Set(rarityArg.split(','));

const master = parseCSV(readFileSync(path.join(ROOT, 'data/card_master.csv'), 'utf8'));
const targets = master.filter(c => !targetRarities || targetRarities.has(c.rarity));
console.log(`対象: ${targets.length}枚 (${rarityArg})`);

mkdirSync(path.join(ROOT, 'images'), { recursive: true });

const apiGet = async (params) => {
  const url = API + '?' + new URLSearchParams({ format: 'json', ...params });
  for (let attempt = 1; ; attempt++) {
    const res = await fetch(url, { headers: { 'User-Agent': UA } });
    if (res.ok) return res.json();
    if (res.status === 429 && attempt < 6) {   // レート制限はバックオフして再試行
      await new Promise(r => setTimeout(r, 5000 * attempt));
      continue;
    }
    throw new Error(`API ${res.status}`);
  }
};
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const chunk = (arr, n) => Array.from({ length: Math.ceil(arr.length / n) }, (_, i) => arr.slice(i * n, i * n + n));
const stripHtml = (s) => (s || '').replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();

// --- 1. 記事の代表画像(サムネイル)を50件ずつ問い合わせ ---
const titleToCard = new Map(); // 記事名 → カード（normalize/redirect解決用に更新していく）
for (const c of targets) titleToCard.set(TITLE_OVERRIDES[c.id] || c.name, c);

const found = [];   // {card, thumbUrl, pageimage}
const misses = [];
for (const group of chunk([...titleToCard.keys()], 50)) {
  const data = await apiGet({
    action: 'query', redirects: 1,
    prop: 'pageimages', piprop: 'thumbnail|name', pithumbsize: THUMB_SIZE,
    titles: group.join('|'),
  });
  // タイトル正規化・リダイレクトの追跡
  for (const m of [...(data.query.normalized || []), ...(data.query.redirects || [])]) {
    const card = titleToCard.get(m.from);
    if (card) { titleToCard.delete(m.from); titleToCard.set(m.to, card); }
  }
  for (const page of Object.values(data.query.pages)) {
    const card = titleToCard.get(page.title);
    if (!card) continue;
    if (page.missing !== undefined || !page.thumbnail) {
      misses.push(`${card.id} ${card.name} → 記事「${page.title}」${page.missing !== undefined ? 'なし' : 'に画像なし'}`);
      continue;
    }
    found.push({ card, thumbUrl: page.thumbnail.source, pageimage: page.pageimage, articleTitle: page.title });
  }
  await sleep(500);
}
console.log(`画像あり: ${found.length} / 見つからず: ${misses.length}`);

// --- 2. 画像ファイルのライセンス情報を取得 ---
const licenseByFile = new Map();
for (const group of chunk([...new Set(found.map(f => 'File:' + f.pageimage))], 50)) {
  const data = await apiGet({
    action: 'query', prop: 'imageinfo', iiprop: 'extmetadata|url',
    titles: group.join('|'),
  });
  for (const page of Object.values(data.query.pages)) {
    const info = page.imageinfo?.[0];
    if (!info) continue;
    const meta = info.extmetadata || {};
    // 接頭辞はAPI側で「ファイル:」に正規化されて返る
    licenseByFile.set(page.title.replace(/^(File|ファイル):/, '').replace(/ /g, '_'), {
      license: stripHtml(meta.LicenseShortName?.value) || '不明',
      artist: stripHtml(meta.Artist?.value) || '不明',
      url: info.descriptionurl || '',
    });
  }
  await sleep(500);
}

// --- 3. サムネイルをダウンロード（レート制限対策で直列・リトライ付き） ---
const records = [];
let done = 0;
for (const { card, thumbUrl, pageimage, articleTitle } of found) {
  const ext = (thumbUrl.match(/\.(jpe?g|png|gif|webp)(?:[?#]|$)/i)?.[1] || 'jpg').toLowerCase().replace('jpeg', 'jpg');
  const file = `images/${card.id}.${ext}`;
  const lic = licenseByFile.get(pageimage.replace(/ /g, '_')) || { license: '不明', artist: '不明', url: '' };
  const record = { card_id: card.id, file, article: articleTitle, license: lic.license, artist: lic.artist, source_url: lic.url };

  if (existsSync(path.join(ROOT, file))) {   // 取得済みはスキップ（再実行に強く）
    records.push(record); done++;
    continue;
  }
  let ok = false;
  for (let attempt = 1; attempt <= 4; attempt++) {
    const res = await fetch(thumbUrl, { headers: { 'User-Agent': UA } });
    if (res.ok) {
      writeFileSync(path.join(ROOT, file), Buffer.from(await res.arrayBuffer()));
      ok = true;
      break;
    }
    if (res.status === 429) await sleep(4000 * attempt);  // 制限中はバックオフして再試行
    else { misses.push(`${card.id} ${card.name} → DL失敗 ${res.status}`); break; }
  }
  if (ok) { records.push(record); done++; }
  else if (!misses.some(m => m.startsWith(card.id))) misses.push(`${card.id} ${card.name} → DL失敗 429(リトライ上限)`);
  process.stdout.write(`\rダウンロード ${done}/${found.length}`);
  await sleep(400);
}
console.log('');

// --- 4. 画像マスタCSVを書き出し（既存分とマージ） ---
const csvPath = path.join(ROOT, 'data/card_image.csv');
const merged = new Map();
if (existsSync(csvPath)) {
  for (const r of parseCSV(readFileSync(csvPath, 'utf8'))) merged.set(r.card_id, r);
}
for (const r of records) merged.set(r.card_id, r);
const esc = v => /[",\n]/.test(v) ? `"${String(v).replace(/"/g, '""')}"` : v;
const header = ['card_id', 'file', 'article', 'license', 'artist', 'source_url'];
const rows = [...merged.values()].sort((a, b) => a.card_id.localeCompare(b.card_id));
writeFileSync(csvPath,
  [header.join(','), ...rows.map(r => header.map(h => esc(r[h] ?? '')).join(','))].join('\n') + '\n', 'utf8');

console.log(`card_image.csv: ${rows.length}件`);
if (misses.length) console.log('\n【要確認（TITLE_OVERRIDESに追記して再実行）】\n' + misses.join('\n'));
