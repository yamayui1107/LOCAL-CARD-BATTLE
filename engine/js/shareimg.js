// シェア用画像の生成（Canvas自前合成・外部ライブラリなし）
// 開封結果・デッキ・対戦（両者のデッキ並び）を1200x630のPNGにする
import { GAME } from './config.js';

const W = 1200, H = 630;

/**
 * spec: {
 *   title: 'WIN！',                 // 金色の大見出し
 *   sub: '戦闘力 96,820,446 …',     // 白の小見出し（省略可）
 *   rows: [{ label, labelColor, dim, cards: [{name,rarity,attack,defense,artSrc}] }],  // 1行=カード最大5枚
 *   footer: 'コード …',             // 下端の1行（省略時はゲーム名）
 * }
 * 戻り値: PNGのBlob（失敗時はnull）
 */
export async function buildShareImage(spec) {
  try {
    const { title, sub, rows, footer = `${GAME.title} ─ ${GAME.titleEn}` } = spec;
    const canvas = document.createElement('canvas');
    canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext('2d');

    // 背景（アプリと同じダークグラデ＋差し色）
    const bg = ctx.createLinearGradient(0, 0, W, H);
    bg.addColorStop(0, '#0b0e17'); bg.addColorStop(.55, '#141a2c'); bg.addColorStop(1, '#181230');
    ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
    const rad = ctx.createRadialGradient(W * .82, 0, 0, W * .82, 0, 520);
    rad.addColorStop(0, 'rgba(99,102,241,.22)'); rad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = rad; ctx.fillRect(0, 0, W, H);

    ctx.textAlign = 'center';
    const two = rows.length >= 2;
    ctx.fillStyle = '#f2c14e';
    ctx.font = `700 ${two ? 38 : 48}px "Yu Mincho", "Hiragino Mincho ProN", serif`;
    ctx.fillText(title, W / 2, two ? 48 : 78);
    if (sub) {
      ctx.fillStyle = '#eef1f9';
      ctx.font = `600 ${two ? 22 : 26}px sans-serif`;
      ctx.fillText(sub, W / 2, two ? 82 : 124);
    }

    if (two) {
      await drawRow(ctx, rows[0], 100, 136, 190);
      ctx.fillStyle = '#8f97ad';
      ctx.font = '700 26px "Yu Mincho", serif';
      ctx.fillText('VS', W / 2, 327);
      await drawRow(ctx, rows[1], 346, 136, 190);
    } else if (rows[0].cards.length === 1) {
      // 単体カードの自慢用: 1枚を大きく見せる
      await drawRow(ctx, rows[0], 150, 300, 420);
    } else {
      await drawRow(ctx, rows[0], 168, 196, 274);
    }

    ctx.fillStyle = '#8f97ad';
    ctx.font = '500 20px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(footer, W / 2, H - 22);
    return await new Promise(res => canvas.toBlob(res, 'image/png'));
  } catch (e) {
    console.warn('シェア画像の生成に失敗:', e);
    return null;
  }
}

async function drawRow(ctx, row, y, w, h) {
  const cards = row.cards.slice(0, 5);
  const gap = 16;
  const totalW = cards.length * w + (cards.length - 1) * gap;
  const left = (W - totalW) / 2;
  if (row.label) {
    ctx.textAlign = 'left';
    ctx.fillStyle = row.labelColor || '#8f97ad';
    ctx.font = '700 17px sans-serif';
    ctx.fillText(row.label, left + 2, y - 8);
    ctx.textAlign = 'center';
  }
  const arts = await Promise.all(cards.map(c => loadImage(c.artSrc)));
  cards.forEach((c, i) => drawCard(ctx, c, arts[i], left + i * (w + gap), y, w, h, row.dim));
}

const RARITY_COLOR = { N: '#6b7285', R: '#4a9eda', SR: '#a06ee0', SSR: '#e8b53a', UR: '#e07be0' };

function drawCard(ctx, card, art, x, y, w, h, dim) {
  const r = 14;
  ctx.save();
  rr(ctx, x, y, w, h, r);
  ctx.clip();

  if (art) {
    // object-fit: cover 相当の切り抜き
    const scale = Math.max(w / art.width, h / art.height);
    const dw = art.width * scale, dh = art.height * scale;
    ctx.drawImage(art, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
  } else {
    const g = ctx.createLinearGradient(x, y, x, y + h);
    g.addColorStop(0, '#1d2338'); g.addColorStop(1, '#0f1424');
    ctx.fillStyle = g; ctx.fillRect(x, y, w, h);
  }
  // 文字を読ませるための下側の暗幕
  const ov = ctx.createLinearGradient(x, y, x, y + h);
  ov.addColorStop(0, 'rgba(11,14,24,.18)');
  ov.addColorStop(.55, 'rgba(11,14,24,.30)');
  ov.addColorStop(1, 'rgba(11,14,24,.92)');
  ctx.fillStyle = ov; ctx.fillRect(x, y, w, h);

  // レアリティチップ（左上）
  ctx.font = '800 14px sans-serif';
  const chipW = Math.max(34, ctx.measureText(card.rarity).width + 16);
  ctx.fillStyle = RARITY_COLOR[card.rarity] || '#6b7285';
  rr(ctx, x + 8, y + 8, chipW, 22, 6);
  ctx.fill();
  ctx.fillStyle = card.rarity === 'SSR' ? '#3a2800' : '#fff';
  ctx.textAlign = 'center';
  ctx.fillText(card.rarity, x + 8 + chipW / 2, y + 24);

  // 名前（幅に収まるようフォントを自動縮小）
  let size = Math.round(w * .115);
  ctx.shadowColor = 'rgba(0,0,0,.9)'; ctx.shadowBlur = 6; ctx.shadowOffsetY = 1;
  do {
    ctx.font = `700 ${size}px "Yu Mincho", "Hiragino Mincho ProN", serif`;
    size--;
  } while (ctx.measureText(card.name).width > w - 14 && size > 10);
  ctx.fillStyle = '#fff';
  ctx.fillText(card.name, x + w / 2, y + h - 34);

  // 攻/防
  ctx.font = `700 ${Math.round(w * .078)}px sans-serif`;
  const atk = `攻 ${card.attack.toLocaleString('ja-JP')}`;
  const def = `防 ${card.defense.toLocaleString('ja-JP')}`;
  const aw = ctx.measureText(atk).width, dw2 = ctx.measureText(def).width;
  const sx = x + w / 2 - (aw + dw2 + 12) / 2;
  ctx.textAlign = 'left';
  ctx.fillStyle = '#ffb3a3'; ctx.fillText(atk, sx, y + h - 12);
  ctx.fillStyle = '#a8dfff'; ctx.fillText(def, sx + aw + 12, y + h - 12);
  ctx.textAlign = 'center';
  ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;

  // 敗者側は暗く落とす
  if (dim) { ctx.fillStyle = 'rgba(7,9,16,.55)'; ctx.fillRect(x, y, w, h); }
  ctx.restore();

  // レアリティ色の枠線
  ctx.strokeStyle = RARITY_COLOR[card.rarity] || 'rgba(255,255,255,.25)';
  ctx.lineWidth = card.rarity === 'UR' || card.rarity === 'SSR' ? 3 : 2;
  rr(ctx, x, y, w, h, r);
  ctx.stroke();
}

function rr(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function loadImage(src) {
  if (!src) return Promise.resolve(null);
  return new Promise(res => {
    const img = new Image();
    img.onload = () => res(img);
    img.onerror = () => res(null);   // 読めなくてもプレースホルダーで続行
    img.src = src;
  });
}
