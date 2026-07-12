// SNS共有。スマホはOSの共有シート（Web Share API・画像添付対応）、
// 非対応環境（PCブラウザ等）は 画像プレビュー + X / LINE / 保存 / コピー の簡易シートを出す
import { track } from './analytics.js';
import { GAME } from './config.js';

const HASHTAG = GAME.hashtag;

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
 * 戻り値: 共有アクションが成立したら共有チャネル（'x' | 'line' | 'copy' | 'os'）/
 * キャンセル・シートを閉じただけなら false。
 * 'os'（OS共有シート）は共有先アプリが判別できないため、Xに送られたかは分からない。
 * 実際に投稿されたかまでは（intent URLもWeb Share APIも結果を返さないため）検証できない。
 * 初回シェアボーナスの付与判定に使う値なので、報酬は必ず「一度きり」に留めること
 */
export async function share(text, { url = shareUrl(), image = null } = {}) {
  const full = `${text} #${HASHTAG}`;
  track('share', { with_image: !!image });

  // 画像付きのOS共有シート
  if (image && navigator.canShare) {
    const file = new File([image], GAME.shareFileName, { type: 'image/png' });
    if (navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({ files: [file], text: full, url });
        return 'os';
      } catch (e) {
        if (e.name === 'AbortError') return false;   // ユーザーがキャンセルしただけ
      }
    }
  }
  // テキストのみのOS共有シート
  if (navigator.share) {
    try {
      await navigator.share({ text: full, url });
      return 'os';
    } catch (e) {
      if (e.name === 'AbortError') return false;
    }
  }
  return openShareSheet(full, url, image);
}

/**
 * Xの投稿画面（intent URL）を直接開く。スマホでもXアプリ/Webが開く。
 * OS共有シートと違い「Xに向けた共有」であることが確定するので、
 * X限定の報酬（初回シェアボーナス）の導線はこちらを使う
 */
export function shareToX(text, url = shareUrl()) {
  const full = `${text} #${HASHTAG}`;
  track('share', { channel: 'x_direct' });
  const enc = encodeURIComponent;
  window.open(`https://twitter.com/intent/tweet?text=${enc(full)}&url=${enc(url)}`, '_blank', 'noopener');
  return true;
}

// ---- フォールバック用の簡易シート ----
let lastObjectUrl = null;
let settleSheet = null;   // 開いているシートの決着関数（未オープン時はnull）

// 共有先に飛んだ／コピーした時点で成立とみなし、どのチャネルだったかを返す。
// 画像を保存してからXに貼る導線があるので、成立してもシートは開いたままにする
function markShared(channel) {
  track('share_done', { channel });
  const settle = settleSheet;
  settleSheet = null;
  settle?.(channel);
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
    save.download = GAME.shareFileName;
  }
  img.classList.toggle('hidden', !image);
  save.classList.toggle('hidden', !image);

  modal.querySelector('.share-preview').textContent = `${text}\n${url}`;
  const x = modal.querySelector('#share-x');
  x.href = `https://twitter.com/intent/tweet?text=${enc(text)}&url=${enc(url)}`;
  x.onclick = () => markShared('x');
  const line = modal.querySelector('#share-line');
  line.href = `https://line.me/R/share?text=${enc(`${text}\n${url}`)}`;
  line.onclick = () => markShared('line');
  const copyBtn = modal.querySelector('#share-copy');
  copyBtn.textContent = 'コピー';
  copyBtn.onclick = () => {
    navigator.clipboard?.writeText(`${text}\n${url}`);
    copyBtn.textContent = 'コピーした！';
    setTimeout(() => { copyBtn.textContent = 'コピー'; }, 1200);
    markShared('copy');
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
