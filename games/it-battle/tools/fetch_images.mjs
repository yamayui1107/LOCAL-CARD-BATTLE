// Wikipediaの代表画像を一括取得してカード画像にするツール（IT用語版）
//   cd games/it-battle && node tools/fetch_images.mjs               → SSR/URのみ
//   cd games/it-battle && node tools/fetch_images.mjs --rarity=all  → 全カード
// 出力: images/<card_id>.<ext> と data/card_image.csv（出典・ライセンス記録）
//
// 地域版との違い:
//  - ja.wikipediaに代表画像が無いカードは、jaの言語間リンク→en.wikipediaでも探す
//    （ITトピックのロゴ・図版はenの方が充実している）
//  - Wikimedia Commonsにホストされた画像だけを採用する
//    （en独自アップロードのフェアユース画像＝非フリーを混入させないため）
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { parseCSV } from '../../../engine/js/csvparse.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const UA = 'it-terms-card-game/0.1 (personal hobby project; contact: local)';
const THUMB_SIZE = 640;

// ja.wikipediaの記事名がカード名と異なる場合の上書き（card_id → 記事名）
const JA_OVERRIDES = {
};

// ja側で記事も言語間リンクも見つからない場合に使うen記事名（card_id → 記事名）
const EN_OVERRIDES = {
};

const rarityArg = (process.argv.find(a => a.startsWith('--rarity=')) || '--rarity=SSR,UR').split('=')[1];
const targetRarities = rarityArg === 'all' ? null : new Set(rarityArg.split(','));

const master = parseCSV(readFileSync(path.join(ROOT, 'data/card_master.csv'), 'utf8'));
const targets = master.filter(c => !targetRarities || targetRarities.has(c.rarity));
console.log(`対象: ${targets.length}枚 (${rarityArg})`);

mkdirSync(path.join(ROOT, 'images'), { recursive: true });

const apiGet = async (host, params) => {
  const url = `https://${host}/w/api.php?` + new URLSearchParams({ format: 'json', ...params });
  for (let attempt = 1; ; attempt++) {
    const res = await fetch(url, { headers: { 'User-Agent': UA } });
    if (res.ok) return res.json();
    if (res.status === 429 && attempt < 6) { await sleep(5000 * attempt); continue; }
    throw new Error(`API ${res.status}`);
  }
};
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const chunk = (arr, n) => Array.from({ length: Math.ceil(arr.length / n) }, (_, i) => arr.slice(i * n, i * n + n));
const stripHtml = (s) => (s || '').replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();

/** 指定wikiで記事群の代表画像を引く。戻り値 {found:[{card,thumbUrl,pageimage,articleTitle}], noImage:[card], noArticle:[card]} */
async function pageImages(host, titleToCard) {
  const found = [], noImage = [], noArticle = [];
  for (const group of chunk([...titleToCard.keys()], 50)) {
    const data = await apiGet(host, {
      action: 'query', redirects: 1,
      prop: 'pageimages', piprop: 'thumbnail|name', pithumbsize: THUMB_SIZE,
      titles: group.join('|'),
    });
    for (const m of [...(data.query.normalized || []), ...(data.query.redirects || [])]) {
      const card = titleToCard.get(m.from);
      if (card) { titleToCard.delete(m.from); titleToCard.set(m.to, card); }
    }
    for (const page of Object.values(data.query.pages)) {
      const card = titleToCard.get(page.title);
      if (!card) continue;
      if (page.missing !== undefined) noArticle.push({ card, title: page.title });
      else if (!page.thumbnail) noImage.push({ card, title: page.title });
      else found.push({ card, thumbUrl: page.thumbnail.source, pageimage: page.pageimage, articleTitle: `${host === 'ja.wikipedia.org' ? '' : 'en:'}${page.title}` });
    }
    await sleep(500);
  }
  return { found, noImage, noArticle };
}

// --- 1. ja.wikipediaで探す ---
const jaMap = new Map();
for (const c of targets) jaMap.set(JA_OVERRIDES[c.id] || c.name, c);
const ja = await pageImages('ja.wikipedia.org', jaMap);
console.log(`ja: 画像あり${ja.found.length} / 記事はあるが画像なし${ja.noImage.length} / 記事なし${ja.noArticle.length}`);

