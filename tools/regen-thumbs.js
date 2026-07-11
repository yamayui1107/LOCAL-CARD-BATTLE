// サムネイル再生成: images/*.jpg → images/thumb/*.jpg
// 一覧・開封・対戦のカードはサムネイルを表示するため、
// スマホの高密度ディスプレイ（2〜3倍）でボケないよう480px幅で作る。
// 使い方: cd tools && node regen-thumbs.js
const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, '..', 'images');
const DST = path.join(SRC, 'thumb');
const WIDTH = 480;

(async () => {
  const files = fs.readdirSync(SRC).filter(f => f.toLowerCase().endsWith('.jpg'));
  let done = 0, failed = 0;
  for (const f of files) {
    try {
      await sharp(path.join(SRC, f))
        .resize({ width: WIDTH, withoutEnlargement: true })
        .jpeg({ quality: 80, mozjpeg: true })
        .toFile(path.join(DST, f));
      done++;
    } catch (e) {
      failed++;
      console.error(`NG ${f}: ${e.message}`);
    }
  }
  console.log(`done=${done} failed=${failed}`);
})();
