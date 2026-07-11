// シナジー設計用の分析: タグごとの枚数・攻撃上位、理論最強デッキ、おまかせ上限を実測する
//   node tools/analyze_synergy.mjs
import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { parseCSV } from '../js/csv.js';
import { analyzeDeck, DECK_SIZE } from '../js/battle.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = f => parseCSV(readFileSync(path.join(ROOT, 'data', f), 'utf8'));

const detail = new Map(read('card_detail.csv').map(d => [d.card_id, d]));
const tagsBy = new Map();
read('card_tag.csv').forEach(r => { if (!tagsBy.has(r.card_id)) tagsBy.set(r.card_id, []); tagsBy.get(r.card_id).push(r.tag); });
const cards = read('card_master.csv').map(m => ({
  ...m, attack: +detail.get(m.id).attack, defense: +detail.get(m.id).defense, tags: tagsBy.get(m.id) || [],
}));
const synergies = read('synergy_master.csv').map(r => ({ ...r, count: +r.count, multiplier: +r.multiplier }));

// タグごとの枚数と攻撃上位5枚
const byTag = new Map();
for (const c of cards) for (const t of c.tags) {
  if (!byTag.has(t)) byTag.set(t, []);
  byTag.get(t).push(c);
}
console.log('=== タグ別 枚数 / 攻撃上位5枚の合計攻 / 上位5枚 ===');
for (const [tag, list] of [...byTag.entries()].sort((a, b) => b[1].length - a[1].length)) {
  const top = [...list].sort((a, b) => b.attack - a.attack).slice(0, 5);
  const sum = top.reduce((s, c) => s + c.attack, 0);
  console.log(`${tag}\t${list.length}枚\t上位攻計${sum.toLocaleString()}\t${top.map(c => `${c.name}(${c.attack})`).join(' ')}`);
}

const power = deck => analyzeDeck(deck, synergies).total;

// 理論最強デッキ（build_bosses.mjsと同じ山登り）
function findApexDeck() {
  const seeds = [
    [...cards].sort((a, b) => b.attack - a.attack).slice(0, DECK_SIZE),
    [...cards].sort((a, b) => b.tags.length - a.tags.length).slice(0, DECK_SIZE),
  ];
  for (const [tag, list] of byTag.entries()) {
    if (list.length < DECK_SIZE) continue;
    seeds.push([...list].sort((a, b) => b.attack - a.attack).slice(0, DECK_SIZE));
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
const a = analyzeDeck(APEX, synergies);
console.log(`\n=== 理論最強デッキ: ${a.total.toLocaleString()} ===`);
for (const c of a.cards) console.log(`  ${c.card.name} 攻${c.card.attack.toLocaleString()} ×${c.mult} = ${c.power.toLocaleString()}  tags=[${c.card.tags.join(',')}]`);
console.log(`  発動シナジー: ${a.active.map(s => `${s.name}×${s.multiplier}`).join(' / ')}`);

// 全カード所持時に「おまかせ編成」が到達する戦闘力（ゲーム内の自動編成の上限）
const { autoBuildDeck } = await import('../js/battle.js');
const auto = autoBuildDeck(cards, synergies);
console.log(`\nおまかせ編成の上限: ${power(auto).toLocaleString()} [${auto.map(c => c.name).join(' ')}]`);
