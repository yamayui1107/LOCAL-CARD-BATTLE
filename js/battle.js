// 対戦ロジック（一発勝負方式・純粋関数のみ）
export const DECK_SIZE = 5;

/**
 * デッキ分析: 発動シナジー・カードごとの倍率・総合戦闘力を求める。
 * 戦闘力 = Σ(攻撃 × シナジー倍率) + Σ防御 × 0.4
 * シナジーは「そのカードがタグを持つ発動中シナジー」が全て乗算でスタックする。
 * タグ密集カードで倍率を盛りまくるのが正義（青天井仕様）。
 */
export function analyzeDeck(deck, synergies) {
  const active = [];
  for (const sy of synergies) {
    const matched = deck.filter(c => c.tags.includes(sy.tag)).length;
    if (matched >= sy.count) active.push({ ...sy, matched });
  }
  const cards = deck.map(card => {
    let mult = 1, via = null;
    for (const a of active) {
      if (card.tags.includes(a.tag)) {
        mult *= a.multiplier;
        if (!via || a.multiplier > via.multiplier) via = a;
      }
    }
    mult = Math.round(mult * 100) / 100;
    return { card, mult, via, power: Math.round(card.attack * mult) };
  });
  const atk = cards.reduce((s, c) => s + c.power, 0);
  const def = Math.round(deck.reduce((s, c) => s + c.defense, 0) * 0.4);
  // あと1枚で発動するシナジー（編成のリーチ表示用）
  const nearMiss = synergies
    .map(sy => ({ sy, n: deck.filter(c => c.tags.includes(sy.tag)).length }))
    .filter(x => x.n > 0 && x.n === x.sy.count - 1)
    .map(x => x.sy);
  return { cards, active, atk, def, total: atk + def, nearMiss };
}

/** 一発勝負の解決。winner: 'p' | 'c' | null */
export function resolveBattle(pAnalysis, cAnalysis) {
  const margin = pAnalysis.total - cAnalysis.total;
  const winner = margin > 0 ? 'p' : margin < 0 ? 'c' : null;
  const loserTotal = Math.max(1, Math.min(pAnalysis.total, cAnalysis.total));
  const ratio = Math.abs(margin) / loserTotal;
  const tier = ratio >= 0.18 ? '圧勝' : ratio >= 0.06 ? '快勝' : '辛勝';
  return { winner, margin, tier };
}

// プレイヤー目標勝率: CPUデッキ選定で「わずかに弱い候補」を選ぶ確率
const PLAYER_WIN_RATE = 0.58;

/**
 * CPUデッキ生成: 多様な候補を作り、プレイヤーの戦闘力に肉薄する候補を選ぶ。
 * 58%の確率で「僅差で下回る」候補、42%で「僅差で上回る」候補を採用するので、
 * 毎回接戦になりつつ長期勝率はプレイヤー有利に収束する。
 */
export function buildCpuDeck(allCards, playerDeck, synergies, rand = Math.random) {
  const target = analyzeDeck(playerDeck, synergies).total;
  const tags = [...new Set(allCards.flatMap(c => c.tags))];
  const candidates = [];
  for (let i = 0; i < 10; i++) {
    candidates.push(sample(allCards, DECK_SIZE, rand));               // ランダム（弱め）
    const tag = tags[Math.floor(rand() * tags.length)];
    const themed = allCards.filter(c => c.tags.includes(tag));
    if (themed.length >= DECK_SIZE) {
      candidates.push(sample(themed, DECK_SIZE, rand));               // テーマデッキ
      candidates.push([...themed].sort((x, y) => y.attack - x.attack).slice(0, DECK_SIZE)); // テーマ最強
    }
    candidates.push(autoBuildDeck(sample(allCards, 30, rand), synergies)); // 中堅の最適化編成
  }
  // 高火力帯の候補（シナジー盛りデッキに追随するため大きめの持ち札で最適化）
  for (let i = 0; i < 4; i++) {
    candidates.push(autoBuildDeck(sample(allCards, 120, rand), synergies));
  }
  // ミラー候補: プレイヤーデッキの各カードを「同タグの別カード」に置換したライバルデッキ。
  // シナジー構造ごと似るため、どんな高火力デッキにも僅差の対抗馬を用意できる
  for (let i = 0; i < 12; i++) {
    const deck = [];
    for (const orig of playerDeck) {
      let pick = orig;
      if (rand() < 0.45) {
        const alts = allCards
          .filter(c => c !== orig && !deck.includes(c) && c.tags.some(t => orig.tags.includes(t)))
          .sort((a, b) => b.attack - a.attack)
          .slice(0, 20);
        if (alts.length) pick = alts[Math.floor(rand() * alts.length)];
      }
      if (deck.includes(pick)) pick = orig;
      if (deck.includes(pick)) continue;
      deck.push(pick);
    }
    if (deck.length === DECK_SIZE) candidates.push(deck);
  }
  const scored = candidates.map(d => ({ d, power: analyzeDeck(d, synergies).total }));
  // 完全同値は引き分けにしかならないので避ける（他候補がない場合のみ許容）
  const below = scored.filter(x => x.power < target).sort((a, b) => b.power - a.power);
  const above = scored.filter(x => x.power > target).sort((a, b) => a.power - b.power);
  const pick = (rand() < PLAYER_WIN_RATE ? (below[0] || above[0]) : (above[0] || below[0])) || scored[0];
  return pick.d;
}

/**
 * おまかせ編成: シナジー込み戦闘力を直接最大化する。
 * 攻撃力上位をシードに、1枚入れ替えで戦闘力が上がる限り交換を繰り返す山登り法。
 */
export function autoBuildDeck(ownedCards, synergies) {
  const pool = [...new Set(ownedCards)];
  if (pool.length <= DECK_SIZE) return pool.slice(0, DECK_SIZE);
  let deck = [...pool].sort((a, b) => b.attack - a.attack).slice(0, DECK_SIZE);
  let best = analyzeDeck(deck, synergies).total;
  for (let pass = 0; pass < 20; pass++) {
    let improved = false;
    for (let i = 0; i < DECK_SIZE; i++) {
      for (const cand of pool) {
        if (deck.includes(cand)) continue;
        const saved = deck[i];
        deck[i] = cand;
        const t = analyzeDeck(deck, synergies).total;
        if (t > best) { best = t; improved = true; }
        else deck[i] = saved;
      }
    }
    if (!improved) break;
  }
  return deck;
}

function sample(arr, n, rand) {
  const copy = [...arr];
  const out = [];
  for (let i = 0; i < n && copy.length; i++) {
    out.push(copy.splice(Math.floor(rand() * copy.length), 1)[0]);
  }
  return out;
}

/** 連勝数に応じたチケット報酬 */
export function rewardForStreak(streak) {
  if (streak === 3) return 1;
  if (streak === 5) return 2;
  if (streak >= 10 && streak % 10 === 0) return 3;
  return 0;
}
