// アクセス解析（Google Analytics 4）
//
// 使い方:
//   1. https://analytics.google.com/ でプロパティを作成（データストリーム=ウェブ）
//   2. 発行される測定ID（G-XXXXXXXXXX）を GA_ID に貼る
//   3. GA_ID が空の間は何も読み込まない（開発中・未設定でも安全）
//
// PVは自動計測。ゲーム固有の行動は track() でカスタムイベントとして送る
// （GA4の「イベント」レポートで開封数・対戦数・シェア数などが見られる）

export const GA_ID = 'G-SW8DDDVWKV';

export function initAnalytics() {
  if (!GA_ID || location.hostname === 'localhost') return;   // ローカル開発は計測しない
  const s = document.createElement('script');
  s.async = true;
  s.src = `https://www.googletagmanager.com/gtag/js?id=${GA_ID}`;
  document.head.appendChild(s);
  window.dataLayer = window.dataLayer || [];
  window.gtag = function () { window.dataLayer.push(arguments); };
  window.gtag('js', new Date());
  window.gtag('config', GA_ID);
}

/** カスタムイベント送信（GA未設定時は何もしない） */
export function track(event, params = {}) {
  if (typeof window.gtag === 'function') window.gtag('event', event, params);
}
