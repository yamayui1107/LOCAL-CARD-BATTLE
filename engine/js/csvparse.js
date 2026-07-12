// シンプルなCSVパーサ（クォート対応）。
// config.jsに依存しない純粋関数のみ: ブラウザだけでなく games/*/tools/ のnodeスクリプトからも使う
export function parseCSV(text) {
  // BOM付きで保存されると先頭列名が壊れるので剥がしておく
  const lines = text.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').split('\n').filter(l => l.trim() !== '');
  const header = splitLine(lines[0]);
  return lines.slice(1).map(line => {
    const cells = splitLine(line);
    const row = {};
    header.forEach((h, i) => { row[h] = cells[i] ?? ''; });
    return row;
  });
}

function splitLine(line) {
  const out = [];
  let cur = '';
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQ) {
      if (ch === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++; }
        else inQ = false;
      } else cur += ch;
    } else {
      if (ch === '"') inQ = true;
      else if (ch === ',') { out.push(cur); cur = ''; }
      else cur += ch;
    }
  }
  out.push(cur);
  return out;
}
