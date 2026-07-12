// デプロイ用ビルド: engine/ と games/<ゲーム名>/ を dist/ に合成する（コピーのみ・依存なし）
//   node scripts/build.mjs battle
// ゲーム側のファイルがエンジン側と同名なら上書きされる（index.htmlやconfig.jsを差し替える仕組み）
import { cpSync, rmSync, existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const game = process.argv[2];
const gamesDir = path.join(ROOT, 'games');

if (!game || !existsSync(path.join(gamesDir, game))) {
  console.error(`使い方: node scripts/build.mjs <ゲーム名>\n利用可能: ${readdirSync(gamesDir).join(', ')}`);
  process.exit(1);
}

// 配信物に含めないもの（開発ツール・検証ページ・ドキュメント）
const EXCLUDE = /(^|[\\/])(tools|node_modules|__[^\\/]*\.html|ゲーム起動\.bat|README\.md)$/;
const filter = (src) => !EXCLUDE.test(src);

const dist = path.join(ROOT, 'dist');
rmSync(dist, { recursive: true, force: true });
cpSync(path.join(ROOT, 'engine'), dist, { recursive: true, filter });
cpSync(path.join(gamesDir, game), dist, { recursive: true, filter });
console.log(`dist/ に ${game} をビルドしました（engine + games/${game}）`);
