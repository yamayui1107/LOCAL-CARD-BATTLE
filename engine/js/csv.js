import { GROUP } from './config.js';

import { parseCSV } from './csvparse.js';

export { parseCSV };

/**
 * 正規化された5つのCSVを読み込んでJOINし、ゲームで使うオブジェクトを組み立てる
 *   card_master.csv   : id,name,reading,type,<GROUP.csvField>,rarity
 *                       （グループ列の名前はconfig.jsのGROUP.csvFieldで指定。card.groupに入る）
 *   card_detail.csv   : card_id,attack,defense,description
 *   card_tag.csv      : card_id,tag
 *   tag_master.csv    : tag,description
 *   synergy_master.csv: id,name,tag,count,multiplier,description
 *   card_image.csv    : card_id,file,article,license,artist,source_url（任意。tools/fetch_images.mjsが生成）
 */
export async function loadAll() {
  const [masterText, detailText, cardTagText, tagText, synergyText, imageText, bossText] = await Promise.all([
    fetchText('data/card_master.csv'),
    fetchText('data/card_detail.csv'),
    fetchText('data/card_tag.csv'),
    fetchText('data/tag_master.csv'),
    fetchText('data/synergy_master.csv'),
    fetchText('data/card_image.csv').catch(() => ''),  // 画像マスタは無くてもよい
    fetchText('data/boss_master.csv').catch(() => ''), // ボスマスタも任意
  ]);

  const detailById = new Map(parseCSV(detailText).map(d => [d.card_id, d]));
  const tagsById = new Map();
  for (const r of parseCSV(cardTagText)) {
    if (!tagsById.has(r.card_id)) tagsById.set(r.card_id, []);
    tagsById.get(r.card_id).push(r.tag);
  }
  const tagMaster = new Map(parseCSV(tagText).map(t => [t.tag, t.description]));

  const warns = [];
  const cards = parseCSV(masterText).map(m => {
    const d = detailById.get(m.id);
    if (!d) warns.push(`card_detail.csv に ${m.id}(${m.name}) の行がありません`);
    const tags = tagsById.get(m.id) || [];
    for (const t of tags) {
      if (!tagMaster.has(t)) warns.push(`tag_master.csv に未定義のタグ「${t}」(${m.id} ${m.name})`);
    }
    return {
      id: m.id,
      name: m.name,
      reading: m.reading,
      type: m.type,             // config.jsのCARD_TYPESのキー
      group: m[GROUP.csvField],
      rarity: m.rarity,          // N R SR SSR UR
      attack: Number(d?.attack ?? 0),
      defense: Number(d?.defense ?? 0),
      tags,
      description: d?.description ?? '',
    };
  });

  const synergies = parseCSV(synergyText).map(r => {
    if (!tagMaster.has(r.tag)) warns.push(`tag_master.csv に未定義のタグ「${r.tag}」(シナジー ${r.name})`);
    return {
      id: r.id,
      name: r.name,
      tag: r.tag,
      count: Number(r.count),
      multiplier: Number(r.multiplier),
      description: r.description,
    };
  });

  const images = new Map(
    (imageText ? parseCSV(imageText) : []).map(r => [r.card_id, r]));

  const cardById = new Map(cards.map(c => [c.id, c]));
  const bosses = (bossText ? parseCSV(bossText) : []).map(r => ({
    order: Number(r.order),
    group: r[GROUP.bossCsvField],   // 撃破記録のキー（テーマのグループ値）
    name: r.name,
    deck: r.deck.split('|').map(id => cardById.get(id)).filter(Boolean),
    power: Number(r.power),
  })).sort((a, b) => a.order - b.order);

  if (warns.length) console.warn('[データ整合性警告]\n' + warns.join('\n'));

  return { cards, synergies, tagMaster, images, bosses };
}

async function fetchText(path) {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`${path} の読み込みに失敗しました (${res.status})`);
  return res.text();
}
