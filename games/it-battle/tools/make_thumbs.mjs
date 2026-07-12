// ローカル画像の一覧用サムネイル(幅480px)を生成する
//   cd games/it-battle && node tools/make_thumbs.mjs
// 出力: images/thumb/<同名ファイル>。生成済みはスキップ（作り直す時はthumbを削除してから）。
// sharpは自前のnode_modulesに無ければ、地域版(games/battle/tools)のインストールを流用する
import { readdirSync, mkdirSync, existsSync, statSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
let sharp;
try { sharp = require('sharp'); }
catch { sharp = require('../../battle/tools/node_modules/sharp'); }

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'images');
const DST = path.join(SRC, 'thumb');
mkdirSync(DST, { recursive: true });

const files = readdirSync(SRC).filter(f => /\.(jpe?g|png|gif|webp)$/i.test(f));
let done = 0, skipped = 0;
for (const f of files) {
  const out = path.join(DST, f);
  if (existsSync(out)) { skipped++; continue; }
  // ロゴ等の透過PNGはJPEG化で背景が黒くなるため、カードの下地色でフラット化する
  await sharp(path.join(SRC, f))
    .resize({ width: 480, withoutEnlargement: true })
    .flatten({ background: '#141a2c' })
    .jpeg({ quality: 80, mozjpeg: true })
    .toFile(out);
  done++;
}
const size = readdirSync(DST).reduce((s, f) => s + statSync(path.join(DST, f)).size, 0);
console.log(`生成${done}件 / スキップ${skipped}件 / thumbフォルダ計 ${(size / 1024 / 1024).toFixed(1)}MB`);
