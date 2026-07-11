// ガチャ抽選ロジック
export const RARITY_ORDER = ['N', 'R', 'SR', 'SSR', 'UR'];

// レアリティの排出率（%）。カード枚数に左右されないよう先にレアリティを抽選する
// 高レアは絞りめ。代わりに通算25枚（=5パック）ごとにSR以上確定（drawPack参照）
export const RARITY_RATE = { N: 59, R: 28, SR: 10, SSR: 2.4, UR: 0.6 };
export const SR_GUARANTEE_EVERY = 25;

// 地元都道府県のカードは同レアリティ内での選出重みアップ（地元確変）
const HOME_BOOST = 2.5;

export function rarityIndex(r) {
  return RARITY_ORDER.indexOf(r);
}

// minRarity以上に正規化してレアリティを1つ抽選
function drawRarity(minRarity = 0) {
  const entries = RARITY_ORDER.slice(minRarity).map(r => [r, RARITY_RATE[r]]);
  const total = entries.reduce((s, [, w]) => s + w, 0);
  let roll = Math.random() * total;
  for (const [r, w] of entries) {
    roll -= w;
    if (roll <= 0) return r;
  }
  return entries[entries.length - 1][0];
}

// 指定レアリティの中から1枚選ぶ（地元カードは重み2.5倍）
function drawCardOf(cards, rarity, homePref) {
  const pool = cards.filter(c => c.rarity === rarity);
  let total = 0;
  const weights = pool.map(c => {
    const w = (homePref && c.prefecture === homePref) ? HOME_BOOST : 1;
    total += w;
    return w;
  });
  let roll = Math.random() * total;
  for (let i = 0; i < pool.length; i++) {
    roll -= weights[i];
    if (roll <= 0) return pool[i];
  }
  return pool[pool.length - 1];
}

function drawOne(cards, homePref, minRarity = 0) {
  return drawCardOf(cards, drawRarity(minRarity), homePref);
}

/**
 * 1パック（5枚）を引く
 * - 通算SR_GUARANTEE_EVERY枚(10枚)ごとの1枚はSR以上確定
 * - パック最後の1枚はR以上確定
 * - pityGuarantee=true なら1枚SSR以上確定（天井）
 * totalDrawsStart: これまでの通算ドロー枚数（確定周期の判定に使う）
 */
export function drawPack(cards, homePref, pityGuarantee, totalDrawsStart = 0) {
  const pack = [];
  for (let i = 0; i < 5; i++) {
    const globalN = totalDrawsStart + i + 1;
    let minRarity = 0;
    if (globalN % SR_GUARANTEE_EVERY === 0) minRarity = rarityIndex('SR');
    else if (i === 4) minRarity = rarityIndex('R');
    pack.push(drawOne(cards, homePref, minRarity));
  }

  if (pityGuarantee && !pack.some(c => rarityIndex(c.rarity) >= rarityIndex('SSR'))) {
    pack[4] = drawOne(cards, homePref, rarityIndex('SSR'));
  }

  // 開封演出が盛り上がるようにレア昇順で並べる（最高レアが最後）
  pack.sort((a, b) => rarityIndex(a.rarity) - rarityIndex(b.rarity) || Math.random() - 0.5);
  return pack;
}

export function hasSSRorAbove(pack) {
  return pack.some(c => rarityIndex(c.rarity) >= rarityIndex('SSR'));
}
