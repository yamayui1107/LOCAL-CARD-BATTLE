// ローカル画像の一覧用サムネイル(幅240px)を生成する
//   cd tools && node make_thumbs.mjs
// 出力: images/thumb/<同名ファイル>。生成済みはスキップ。
import { readdirSync, mkdirSync, existsSync, statSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import sharp from 'sharp';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'images');
const DST = path.join(SRC, 'thumb');
mkdirSync(DST, { recursive: true });

const files = readdirSync(SRC).filter(f => /\.(jpe?g|png|gif|webp)$/i.test(f));
let done = 0, skipped = 0;
for (const f of files) {
  const out = path.join(DST, f);
  if (existsSync(out)) { skipped++; continue; }
  await sharp(path.join(SRC, f)).resize({ width: 240 }).jpeg({ quality: 72 }).toFile(out);
  done++;
}
const size = readdirSync(DST).reduce((s, f) => s + statSync(path.join(DST, f)).size, 0);
console.log(`生成${done}件 / スキップ${skipped}件 / thumbフォルダ計 ${(size / 1024 / 1024).toFixed(1)}MB`);