// --- 2. jaに画像が無かった分: 言語間リンクでen記事名を引く ---
const enTitleToCard = new Map();
for (const group of chunk(ja.noImage, 50)) {
  const data = await apiGet('ja.wikipedia.org', {
    action: 'query', redirects: 1, prop: 'langlinks', lllang: 'en', lllimit: 'max',
    titles: group.map(x => x.title).join('|'),
  });
  const cardByTitle = new Map(group.map(x => [x.title, x.card]));
  for (const page of Object.values(data.query.pages)) {
    const card = cardByTitle.get(page.title);
    const en = page.langlinks?.[0]?.['*'];
    if (card && en) enTitleToCard.set(en, card);
  }
  await sleep(500);
}
// ja記事すら無かった分: EN_OVERRIDES または名前がASCIIならそのままen照会
for (const { card } of ja.noArticle) {
  const t = EN_OVERRIDES[card.id] || (/^[\x20-\x7e]+$/.test(card.name) ? card.name : null);
  if (t) enTitleToCard.set(t, card);
}

// --- 3. en.wikipediaで探す ---
const en = enTitleToCard.size ? await pageImages('en.wikipedia.org', enTitleToCard) : { found: [], noImage: [], noArticle: [] };
console.log(`en: 画像あり${en.found.length}（照会${enTitleToCard.size}件）`);

const found = [...ja.found, ...en.found];
const misses = [
  ...en.noImage.map(x => `${x.card.id} ${x.card.name} → en「${x.title}」に画像なし`),
  ...en.noArticle.map(x => `${x.card.id} ${x.card.name} → en記事「${x.title}」なし`),
  ...ja.noArticle.filter(({ card }) => !EN_OVERRIDES[card.id] && !/^[\x20-\x7e]+$/.test(card.name))
    .map(({ card, title }) => `${card.id} ${card.name} → ja記事「${title}」なし（EN_OVERRIDES候補）`),
  ...ja.noImage.filter(x => ![...enTitleToCard.values()].includes(x.card))
    .map(x => `${x.card.id} ${x.card.name} → ja画像なし・enリンクなし`),
];

// --- 4. Commonsホストの確認とライセンス取得（非Commons＝非フリーの可能性が高いので除外） ---
const licenseByFile = new Map();
for (const group of chunk([...new Set(found.map(f => 'File:' + f.pageimage))], 50)) {
  const data = await apiGet('commons.wikimedia.org', {
    action: 'query', prop: 'imageinfo', iiprop: 'extmetadata|url', titles: group.join('|'),
  });
  for (const page of Object.values(data.query.pages)) {
    const info = page.imageinfo?.[0];
    if (!info) continue;   // Commonsに無い＝ローカル(非フリー)画像 → 採用しない
    const meta = info.extmetadata || {};
    licenseByFile.set(page.title.replace(/^(File|ファイル):/, '').replace(/ /g, '_'), {
      license: stripHtml(meta.LicenseShortName?.value) || '不明',
      artist: stripHtml(meta.Artist?.value) || '不明',
      url: info.descriptionurl || '',
    });
  }
  await sleep(500);
}

// --- 5. ダウンロード（Commonsに無いものはここで弾く） ---
const records = [];
let done = 0, dropped = 0;
for (const { card, thumbUrl, pageimage, articleTitle } of found) {
  const lic = licenseByFile.get(pageimage.replace(/ /g, '_'));
  if (!lic) { dropped++; misses.push(`${card.id} ${card.name} → 非Commons画像のため除外（${pageimage}）`); continue; }
  const ext = (thumbUrl.match(/\.(jpe?g|png|gif|webp)(?:[?#]|$)/i)?.[1] || 'jpg').toLowerCase().replace('jpeg', 'jpg');
  const file = `images/${card.id}.${ext}`;
  const record = { card_id: card.id, file, article: articleTitle, license: lic.license, artist: lic.artist, source_url: lic.url };

  if (existsSync(path.join(ROOT, file))) { records.push(record); done++; continue; }
  let ok = false;
  for (let attempt = 1; attempt <= 4; attempt++) {
    const res = await fetch(thumbUrl, { headers: { 'User-Agent': UA } });
    if (res.ok) {
      writeFileSync(path.join(ROOT, file), Buffer.from(await res.arrayBuffer()));
      ok = true;
      break;
    }
    if (res.status === 429) await sleep(4000 * attempt);
    else { misses.push(`${card.id} ${card.name} → DL失敗 ${res.status}`); break; }
  }
  if (ok) { records.push(record); done++; }
  process.stdout.write(`\rダウンロード ${done}/${found.length}`);
  await sleep(400);
}
console.log(`\nCommons外で除外: ${dropped}件`);

// --- 6. 画像マスタCSVを書き出し（既存分とマージ） ---
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
if (misses.length) console.log(`\n【画像なし ${misses.length}件（必要ならJA/EN_OVERRIDESに追記して再実行）】\n` + misses.join('\n'));
