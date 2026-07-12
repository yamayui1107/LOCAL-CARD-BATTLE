// 分野制覇のボス10体（各分野の主）を生成して data/boss_master.csv に書き出す
//   cd games/it-battle && node tools/build_bosses.mjs
//
// 各分野のカードだけでデッキを組み、戦闘力が「全カード理論最強値」の約15%→90%の
// 幾何級数カーブに乗るように調整する。最後の数体はおまかせ編成では届かず、
// 手動でのシナジー研究が必要になる（地域版と同じ設計思想）
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseCSV } from '../../../engine/js/csvparse.js';
import { analyzeDeck, autoBuildDeck, DECK_SIZE } from '../../../engine/js/battle.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (f) => readFileSync(path.join(ROOT, 'data', f), 'utf8');

const detailById = new Map(parseCSV(read('card_detail.csv')).map(d => [d.card_id, d]));
const tagsById = new Map();
for (const r of parseCSV(read('card_tag.csv'))) {
  if (!tagsById.has(r.card_id)) tagsById.set(r.card_id, []);
  tagsById.get(r.card_id).push(r.tag);
}
const cards = parseCSV(read('card_master.csv')).map(m => ({
  id: m.id,
  name: m.name,
  field: m.field,
  attack: Number(detailById.get(m.id)?.attack ?? 0),
  defense: Number(detailById.get(m.id)?.defense ?? 0),
  tags: tagsById.get(m.id) || [],
}));
const synergies = parseCSV(read('synergy_master.csv')).map(r => ({
  tag: r.tag, count: Number(r.count), multiplier: Number(r.multiplier),
}));

const power = (deck) => analyzeDeck(deck, synergies).total;
const maxDeck = autoBuildDeck(cards, synergies);
const maxPower = power(maxDeck);
console.log(`理論最強値（山登り法）: ${maxPower.toLocaleString()}`);

// 分野ごとに強さの違う候補デッキ群を作る（強い方から: 全力 → 上位k枚抜き → 弱い5枚組）
function candidatesOf(pool) {
  const out = [];
  const push = (deck) => {
    if (deck.length === DECK_SIZE && new Set(deck).size === DECK_SIZE) out.push(deck);
  };
  const byAtk = [...pool].sort((a, b) => b.attack - a.attack);
  for (let k = 0; k <= Math.min(20, pool.length - DECK_SIZE); k++) {
    push(autoBuildDeck(byAtk.slice(k), synergies));
  }
  for (let j = 0; j + DECK_SIZE <= pool.length; j += 3) {
    push(byAtk.slice(j, j + DECK_SIZE));   // シナジー最適化なしの素朴なデッキ（弱め候補）
  }
  return out;
}

/**
 * 目標戦闘力にいちばん近いデッキを作る。
 * 候補群から最も近いものを種にして、1枚入れ替えで|戦闘力-目標|を縮める山登り。
 * （最強化ではなく目標追従。序盤ボスを「ちょうどよく弱く」するために必要）
 */
function fitToTarget(pool, target, seeds) {
  const diffOf = (d) => Math.abs(power(d) - target);
  let deck = [...seeds.reduce((b, c) => diffOf(c) < diffOf(b) ? c : b)];
  let best = diffOf(deck);
  for (let pass = 0; pass < 12; pass++) {
    let improved = false;
    for (let i = 0; i < DECK_SIZE; i++) {
      for (const cand of pool) {
        if (deck.includes(cand)) continue;
        const saved = deck[i];
        deck[i] = cand;
        const diff = diffOf(deck);
        if (diff < best) { best = diff; improved = true; }
        else deck[i] = saved;
      }
    }
    if (!improved) break;
  }
  return deck;
}

const fields = [...new Set(cards.map(c => c.field))];
const fieldInfo = fields.map(field => {
  const pool = cards.filter(c => c.field === field);
  return { field, pool, best: power(autoBuildDeck(pool, synergies)) };
}).sort((a, b) => a.best - b.best);   // 弱い分野から順に登場させる

// 各分野3段階（門番→番人→主）= 30体。
// 目標カーブ: 絶対値20,000 → maxPowerの90% の幾何級数
// （下限を割合でなく絶対値にするのは、シナジー追加で理論値が伸びても初戦の難度を変えないため）
const TIERS = [
  { name: '門番', cap: 0.30 },   // capは「その分野の全力」に対する上限割合。段階同士が同じデッキに収束するのを防ぐ
  { name: '番人', cap: 0.65 },
  { name: '主', cap: 0.97 },
];
const slots = [];
for (const tier of TIERS) for (const info of fieldInfo) slots.push({ info, tier });
const n = slots.length;
const LO_ABS = 20000, HI = 0.90;
let bosses = slots.map(({ info, tier }, i) => {
  const target = Math.min(LO_ABS * Math.pow(maxPower * HI / LO_ABS, i / (n - 1)), info.best * tier.cap);
  const deck = fitToTarget(info.pool, target, candidatesOf(info.pool));
  return { field: info.field, deck, power: power(deck), target };
});
// 分野内は弱い順に 門番→番人→主 と命名し、全体を戦闘力昇順に並べる
for (const { field } of fieldInfo) {
  const mine = bosses.filter(b => b.field === field).sort((a, b) => a.power - b.power);
  mine.forEach((b, t) => {
    b.tier = TIERS[t].name;
    b.name = `${field}の${TIERS[t].name}`;
    b.key = `${field}/${TIERS[t].name}`;   // 撃破記録のキー（分野内で段階ごとに一意）
  });
}
bosses.sort((a, b) => a.power - b.power);

// 真のラスボス「シンギュラリティ」: 分野の縛りなし・全カードから理論最強値の90%に合わせて編成。
// 分野縛りのボスでは理論値の4割程度が上限になるため、最後だけ本気の相手を置く
{
  const target = maxPower * HI;
  const deck = fitToTarget(cards, target, [maxDeck]);
  bosses.push({ field: 'シンギュラリティ', key: 'シンギュラリティ', name: 'シンギュラリティ', deck, power: power(deck), target });
}

const lines = ['order,field,name,deck,power'];
bosses.forEach((b, i) => {
  lines.push(`${i + 1},${b.key},${b.name},${b.deck.map(c => c.id).join('|')},${b.power}`);
  console.log(`${String(i + 1).padStart(2)}. ${b.name.padEnd(16, '　')} 戦闘力 ${b.power.toLocaleString().padStart(11)}（目標 ${Math.round(b.target).toLocaleString()}）`);
});
writeFileSync(path.join(ROOT, 'data', 'boss_master.csv'), lines.join('\n') + '\n');

const last = bosses[bosses.length - 1];
if (last.power >= maxPower) throw new Error('最終ボスが理論最強値以上（勝てない）');
for (let i = 1; i < bosses.length; i++) if (bosses[i].power <= bosses[i - 1].power) {
  console.warn(`注意: ${i + 1}体目 ${bosses[i].name} が直前と同値以下（${bosses[i].power}）`);
}
console.log(`\ndata/boss_master.csv に${bosses.length}体を書き出しました（最終ボスは理論最強値の${Math.round(last.power / maxPower * 100)}%）`);
