// SNS共有。スマホはOSの共有シート（Web Share API・画像添付対応）、
// 非対応環境（PCブラウザ等）は 画像プレビュー + X / LINE / 保存 / コピー の簡易シートを出す
const HASHTAG = '地域カードバトル';

/** 共有用のサイトURL（?vs= などのパラメータを付けられる） */
export function shareUrl(params = {}) {
  const u = new URL(location.origin + location.pathname);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  return u.toString();
}

/**
 * テキスト（＋あれば画像）をSNSに共有する。
 * image: PNGのBlob（shareimg.jsで生成）。共有先が画像非対応ならテキストのみで送る
 *
 * 戻り値: 共有アクションが成立したら true / キャンセル・シートを閉じただけなら false。
 * 実際に投稿されたかまでは（intent URLもWeb Share APIも結果を返さないため）検証できない。
 * 初回シェアボーナスの付与判定に使う値なので、報酬は必ず「一度きり」に留めること
 */
export async function share(text, { url = shareUrl(), image = null } = {}) {
  const full = `${text} #${HASHTAG}`;

  // 画像付きのOS共有シート
  if (image && navigator.canShare) {
    const file = new File([image], 'local-card-battle.png', { type: 'image/png' });
    if (navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({ files: [file], text: full, url });
        return true;
      } catch (e) {
        if (e.name === 'AbortError') return false;   // ユーザーがキャンセルしただけ
      }
    }
  }
  // テキストのみのOS共有シート
  if (navigator.share) {
    try {
      await navigator.share({ text: full, url });
      return true;
    } catch (e) {
      if (e.name === 'AbortError') return false;
    }
  }
  return openShareSheet(full, url, image);
}

// ---- フォールバック用の簡易シート ----
let lastObjectUrl = null;
let settleSheet = null;   // 開いているシートの決着関数（未オープン時はnull）

// 共有先に飛んだ／コピーした時点で成立とみなす。
// 画像を保存してからXに貼る導線があるので、成立してもシートは開いたままにする
function markShared() {
  const settle = settleSheet;
  settleSheet = null;
  settle?.(true);
}

function closeSheet() {
  document.querySelector('#share-modal').classList.add('hidden');
  const settle = settleSheet;
  settleSheet = null;
  settle?.(false);
}

function openShareSheet(text, url, image) {
  const modal = document.querySelector('#share-modal');
  const enc = encodeURIComponent;

  const img = modal.querySelector('#share-img');
  const save = modal.querySelector('#share-save');
  if (lastObjectUrl) { URL.revokeObjectURL(lastObjectUrl); lastObjectUrl = null; }
  if (image) {
    lastObjectUrl = URL.createObjectURL(image);
    img.src = lastObjectUrl;
    save.href = lastObjectUrl;
    save.download = 'local-card-battle.png';
  }
  img.classList.toggle('hidden', !image);
  save.classList.toggle('hidden', !image);

  modal.querySelector('.share-preview').textContent = `${text}\n${url}`;
  const x = modal.querySelector('#share-x');
  x.href = `https://twitter.com/intent/tweet?text=${enc(text)}&url=${enc(url)}`;
  x.onclick = markShared;
  const line = modal.querySelector('#share-line');
  line.href = `https://line.me/R/share?text=${enc(`${text}\n${url}`)}`;
  line.onclick = markShared;
  const copyBtn = modal.querySelector('#share-copy');
  copyBtn.textContent = 'コピー';
  copyBtn.onclick = () => {
    navigator.clipboard?.writeText(`${text}\n${url}`);
    copyBtn.textContent = 'コピーした！';
    setTimeout(() => { copyBtn.textContent = 'コピー'; }, 1200);
    markShared();
  };

  // 前のシートが決着せず残っていたらキャンセル扱いで閉じる
  settleSheet?.(false);
  modal.classList.remove('hidden');
  return new Promise((resolve) => { settleSheet = resolve; });
}

/** 起動時に一度呼ぶ: シートの閉じる動作を配線する */
export function initShare() {
  const modal = document.querySelector('#share-modal');
  modal.querySelector('#share-close').onclick = closeSheet;
  modal.onclick = (e) => { if (e.target === modal) closeSheet(); };
}
