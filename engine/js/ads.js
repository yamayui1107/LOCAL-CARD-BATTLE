// 広告統合レイヤー（Google AdSense H5 Games Ads / Ad Placement API）
//
// 使い方（IDはゲーム側 config.js の ADS で設定する）:
//   1. AdSenseの審査に通ったら ADS.client にサイト運営者ID（ca-pub-…）を設定する
//   2. 審査前・動作確認中は ADS.testMode = true のままにする（テスト広告が出る）
//   3. ADS.client が空の間は「本物の広告なし」として動き、
//      呼び出し側（main.js）がダミー広告モーダルにフォールバックする
//
// リワード広告: showRewarded() … スタミナ全回復など「見たら報酬」用
// インタースティシャル: showInterstitial() … 区切り（開封を閉じた時など）に挟む全画面広告。
//   頻度はGoogle側の制御に加えて、うっとうしくならないよう自前のクールダウンも掛ける
import { ADS } from './config.js';

const AD_CLIENT = ADS.client;
const AD_TEST_MODE = ADS.testMode;

// 常設バナー（ディスプレイ広告）のスロットID。
// AdSense管理画面 → 広告 → 広告ユニット → 「ディスプレイ広告」を作成し、
// 発行される data-ad-slot の数字（例: '1234567890'）を ADS.slotBanner に貼る。
// 空のままなら .ad-banner の枠は描画されず、レイアウトにも影響しない
const AD_SLOT_BANNER = ADS.slotBanner;

const INTERSTITIAL_COOLDOWN_MS = 3 * 60 * 1000;   // 全画面広告は最短3分間隔
let lastInterstitialAt = 0;
// SDKが実際に使える状態になったか。読み込み失敗（広告ブロッカー・審査前・オフライン）時は
// falseのままになり、呼び出し側がダミー広告にフォールバックできる
let sdkReady = false;

/** 本物の広告が使える状態か（=AD_CLIENT設定済み） */
export function adsEnabled() {
  return !!AD_CLIENT;
}

/** 起動時に一度呼ぶ。AdSenseスクリプトを読み込み、Ad Placement APIを準備する */
export function initAds() {
  if (!AD_CLIENT) return;
  const s = document.createElement('script');
  s.async = true;
  s.crossOrigin = 'anonymous';
  s.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${AD_CLIENT}`;
  if (AD_TEST_MODE) s.dataset.adbreakTest = 'on';
  document.head.appendChild(s);

  // Ad Placement APIの標準ボイラープレート
  window.adsbygoogle = window.adsbygoogle || [];
  window.adBreak = window.adConfig = function (o) { window.adsbygoogle.push(o); };
  window.adConfig({
    preloadAdBreaks: 'on',
    sound: 'off',           // ゲーム自体に音がないためミュート扱い
    onReady: () => { sdkReady = true; console.info('[ads] Ad Placement API ready'); },
  });
}

/**
 * ページ内の .ad-banner 要素にディスプレイ広告を流し込む。
 * リワード広告と違いスタミナに依存せず常時表示できる唯一の枠なので、
 * ヘッダー下とフッター上に置いてある。スロット未設定なら枠ごと出さない
 */
export function initBanners() {
  if (!AD_CLIENT || !AD_SLOT_BANNER) return;
  for (const box of document.querySelectorAll('.ad-banner')) {
    const ins = document.createElement('ins');
    ins.className = 'adsbygoogle';
    ins.style.display = 'block';
    ins.dataset.adClient = AD_CLIENT;
    ins.dataset.adSlot = AD_SLOT_BANNER;
    ins.dataset.adFormat = 'auto';
    ins.dataset.fullWidthResponsive = 'true';
    if (AD_TEST_MODE) ins.dataset.adtest = 'on';
    box.appendChild(ins);
    box.classList.remove('hidden');
    // adsbygoogleは共通のコマンドキュー。Ad Placement APIのadConfigと同居して問題ない
    (window.adsbygoogle = window.adsbygoogle || []).push({});
  }
}

/**
 * リワード広告を表示する。
 * 戻り値: true=本物の広告フローに乗った / false=広告なし（呼び出し側でダミー等にフォールバック）
 * onReward は「最後まで視聴した」時だけ呼ばれる。
 */
export function showRewarded(name, onReward) {
  if (!AD_CLIENT || !sdkReady || typeof window.adBreak !== 'function') return false;
  let viewed = false;
  window.adBreak({
    type: 'reward',
    name,
    beforeReward: (showAdFn) => showAdFn(),   // ボタン押下が同意なので即表示
    adViewed: () => { viewed = true; },
    adDismissed: () => { viewed = false; },
    afterAd: () => { if (viewed) onReward(); },
    // 在庫なし等で広告が出せなかった場合も報酬を渡す（プレイヤーに不利益を出さない）
    adBreakDone: (info) => {
      if (info.breakStatus !== 'viewed' && info.breakStatus !== 'dismissed' && !viewed) onReward();
    },
  });
  return true;
}

/** 区切りの全画面広告。クールダウン中・未設定なら何もしない */
export function showInterstitial(name) {
  if (!AD_CLIENT || !sdkReady || typeof window.adBreak !== 'function') return;
  const now = Date.now();
  if (now - lastInterstitialAt < INTERSTITIAL_COOLDOWN_MS) return;
  lastInterstitialAt = now;
  window.adBreak({ type: 'next', name });
}
