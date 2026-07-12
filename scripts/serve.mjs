// 依存なしの開発用ローカルサーバー: node scripts/serve.mjs <ゲーム名> [port]
// ビルド不要のオーバーレイ配信: games/<ゲーム名>/ を優先し、無ければ engine/ から返す
// （デプロイ時は scripts/build.mjs が同じ重ね合わせを dist/ に固めるので、開発と本番が一致する）
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const game = process.argv[2];
const PORT = Number(process.argv[3]) || 8000;

if (!game || !fs.existsSync(path.join(ROOT, 'games', game))) {
  console.error(`使い方: node scripts/serve.mjs <ゲーム名> [port]\n利用可能: ${fs.readdirSync(path.join(ROOT, 'games')).join(', ')}`);
  process.exit(1);
}
const LAYERS = [path.join(ROOT, 'games', game), path.join(ROOT, 'engine')];

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.csv': 'text/csv; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml',
  '.webp': 'image/webp', '.gif': 'image/gif', '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
};

http.createServer((req, res) => {
  const urlPath = decodeURIComponent(req.url.split('?')[0]);
  const rel = urlPath === '/' ? 'index.html' : urlPath.slice(1);
  for (const layer of LAYERS) {
    const filePath = path.join(layer, rel);
    if (!filePath.startsWith(layer)) break;   // パストラバーサル防止
    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
      res.writeHead(200, { 'Content-Type': MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream' });
      return res.end(fs.readFileSync(filePath));
    }
  }
  res.writeHead(404);
  res.end('Not Found');
}).listen(PORT, () => console.log(`[${game}] 起動しました → http://localhost:${PORT} をブラウザで開いてください`))
  .on('error', (e) => {
    if (e.code === 'EADDRINUSE') {
      console.log(`すでにサーバーが起動しています → http://localhost:${PORT} を開けばOKです`);
    } else {
      console.error(e.message);
    }
  });
