// 全国制覇モードのボス47体を生成する
//   node tools/build_bosses.mjs
// 北海道→沖縄（JISコード順）の順に戦闘力が幾何級数で上がる固定デッキを探索し、
// data/boss_master.csv に書き出す。
import { readFileSync, writeFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { parseCSV } from '../../../engine/js/csvparse.js';
import { analyzeDeck, DECK_SIZE } from '../../../engine/js/battle.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = f => parseCSV(readFileSync(path.join(ROOT, 'data', f), 'utf8'));

const detail = new Map(read('card_detail.csv').map(d => [d.card_id, d]));
const tagsBy = new Map();
read('card_tag.csv').forEach(r => { if (!tagsBy.has(r.card_id)) tagsBy.set(r.card_id, []); tagsBy.get(r.card_id).push(r.tag); });
const cards = read('card_master.csv').map(m => ({
  ...m, attack: +detail.get(m.id).attack, defense: +detail.get(m.id).defense, tags: tagsBy.get(m.id) || [],
}));
const synergies = read('synergy_master.csv').map(r => ({ ...r, count: +r.count, multiplier: +r.multiplier }));

const PREFS = ['北海道','青森県','岩手県','宮城県','秋田県','山形県','福島県','茨城県','栃木県','群馬県','埼玉県','千葉県','東京都','神奈川県','新潟県','富山県','石川県','福井県','山梨県','長野県','岐阜県','静岡県','愛知県','三重県','滋賀県','京都府','大阪府','兵庫県','奈良県','和歌山県','鳥取県','島根県','岡山県','広島県','山口県','徳島県','香川県','愛媛県','高知県','福岡県','佐賀県','長崎県','熊本県','大分県','宮崎県','鹿児島県','沖縄県'];

// 難易度カーブ: 最初の主12,000 → 最終ボス約70,000,000。
// 理論値(96,820,446)の近傍は五大都市デッキ(71.3M〜96.8M)しか存在しない「谷」なので、
// 実在するデッキ分布に合わせて70Mを目標にする（全所持おまかせ編成は約15.7Mで届かない。
// 理論値・おまかせ上限は tools/analyze_synergy.mjs で実測できる）
const T_MIN = 12000, T_MAX = 70000000;
const target = i => Math.round(T_MIN * Math.pow(T_MAX / T_MIN, i / 46));

const power = deck => analyzeDeck(deck, synergies).total;

// 理論最強級デッキ（高目標ボスの探索の種にする）: 複数シードの山登りで求める
function findApexDeck() {
  const seeds = [
    [...cards].sort((a, b) => b.attack - a.attack).slice(0, DECK_SIZE),
    [...cards].sort((a, b) => b.tags.length - a.tags.length).slice(0, DECK_SIZE),
  ];
  for (const tag of ['城下町', '世界遺産', '古都', '島']) {
    const t = cards.filter(c => c.tags.includes(tag)).sort((a, b) => b.attack - a.attack).slice(0, DECK_SIZE);
    if (t.length === DECK_SIZE) seeds.push(t);
  }
  let bestDeck = seeds[0], bestP = 0;
  for (const seed of seeds) {
    let deck = [...seed], p = power(deck);
    for (let pass = 0; pass < 25; pass++) {
      let improved = false;
      for (let i = 0; i < DECK_SIZE; i++) {
        for (const cand of cards) {
          if (deck.includes(cand)) continue;
          const saved = deck[i];
          deck[i] = cand;
          const t = power(deck);
          if (t > p) { p = t; improved = true; } else deck[i] = saved;
        }
      }
      if (!improved) break;
    }
    if (p > bestP) { bestP = p; bestDeck = deck; }
  }
  return bestDeck;
}
const APEX = findApexDeck();
console.log(`理論最強級デッキ: ${power(APEX).toLocaleString()} [${APEX.map(c => c.name).join(' ')}]`);

// ボスが理論値ちょうど（＝絶対に勝てない）にならないよう、全ボスに上限を設ける
const P_CAP = Math.round(power(APEX) * 0.93);

// 高目標の微調整用: タグを多く持つ精鋭カード（大都市など）は常に交換候補に入れる
const ELITES = cards.filter(c => c.tags.length >= 5);

// |戦闘力-目標| を最小化する山登り。序盤ボスは地元カード主体、
// 高目標は最強デッキを種にして目標まで「下る」（上りの探索では特定カードにたどり着けない）
function buildBossDeck(pref, T, rand = Math.random) {
  const local = cards.filter(c => c.prefecture === pref);
  let best = null, bestDiff = Infinity;
  for (let trial = 0; trial < 6; trial++) {
    let deck;
    if (T > 300000 && trial < 3) {
      deck = [...APEX];   // 高目標: 最強デッキから目標へ下る
    } else {
      deck = [...local].sort(() => rand() - .5).slice(0, DECK_SIZE);
    }
    while (deck.length < DECK_SIZE) deck.push(cards[Math.floor(rand() * cards.length)]);
    // 上限超過は「勝てないボス」なので目標との差を無限大扱いにして弾く
    const score = d => { const p = power(d); return p > P_CAP ? Infinity : Math.abs(p - T); };
    let diff = score(deck);
    for (let pass = 0; pass < 25 && diff > T * 0.015; pass++) {
      let improved = false;
      // 交換候補: 地元カード全部 + 多タグ精鋭 + 全国からのサンプル（高目標ほど全国の精鋭が必要）
      const pool = [...local, ...ELITES, ...[...cards].sort(() => rand() - .5).slice(0, 350)];
      for (let i = 0; i < DECK_SIZE; i++) {
        for (const cand of pool) {
          if (deck.includes(cand)) continue;
          const saved = deck[i];
          deck[i] = cand;
          const d = score(deck);
          if (d < diff) { diff = d; improved = true; } else deck[i] = saved;
        }
      }
      if (!improved) break;
    }
    if (diff < bestDiff) { bestDiff = diff; best = [...deck]; }
    if (bestDiff <= T * 0.015) break;
  }
  return best;
}

const esc = v => /[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v);
const rows = [['order', 'pref', 'name', 'deck', 'power']];
for (let i = 0; i < PREFS.length; i++) {
  const pref = PREFS[i];
  const T = target(i);
  const deck = buildBossDeck(pref, T);
  const p = power(deck);
  rows.push([i + 1, pref, `${pref.replace(/[都府県]$/, '')}の主`, deck.map(c => c.id).join('|'), p]);
  const localCount = deck.filter(c => c.prefecture === pref).length;
  console.log(`${String(i + 1).padStart(2)} ${pref}の主  目標${T.toLocaleString()} → 実際${p.toLocaleString()} (誤差${((p - T) / T * 100).toFixed(1)}% 地元${localCount}枚) [${deck.map(c => c.name).join(' ')}]`);
}
writeFileSync(path.join(ROOT, 'data/boss_master.csv'),
  rows.map(r => r.map(esc).join(',')).join('\n') + '\n', 'utf8');
console.log('boss_master.csv 書き出し完了');
