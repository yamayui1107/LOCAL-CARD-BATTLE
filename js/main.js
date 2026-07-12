import { loadAll } from './csv.js';
import * as S from './state.js';
import { drawPack, rarityIndex, hasSSRorAbove, isGuaranteedPack, SR_GUARANTEE_EVERY, RARITY_ORDER } from './gacha.js';
import * as B from './battle.js';
import { initAds, initBanners, showRewarded, showInterstitial } from './ads.js';
import { share, shareUrl, initShare } from './share.js';
import { buildShareImage } from './shareimg.js';
import { initAnalytics, track } from './analytics.js';

let CARDS = [];
let SYNERGIES = [];
let TAG_MASTER = new Map();
let IMAGES = new Map();
let BOSSES = [];
let currentPack = null;
let flippedCount = 0;

const REGIONS = {
  '北海道・東北': ['北海道', '青森県', '岩手県', '宮城県', '秋田県', '山形県', '福島県'],
  '関東': ['茨城県', '栃木県', '群馬県', '埼玉県', '千葉県', '東京都', '神奈川県'],
  '中部': ['新潟県', '富山県', '石川県', '福井県', '山梨県', '長野県', '岐阜県', '静岡県', '愛知県'],
  '近畿': ['三重県', '滋賀県', '京都府', '大阪府', '兵庫県', '奈良県', '和歌山県'],
  '中国・四国': ['鳥取県', '島根県', '岡山県', '広島県', '山口県', '徳島県', '香川県', '愛媛県', '高知県'],
  '九州・沖縄': ['福岡県', '佐賀県', '長崎県', '熊本県', '大分県', '宮崎県', '鹿児島県', '沖縄県'],
};

const $ = (sel) => document.querySelector(sel);
const icon = (name) => `<svg class="ic" aria-hidden="true"><use href="#i-${name}"></use></svg>`;
const regionOf = (pref) => Object.keys(REGIONS).find(r => REGIONS[r].includes(pref)) || '';
const fmt = (n) => n.toLocaleString('ja-JP');   // 大きい数字はカンマ区切りで迫力を出す

// 一覧用は240pxサムネイル、拡大表示ではフル解像度を使う
function artUrl(img, small) {
  if (!small) return img.file;
  if (/^https?:/.test(img.file)) return img.file.replace(/\/(\d+)px-/, '/240px-');
  return img.file.replace(/^images\//, 'images/thumb/');
}
function artImg(card, small) {
  const img = IMAGES.get(card.id);
  if (!img) return '';
  const src = artUrl(img, small);
  const fallback = small ? ` onerror="this.onerror=null;this.src='${img.file}'"` : '';
  return `<img src="${src}" loading="lazy" decoding="async" alt=""${fallback}>`;
}

// ---------- 起動 ----------
async function init() {
  try {
    ({ cards: CARDS, synergies: SYNERGIES, tagMaster: TAG_MASTER, images: IMAGES, bosses: BOSSES } = await loadAll());
  } catch (e) {
    document.body.innerHTML = `<div style="padding:2em;color:#eee;font-family:sans-serif">
      <h2>データの読み込みに失敗しました</h2>
      <p>${e.message}</p>
      <p>ローカルサーバー経由で開いてください（例: <code>python -m http.server 8000</code> を実行して
      <code>http://localhost:8000</code> にアクセス）。file:// 直接オープンでは動きません。</p></div>`;
    return;
  }

  initAds();
  initBanners();
  initShare();
  initAnalytics();

  if (!S.getState().homePref) {
    showOnboarding();
  } else {
    showHome();
  }
}

// 共有リンク（?vs=デッキコード）で開かれたら、対戦タブを開いてコードを自動入力する
function applySharedCode() {
  const vs = new URLSearchParams(location.search).get('vs');
  if (!vs) return;
  history.replaceState(null, '', location.pathname);   // リロードで再発火しないよう消す
  document.querySelector('.tab-btn[data-tab="battle"]')?.click();
  $('#friend-code').value = vs;
  $('#battle-hint').textContent = 'フレンドのデッキコードを受け取りました。デッキを組んで「対戦する」を押そう！';
}

// ---------- 地元選択（初回 & 変更） ----------
function showOnboarding(isChange = false) {
  $('#home').classList.add('hidden');
  $('#onboarding').classList.remove('hidden');
  $('.onboard-lead').innerHTML = isChange
    ? '<strong>地元</strong>を変更する<br><span class="onboard-note">選んだ都道府県のカードが出やすくなります（コレクションはそのまま）</span>'
    : 'あなたの<strong>地元</strong>はどこ？<br><span class="onboard-note">地元の都道府県のカードが出やすくなります</span>';
  const picker = $('#pref-picker');
  picker.innerHTML = '';
  const current = S.getState().homePref;
  for (const [region, prefs] of Object.entries(REGIONS)) {
    const h = document.createElement('div');
    h.className = 'region-label';
    h.textContent = region;
    picker.appendChild(h);
    const grid = document.createElement('div');
    grid.className = 'pref-grid';
    for (const p of prefs) {
      const btn = document.createElement('button');
      btn.className = 'pref-btn' + (p === current ? ' current' : '');
      btn.textContent = p;
      btn.onclick = () => {
        S.getState().homePref = p;
        S.save();
        $('#onboarding').classList.add('hidden');
        if (isChange) {
          $('#home').classList.remove('hidden');
          $('#home-badge').innerHTML = `${icon('pin')}${p}<span class="badge-edit">変更</span>`;
          renderPackInfo();
        } else {
          showHome();
        }
      };
      grid.appendChild(btn);
    }
    picker.appendChild(grid);
  }
}

// ---------- メイン画面 ----------
function showHome() {
  $('#home').classList.remove('hidden');
  $('#home-badge').innerHTML = `${icon('pin')}${S.getState().homePref}<span class="badge-edit">変更</span>`;
  $('#home-badge').onclick = () => showOnboarding(true);
  setupTabs();
  setupPackTab();
  setupCollectionTab();
  setupBattleTab();
  renderSynergyTab();
  renderStamina();
  setInterval(renderStamina, 1000);
  applySharedCode();
}

function setupTabs() {
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.onclick = () => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      document.querySelectorAll('.tab-panel').forEach(p => p.classList.add('hidden'));
      $(`#tab-${btn.dataset.tab}`).classList.remove('hidden');
      if (btn.dataset.tab === 'collection') renderCollection();
      if (btn.dataset.tab === 'synergy') renderSynergyTab();
      if (btn.dataset.tab === 'battle') renderBattleTab();
    };
  });
  $('#reset-btn').onclick = () => {
    if (confirm('セーブデータを全て削除します。よろしいですか？')) {
      S.resetAll();
      location.reload();
    }
  };
}

// ---------- スタミナ ----------
function renderStamina() {
  const st = S.getStamina();
  // ピップは自然回復ぶん（10個）だけ表示し、広告で上乗せしたぶんは「+N」で横に出す
  const inBar = Math.min(st, S.STAMINA_MAX);
  const extra = st - inBar;
  const pips = $('#stamina-pips');
  pips.innerHTML = icon('bolt') +
    `<span class="pipbar">${'<i class="pip on"></i>'.repeat(inBar)}${'<i class="pip"></i>'.repeat(S.STAMINA_MAX - inBar)}</span>` +
    (extra > 0 ? `<span class="pip-extra">+${extra}</span>` : '');
  const ms = S.msToNextStamina();
  $('#stamina-timer').innerHTML = ms == null ? 'MAX' : `${icon('clock')}次回復 ${fmtMs(ms)}`;

  $('#open-pack-btn').disabled = st < S.PACK_COST;

  const adBtn = $('#ad-btn');
  const canAd = S.canWatchAd();
  adBtn.disabled = !canAd;
  adBtn.innerHTML = canAd
    ? `${icon('play')}広告を見てスタミナ +${S.AD_STAMINA}`
    : `${icon('play')}スタミナが上限（${S.STAMINA_CAP}）です`;
  updateBattleAdBtn();
}

// 対戦結果画面の広告ボタン。スタミナ上限に達している時だけ隠す
function updateBattleAdBtn() {
  $('#battle-ad-btn').classList.toggle('hidden', !S.canWatchAd());
}

function fmtMs(ms) {
  const s = Math.ceil(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

// ---------- パックタブ ----------
function setupPackTab() {
  renderPackInfo();
  $('#open-pack-btn').onclick = () => tryOpenPack(false);
  $('#ticket-btn').onclick = () => tryOpenPack(true);
  $('#open-again-btn').onclick = () => {
    // チケット優先で消費し、なければスタミナ。どちらも無ければ閉じる
    if (S.getState().tickets > 0) {
      tryOpenPack(true, true);   // 2パック目以降はパック破りを省略して即開封
      return;
    }
    if (S.getStamina() < S.PACK_COST) {
      closeOverlay();
      return;
    }
    tryOpenPack(false, true);
  };
  $('#close-overlay-btn').onclick = closeOverlay;
  $('#ad-btn').onclick = showAd;
  $('#result-ad-btn').onclick = showAd;
  // 初回シェアボーナスのCTA（未受け取りの間だけ出る）
  $('#share-bonus-btn').onclick = () => {
    const owned = CARDS.filter(c => S.ownedCount(c.id) > 0).length;
    shareAndReward(
      `「地域カードバトル」で地元${S.getState().homePref}のカードを集めてる！ コレクション ${owned}/${CARDS.length}枚`
    );
  };
  // 開封結果のシェア: 5枚並びの画像＋いちばんレアな1枚の自慢文
  $('#share-pull-btn').onclick = async () => {
    if (!currentPack) return;
    const best = [...currentPack].sort((a, b) => rarityIndex(b.rarity) - rarityIndex(a.rarity))[0];
    const image = await buildShareImage({
      title: '開封結果',
      sub: `${best.rarity}『${best.name}』を引き当てた！`,
      rows: [{ cards: currentPack.map(shareCardEntry) }],
    });
    shareAndReward(`「地域カードバトル」で ${best.rarity}『${best.name}』を引き当てた！`, { image });
  };
  $('#flip-all-btn').onclick = flipAll;
  $('#to-result-btn').onclick = showResult;
  // 画面のどこをタップしてもOK: パック破り／次の1枚めくり
  $('#pack-overlay').onclick = (e) => {
    if (e.target.closest('button')) return;
    if (!$('#stage-pack').classList.contains('hidden')) {
      tearPack();
    } else if (!$('#stage-cards').classList.contains('hidden') && !e.target.closest('.flip-card')) {
      const next = document.querySelector('#card-row .flip-card:not(.flipped)');
      if (next) next.click();
      else showResult();   // 全部めくれた後の余白タップで結果へ
    }
  };
}

function renderPackInfo() {
  const owned = CARDS.filter(c => S.ownedCount(c.id) > 0).length;
  $('#collection-progress').textContent = `コレクション ${owned} / ${CARDS.length}`;
  const homePref = S.getState().homePref;
  const homeOwned = CARDS.filter(c => c.prefecture === homePref && S.ownedCount(c.id) > 0).length;
  const homeTotal = CARDS.filter(c => c.prefecture === homePref).length;
  $('#pack-hint').textContent = `地元${homePref}のカードが出やすい！（地元コンプ ${homeOwned}/${homeTotal}）`;

  const tickets = S.getState().tickets;
  const tBtn = $('#ticket-btn');
  tBtn.classList.toggle('hidden', tickets <= 0);
  if (tickets > 0) tBtn.innerHTML = `チケットで開ける <span class="cost">残り${tickets}枚</span>`;

  const sBtn = $('#share-bonus-btn');
  const shareable = S.shareBonusAvailable();
  sBtn.classList.toggle('hidden', !shareable);
  if (shareable) sBtn.innerHTML = `シェアしてチケット${S.SHARE_BONUS_TICKETS}枚もらう <span class="cost">初回のみ</span>`;

  const st = S.getState();
  const g = nextGuarantee();
  const remDraws = SR_GUARANTEE_EVERY - (st.totalDraws % SR_GUARANTEE_EVERY);
  const remPacks = Math.ceil(remDraws / 5);
  $('#guarantee-hint').innerHTML = g
    ? `${icon('sparkles')}<b>次のパックは${g}以上確定！</b>`
    : `${icon('sparkles')}あと<b>${remPacks}</b>パックで SR以上確定`;
  showGuarantee($('#pack-visual'), $('#pack-badge'), g);
}

// 次に開けるパックに乗っている確定枠。無ければ null（天井のSSR確定を優先）
function nextGuarantee() {
  const st = S.getState();
  if (st.pitySinceSSR >= S.PITY_THRESHOLD) return 'SSR';
  if (isGuaranteedPack(st.totalDraws)) return 'SR';
  return null;
}

function showGuarantee(packEl, badgeEl, g) {
  packEl.classList.toggle('guaranteed', !!g);
  badgeEl.classList.toggle('hidden', !g);
  if (g) badgeEl.innerHTML = `${icon('sparkles')}${g}以上確定`;
}

function tryOpenPack(useTicket = false, quick = false) {
  if (useTicket) {
    if (!S.useTicket()) return;
  } else if (!S.spendStamina(S.PACK_COST)) {
    return;
  }
  track('pack_open', { method: useTicket ? 'ticket' : 'stamina' });
  const st = S.getState();
  const pity = st.pitySinceSSR >= S.PITY_THRESHOLD;
  const guarantee = nextGuarantee();   // totalDrawsを進める前に、このパックの確定枠を確定させる
  currentPack = drawPack(CARDS, st.homePref, pity, st.totalDraws);
  st.totalDraws += currentPack.length;
  st.packsOpened++;
  st.pitySinceSSR = hasSSRorAbove(currentPack) ? 0 : st.pitySinceSSR + 1;
  S.addCards(currentPack);
  S.save();
  renderStamina();

  // 確定枠つきパックは、開ける前（パック）とめくる最中（カード）の両方で分かるようにする
  showGuarantee($('#opening-pack'), $('#opening-badge'), guarantee);
  const tag = $('#cards-badge');
  tag.classList.toggle('hidden', !guarantee);
  if (guarantee) tag.innerHTML = `${icon('sparkles')}このパックは${guarantee}以上確定`;

  // オーバーレイ表示。「もう1パック」からはパック破りを省略して即カードへ
  $('#pack-overlay').classList.remove('hidden');
  if (quick) {
    flashScreen('white', 250);
    layoutCards();
    showStage('stage-cards');
  } else {
    tearing = false;
    showStage('stage-pack');
  }
}

function showStage(id) {
  document.querySelectorAll('#pack-overlay .stage').forEach(s => s.classList.add('hidden'));
  $(`#${id}`).classList.remove('hidden');
}

let tearing = false;

function tearPack() {
  if (tearing) return;
  tearing = true;
  const pack = $('#opening-pack');
  pack.classList.add('tearing');
  flashScreen('white', 300);
  navigator.vibrate?.([18, 26, 60]);   // スマホでは破る手応えを触覚でも返す
  setTimeout(() => {
    pack.classList.remove('tearing');
    tearing = false;
    layoutCards();
    showStage('stage-cards');
  }, 540);
}

function layoutCards() {
  flippedCount = 0;
  $('#to-result-btn').classList.add('hidden');
  $('#flip-all-btn').classList.remove('hidden');
  const row = $('#card-row');
  row.innerHTML = '';
  currentPack.forEach((card, i) => {
    const slot = document.createElement('div');
    slot.className = 'flip-card';
    // SR以上はめくる前からオーラで期待感を出す
    if (rarityIndex(card.rarity) >= rarityIndex('SR')) {
      slot.classList.add(`aura-${card.rarity.toLowerCase()}`);
    }
    slot.style.animationDelay = `${i * 0.08}s`;
    slot.innerHTML = `
      <div class="flip-inner">
        <div class="flip-back"><div class="back-emblem"><span>地域</span></div></div>
        <div class="flip-front">${cardHTML(card, true)}</div>
      </div>`;
    slot.onclick = () => flipCard(slot, card);
    row.appendChild(slot);
  });
}

function flipCard(slot, card) {
  if (slot.classList.contains('flipped')) {
    showCardModal(card);
    return;
  }
  slot.classList.add('flipped');
  flippedCount++;
  if (card.rarity === 'UR') {
    flashScreen('rainbow', 900);
    document.body.classList.add('shake');
    setTimeout(() => document.body.classList.remove('shake'), 600);
  } else if (card.rarity === 'SSR') {
    flashScreen('gold', 600);
  } else if (card.rarity === 'SR') {
    flashScreen('purple', 350);
  }
  if (flippedCount >= currentPack.length) {
    // 全部めくれたら余韻を残して待つ。次へは1タップ（ボタン or 画面どこでも）
    $('#flip-all-btn').classList.add('hidden');
    $('#to-result-btn').classList.remove('hidden');
  }
}

function flipAll() {
  const slots = document.querySelectorAll('#card-row .flip-card:not(.flipped)');
  let i = 0;
  slots.forEach(slot => {
    setTimeout(() => slot.click(), i * 110);
    i++;
  });
}

function showResult() {
  const list = $('#result-list');
  list.innerHTML = '';
  const st = S.getState();
  currentPack.forEach(card => {
    const isNew = st.newCards.includes(card.id);
    const div = document.createElement('div');
    div.className = `result-row rarity-${card.rarity.toLowerCase()}`;
    div.innerHTML = `
      <span class="rarity-gem gem-${card.rarity.toLowerCase()}">${card.rarity}</span>
      <span class="result-name">${card.name}</span>
      <span class="result-pref">${card.prefecture}</span>
      ${isNew ? '<span class="new-badge">NEW!</span>' : `<span class="dup">${S.ownedCount(card.id)}枚目</span>`}`;
    div.onclick = () => showCardModal(card);
    list.appendChild(div);
  });
  currentPack.forEach(c => S.clearNew(c.id));
  updateResultButtons();
  showStage('stage-result');
  renderPackInfo();
}

// チケット→スタミナの優先順で「もう1パック」を出し、どちらも無ければ広告ボタンに切り替える
function updateResultButtons() {
  const tickets = S.getState().tickets;
  const canOpen = tickets > 0 || S.getStamina() >= S.PACK_COST;
  const btn = $('#open-again-btn');
  btn.classList.toggle('hidden', !canOpen);
  btn.innerHTML = tickets > 0
    ? `もう1パック <span class="cost">${icon('gift')}チケット残り${tickets}</span>`
    : `もう1パック <span class="cost">${icon('bolt')}2</span>`;
  $('#result-ad-btn').classList.toggle('hidden', canOpen);
}

function closeOverlay() {
  $('#pack-overlay').classList.add('hidden');
  renderPackInfo();
  renderStamina();
  showInterstitial('pack-close');   // 区切りの全画面広告（クールダウン付き・未設定なら無音）
}

// ---------- シェア ----------
// どのシェアボタンから共有しても初回ボーナスの対象。
// 実際に投稿されたかは検証できない（intent URLは結果を返さない）ので、
// ボーナスは一度きりに固定してある＝連打しても増えない
async function shareAndReward(text, opts = {}) {
  const shared = await share(text, opts);
  if (!shared) return;
  const gained = S.grantFirstShareBonus();
  if (gained > 0) {
    toast(`${icon('gift')}初回シェアありがとう！ パックチケット <b>+${gained}枚</b>`);
    renderPackInfo();
    renderBattleTab();
  }
}

let toastTimer = null;
function toast(html) {
  const el = $('#toast');
  el.innerHTML = html;
  el.classList.remove('hidden');
  void el.offsetWidth;   // 連続表示でもスライドインを再生させる
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    el.classList.remove('show');
    setTimeout(() => el.classList.add('hidden'), 300);
  }, 3200);
}

// ---------- 広告 ----------
// 本物のリワード広告（ads.jsのAD_CLIENT設定時）を優先し、
// 未設定・読み込み失敗時は開発用ダミーモーダルにフォールバックする
function showAd() {
  const usedRealAd = showRewarded('stamina-refill', grantAdReward);
  if (!usedRealAd) showDummyAd();
}

// 広告視聴の報酬: スタミナ +AD_STAMINA（上限STAMINA_CAPまで貯まる）
function grantAdReward() {
  S.watchAd();
  renderStamina();
  toast(`${icon('bolt')}スタミナ <b>+${S.AD_STAMINA}</b>`);
  // 開封結果画面から広告を見た場合は、その場で「もう1パック」に戻す
  if (!$('#pack-overlay').classList.contains('hidden') &&
      !$('#stage-result').classList.contains('hidden')) {
    updateResultButtons();
  }
}

function showDummyAd() {
  const modal = $('#ad-modal');
  modal.classList.remove('hidden');
  let remain = 15;
  const cd = $('#ad-countdown');
  cd.textContent = remain;
  const timer = setInterval(() => {
    remain--;
    cd.textContent = remain;
    if (remain <= 0) {
      clearInterval(timer);
      modal.classList.add('hidden');
      grantAdReward();
    }
  }, 1000);
}

// シェア画像用のカード情報（写真はサムネイルで十分）
function shareCardEntry(card) {
  const img = IMAGES.get(card.id);
  return {
    name: card.name, rarity: card.rarity,
    attack: card.attack, defense: card.defense,
    artSrc: img ? artUrl(img, true) : null,
  };
}

// ---------- カードHTML ----------
function cardHTML(card, compact = false) {
  const tagChips = card.tags.map(t =>
    `<span class="tag-chip" title="${TAG_MASTER.get(t) || ''}">${t}</span>`).join('');
  const typeLabel = card.type === 'pref' ? '都道府県' : card.type === 'spot' ? '名所' : '市区町村';
  const sealChar = card.type === 'pref' ? '都' : card.type === 'spot' ? '景' : '町';
  // 都道府県カードは自分自身が県名なので、所在地には地方名を出す
  const place = card.type === 'pref' ? regionOf(card.prefecture) : card.prefecture;
  const img = IMAGES.get(card.id);
  const art = img ? `<div class="card-art">${artImg(card, compact)}</div>` : '';
  return `
    <div class="game-card rarity-${card.rarity.toLowerCase()} type-${card.type}${img ? ' has-art' : ''}">
      ${art}
      <div class="card-head">
        <span class="rarity-gem gem-${card.rarity.toLowerCase()}">${card.rarity}</span>
        <span class="card-type">${typeLabel}</span>
      </div>
      <div class="card-name">${card.name}</div>
      <div class="card-reading">${card.reading}</div>
      <div class="card-pref">${icon('pin')}${place}</div>
      <div class="card-stats">
        <span class="stat atk">${icon('sword')}${fmt(card.attack)}</span>
        <span class="stat def">${icon('shield')}${fmt(card.defense)}</span>
      </div>
      <div class="card-tags">${tagChips}</div>
      ${compact ? '' : `<div class="card-desc">${card.description}</div>`}
      <span class="card-seal">${sealChar}</span>
      <i class="card-holo"></i>
    </div>`;
}

function showCardModal(card) {
  const modal = $('#card-modal');
  const owned = S.ownedCount(card.id);
  const img = IMAGES.get(card.id);
  const credit = img
    ? `<div class="modal-credit">画像: <a href="${img.source_url}" target="_blank" rel="noopener">Wikimedia Commons</a>
       / ${img.artist}（${img.license}）</div>`
    : '';
  $('#card-modal-content').innerHTML = `
    <div class="viewer-wrap">
      <div class="viewer-tilt" id="viewer-tilt">
        ${cardHTML(card)}
        <i class="viewer-glare"></i>
      </div>
    </div>
    <div class="viewer-meta">
      <div class="modal-meta">所持: ${owned}枚</div>
      ${credit}
      <div class="viewer-btns">
        ${owned > 0 ? `<button class="sub-btn" id="card-share-btn">シェア</button>` : ''}
        <button class="sub-btn" id="modal-close">閉じる</button>
      </div>
    </div>`;
  modal.classList.remove('hidden');

  // 単体カードの自慢シェア（所持カードのみ）
  const shareBtn = $('#card-share-btn');
  if (shareBtn) {
    shareBtn.onclick = async () => {
      const place = card.type === 'pref' ? regionOf(card.prefecture) : card.prefecture;
      const image = await buildShareImage({
        title: `${card.rarity}『${card.name}』`,
        sub: `${card.reading} ─ ${place}`,
        rows: [{ cards: [shareCardEntry(card)] }],
      });
      shareAndReward(`「地域カードバトル」で ${card.rarity}『${card.name}』をゲット！ 攻${fmt(card.attack)}／防${fmt(card.defense)}`, { image });
    };
  }

  // マウス／指なぞり追従の3Dチルト＋グレア（実物のキラカードを傾ける感覚）
  // Pointer Eventsでマウスとタッチを共通処理。タッチはpointerdown後にmoveが飛んでくる
  const tilt = $('#viewer-tilt');
  const applyTilt = (x, y) => {   // x, y: カード上の位置 0〜1
    tilt.style.transform = `rotateY(${((x - .5) * 16).toFixed(1)}deg) rotateX(${((.5 - y) * 13).toFixed(1)}deg)`;
    tilt.style.setProperty('--gx', `${(x * 100).toFixed(1)}%`);
    tilt.style.setProperty('--gy', `${(y * 100).toFixed(1)}%`);
    tilt.classList.add('tilting');
  };
  const resetTilt = () => {
    tilt.style.transform = '';
    tilt.classList.remove('tilting');
  };
  const fromPointer = (e) => {
    const r = tilt.getBoundingClientRect();
    applyTilt(
      Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)),
      Math.max(0, Math.min(1, (e.clientY - r.top) / r.height)));
  };
  let touching = false;
  tilt.onpointerdown = (e) => {
    touching = true;
    tilt.setPointerCapture(e.pointerId);  // 指がカード外に出ても追従を続ける
    fromPointer(e);
  };
  tilt.onpointermove = fromPointer;
  tilt.onpointerup = tilt.onpointercancel = () => { touching = false; resetTilt(); };
  tilt.onpointerleave = () => { if (!touching) resetTilt(); };

  // スマホ: 端末の傾き（ジャイロ）でもチルト。開いた瞬間の持ち角度を基準に±30度でフルチルト。
  // 指なぞり操作中はそちらを優先する
  let gyroBase = null;
  const onOrient = (ev) => {
    if (touching || ev.beta == null || ev.gamma == null) return;
    if (!gyroBase) gyroBase = { beta: ev.beta, gamma: ev.gamma };
    applyTilt(
      Math.max(0, Math.min(1, .5 + (ev.gamma - gyroBase.gamma) / 60)),
      Math.max(0, Math.min(1, .5 + (ev.beta - gyroBase.beta) / 60)));
  };
  enableGyro(onOrient);

  const close = () => {
    modal.classList.add('hidden');
    window.removeEventListener('deviceorientation', onOrient);
  };
  $('#modal-close').onclick = close;
  modal.onclick = (e) => { if (e.target === modal) close(); };
}

// iOSはジャイロ利用にユーザー操作起点の許可が必要（初回のみダイアログが出る）。
// カード表示はタップから呼ばれるのでここで要求できる。拒否されたら指なぞりのみで動く
let gyroPermission = null;   // null=未確認 / 'granted' / 'denied'
function enableGyro(handler) {
  if (typeof DeviceOrientationEvent === 'undefined') return;
  if (typeof DeviceOrientationEvent.requestPermission !== 'function' || gyroPermission === 'granted') {
    window.addEventListener('deviceorientation', handler);
    return;
  }
  if (gyroPermission === 'denied') return;
  DeviceOrientationEvent.requestPermission().then(res => {
    gyroPermission = res;
    if (res === 'granted') window.addEventListener('deviceorientation', handler);
  }).catch(() => { gyroPermission = 'denied'; });
}

// ---------- 図鑑 ----------
function setupCollectionTab() {
  const regionSel = $('#filter-region');
  for (const region of Object.keys(REGIONS)) {
    const opt = document.createElement('option');
    opt.value = region;
    opt.textContent = region;
    regionSel.appendChild(opt);
  }
  regionSel.onchange = renderCollection;
  $('#filter-rarity').onchange = renderCollection;
  $('#filter-owned').onchange = renderCollection;
  // 検索は打鍵ごとに全再描画すると重いのでデバウンス
  let searchTimer;
  $('#filter-search').oninput = () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(renderCollection, 160);
  };
  $('#more-btn').onclick = () => renderMoreCollection();
}

const COLLECTION_PAGE = 120; // 一度に描画する枚数（1800枚一括描画は重いため段階表示）
let collectionList = [];
let collectionShown = 0;

function renderCollection() {
  const region = $('#filter-region').value;
  const rarity = $('#filter-rarity').value;
  const ownedOnly = $('#filter-owned').checked;
  const q = $('#filter-search').value.trim();

  let list = CARDS;
  if (region) list = list.filter(c => REGIONS[region].includes(c.prefecture));
  if (rarity) list = list.filter(c => c.rarity === rarity);
  if (ownedOnly) list = list.filter(c => S.ownedCount(c.id) > 0);
  if (q) list = list.filter(c =>
    c.name.includes(q) || c.reading.includes(q) || c.prefecture.includes(q));

  const ownedAll = CARDS.filter(c => S.ownedCount(c.id) > 0).length;
  const pct = Math.round((ownedAll / CARDS.length) * 100);
  $('#collection-stats').innerHTML =
    `全体 ${ownedAll}/${CARDS.length} (${pct}%)　表示中 ${list.filter(c => S.ownedCount(c.id) > 0).length}/${list.length}`;

  // レア度降順 → 都道府県順
  collectionList = [...list].sort((a, b) =>
    rarityIndex(b.rarity) - rarityIndex(a.rarity) || a.id.localeCompare(b.id));
  collectionShown = 0;
  $('#collection-grid').innerHTML = '';
  renderMoreCollection();
}

function renderMoreCollection() {
  const grid = $('#collection-grid');
  const st = S.getState();
  const slice = collectionList.slice(collectionShown, collectionShown + COLLECTION_PAGE);
  const frag = document.createDocumentFragment();
  for (const card of slice) {
    const owned = S.ownedCount(card.id) > 0;
    const cell = document.createElement('div');
    cell.className = 'coll-cell' + (owned ? '' : ' unowned');
    if (owned) {
      const isNew = st.newCards.includes(card.id);
      cell.innerHTML = cardHTML(card, true) + (isNew ? '<span class="new-badge corner">NEW</span>' : '');
      cell.onclick = () => { S.clearNew(card.id); showCardModal(card); cell.querySelector('.new-badge')?.remove(); };
    } else {
      cell.innerHTML = `
        <div class="game-card unknown rarity-${card.rarity.toLowerCase()}">
          <div class="card-head"><span class="rarity-gem gem-${card.rarity.toLowerCase()}">${card.rarity}</span></div>
          <div class="unknown-mark">？</div>
          <div class="card-pref">${icon('pin')}${card.prefecture}</div>
        </div>`;
    }
    frag.appendChild(cell);
  }
  grid.appendChild(frag);
  collectionShown += slice.length;
  const remaining = collectionList.length - collectionShown;
  const moreBtn = $('#more-btn');
  moreBtn.classList.toggle('hidden', remaining <= 0);
  if (remaining > 0) moreBtn.textContent = `もっと表示（あと${remaining}枚）`;
}

// ---------- シナジー ----------
function renderSynergyTab() {
  const listEl = $('#synergy-list');
  listEl.innerHTML = '';
  // 達成に近い順に並べる
  const rows = SYNERGIES.map(sy => {
    const tagCards = CARDS.filter(c => c.tags.includes(sy.tag));
    const ownedCards = tagCards.filter(c => S.ownedCount(c.id) > 0);
    const achieved = ownedCards.length >= sy.count;
    return { sy, tagCards, ownedCards, achieved };
  }).sort((a, b) => {
    if (a.achieved !== b.achieved) return a.achieved ? -1 : 1;
    return (b.ownedCards.length / b.sy.count) - (a.ownedCards.length / a.sy.count);
  });

  for (const { sy, tagCards, ownedCards, achieved } of rows) {
    const div = document.createElement('div');
    div.className = 'synergy-row' + (achieved ? ' achieved' : '');
    const progress = Math.min(ownedCards.length, sy.count);
    const chips = ownedCards.slice(0, 8).map(c => `<span class="tag-chip owned-chip">${c.name}</span>`).join('');
    div.innerHTML = `
      <div class="synergy-head">
        <span class="synergy-name">${achieved ? icon('sparkles') : icon('lock')}${sy.name}</span>
        <span class="synergy-mult">×${sy.multiplier.toFixed(1)}</span>
      </div>
      <div class="synergy-req">「${sy.tag}」タグ ${progress}/${sy.count}枚
        <span class="synergy-total">（全国に${tagCards.length}枚存在）</span></div>
      <div class="synergy-bar"><div class="synergy-bar-fill" style="width:${(progress / sy.count) * 100}%"></div></div>
      <div class="synergy-desc">${sy.description}</div>
      <div class="synergy-cards">${chips}${ownedCards.length > 8 ? `<span class="tag-chip">+${ownedCards.length - 8}</span>` : ''}</div>`;
    listEl.appendChild(div);
  }
}

// ---------- 対戦 ----------
let battleTimers = [];
let pendingResult = null; // {res, pA, cA} スキップ用

function schedule(fn, ms) { battleTimers.push(setTimeout(fn, ms)); }
function clearBattleTimers() { battleTimers.forEach(clearTimeout); battleTimers = []; }

function setupBattleTab() {
  $('#auto-deck-btn').onclick = () => {
    const owned = CARDS.filter(c => S.ownedCount(c.id) > 0);
    S.setDeck(B.autoBuildDeck(owned, SYNERGIES).map(c => c.id));
    renderBattleTab();
  };
  $('#clear-deck-btn').onclick = () => { S.setDeck([]); renderBattleTab(); };
  $('#pool-tag').onchange = renderBattleTab;
  $('#pool-more').onclick = renderMorePool;
  $('#start-battle-btn').onclick = () => startBattle();
  $('#copy-code-btn').onclick = () => {
    const code = deckCards().map(c => c.id).join('-');
    if (!code) return;
    navigator.clipboard?.writeText(code);
    $('#copy-code-btn').textContent = 'コピーした！';
    setTimeout(() => { $('#copy-code-btn').textContent = 'コピー'; }, 1200);
  };
  // デッキコードのシェア: デッキ画像＋開くと相手のコード欄に自動入力されるリンク（?vs=）
  $('#share-code-btn').onclick = async () => {
    const cards = deckCards();
    if (cards.length < B.DECK_SIZE) return;
    const code = cards.map(c => c.id).join('-');
    const power = B.analyzeDeck(cards, SYNERGIES).total;
    const image = await buildShareImage({
      title: '挑戦者求む！',
      sub: `戦闘力 ${fmt(power)}`,
      rows: [{ cards: cards.map(shareCardEntry) }],
      footer: `デッキコード: ${code}`,
    });
    shareAndReward(`「地域カードバトル」戦闘力${fmt(power)}のデッキで待ってるぞ！ コード: ${code}`,
      { url: shareUrl({ vs: code }), image });
  };
  $('#friend-battle-btn').onclick = () => {
    const ids = $('#friend-code').value.trim().split(/[-,\s]+/).filter(Boolean);
    const deck = ids.map(id => CARDS.find(c => c.id === id.toUpperCase())).filter(Boolean);
    if (deck.length !== B.DECK_SIZE || new Set(deck).size !== B.DECK_SIZE) {
      $('#friend-code').value = '';
      $('#friend-code').placeholder = 'コードが不正です（例: P13-C128-S01-C045-C206）';
      return;
    }
    startBattle({ cpuDeck: deck, label: 'フレンド' });
  };
  $('#battle-skip-btn').onclick = () => {
    if (!pendingResult) return;
    clearBattleTimers();
    $('#battle-fx').innerHTML = '';
    $('#vs-intro').classList.add('hidden');
    showBattleResult();
  };
  $('#battle-close-btn').onclick = () => {
    $('#battle-overlay').classList.add('hidden');
    renderBattleTab();
    renderPackInfo();
    showInterstitial('battle-close');
  };
  $('#battle-again-btn').onclick = () => startBattle(lastBattleOpts);
  $('#battle-ad-btn').onclick = showAd;
}

// ---------- 全国制覇（47都道府県の主） ----------
function renderConquest() {
  const done = new Set(S.getState().defeatedBosses);
  const next = BOSSES.find(b => !done.has(b.pref));
  $('#conquest-progress').innerHTML =
    `撃破 <b>${done.size}</b> / ${BOSSES.length}${done.size === BOSSES.length ? '　全国制覇達成！' : ''}`;
  const grid = $('#conquest-grid');
  grid.innerHTML = '';
  for (const boss of BOSSES) {
    const status = done.has(boss.pref) ? 'done' : (boss === next ? 'open' : 'locked');
    const btn = document.createElement('button');
    btn.className = `boss-chip ${status}`;
    btn.disabled = status === 'locked';
    btn.innerHTML = `
      ${icon(status === 'done' ? 'check' : status === 'open' ? 'sword' : 'lock')}
      <span class="boss-name">${boss.name}</span>
      <span class="boss-power">${status === 'done' ? fmt(boss.power) : '？？？'}</span>`;
    if (status !== 'locked') {
      btn.onclick = () => {
        if (deckCards().length < B.DECK_SIZE) {
          $('#battle-hint').textContent = '先にデッキを5枚組もう！';
          return;
        }
        startBattle({ cpuDeck: boss.deck, label: boss.name, bossPref: boss.pref });
      };
    }
    grid.appendChild(btn);
  }
}

function deckCards() {
  // 所持していないidはデッキから除外（リセット等への保険）
  return S.getState().deck
    .map(id => CARDS.find(c => c.id === id))
    .filter(c => c && S.ownedCount(c.id) > 0);
}

function miniCardHTML(card, extra = '') {
  // 写真は240pxサムネ＋遅延読み込み（フル解像度やCSS背景方式は一覧では重い）
  const img = IMAGES.get(card.id);
  const art = img ? artImg(card, true).replace('<img ', '<img class="mini-art" ') : '';
  return `
    <div class="mini-card rarity-${card.rarity.toLowerCase()} ${extra}" data-id="${card.id}">
      ${art}
      <span class="mini-rarity gem-${card.rarity.toLowerCase()}">${card.rarity}</span>
      <span class="mini-name">${card.name}</span>
      <span class="mini-stats">
        <span class="stat-a">${icon('sword')}${fmt(card.attack)}</span>
        <span class="stat-d">${icon('shield')}${fmt(card.defense)}</span>
      </span>
    </div>`;
}

function renderBattleTab() {
  const st = S.getState();
  $('#battle-stats').innerHTML = `
    <span>${icon('sword')}戦績 ${st.wins}勝 / ${st.battles}戦</span>
    <span class="streak">連勝中 <b>${st.winStreak}</b></span>
    <span>最高 ${st.bestStreak}連勝</span>
    <span>${icon('gift')}チケット ${st.tickets}枚</span>`;

  const owned = CARDS.filter(c => S.ownedCount(c.id) > 0);
  const deck = deckCards();

  // デッキ分析（戦闘力・発動シナジー・リーチ）
  const analysisEl = $('#deck-analysis');
  const a = deck.length ? B.analyzeDeck(deck, SYNERGIES) : null;
  if (!a) {
    analysisEl.innerHTML = '';
  } else {
    const synChips = a.active.length
      ? a.active.map(x => `<span class="syn-chip on" title="${x.description}">${icon('sparkles')}${x.name} ×${x.multiplier.toFixed(1)}</span>`).join('')
      : '<span class="syn-none">発動シナジーなし — 同じタグを集めよう</span>';
    const reachList = a.nearMiss.slice(0, 3);
    const reach = reachList.length
      ? `<div class="reach-line">${icon('lock')}あと1枚:
          ${reachList.map(sy => `<span class="reach-item">${sy.name}<i>「${sy.tag}」×${sy.multiplier.toFixed(1)}</i></span>`).join('')}
          ${a.nearMiss.length > 3 ? `<span class="reach-item">ほか${a.nearMiss.length - 3}件</span>` : ''}</div>`
      : '';
    analysisEl.innerHTML = `
      <div class="analysis-grid">
        <div class="power-block">
          <span class="p-label">戦闘力</span>
          <b>${fmt(a.total)}</b>
          <span class="p-parts">攻撃 ${fmt(a.atk)}<br>防御 ${fmt(a.def)}</span>
        </div>
        <div class="syn-block">
          <div class="deck-syns">${synChips}</div>
          ${reach}
        </div>
      </div>`;
  }

  // デッキスロット（適用倍率バッジ付き）
  const slots = $('#deck-slots');
  slots.innerHTML = '';
  for (let i = 0; i < B.DECK_SIZE; i++) {
    const card = deck[i];
    const div = document.createElement('div');
    div.className = 'deck-slot' + (card ? '' : ' empty');
    if (card) {
      const mult = a.cards[i].mult;
      div.innerHTML = miniCardHTML(card) +
        (mult > 1 ? `<span class="mult-badge">×${mult >= 10 ? Math.round(mult) : mult.toFixed(1)}</span>` : '');
      div.onclick = () => { S.setDeck(deck.filter(c => c !== card).map(c => c.id)); renderBattleTab(); };
    } else {
      div.innerHTML = '<span class="slot-plus">＋</span>';
    }
    slots.appendChild(div);
  }

  const startBtn = $('#start-battle-btn');
  startBtn.disabled = deck.length < B.DECK_SIZE;
  $('#battle-hint').textContent =
    owned.length < B.DECK_SIZE ? `対戦にはカードが${B.DECK_SIZE}枚必要。まずパックを開けよう！`
    : deck.length < B.DECK_SIZE ? `あと${B.DECK_SIZE - deck.length}枚選ぼう（同タグを固めるとシナジー発動）`
    : '';

  // タグ絞り込みプルダウン（所持枚数が変わったときだけ作り直す）
  const tagSel = $('#pool-tag');
  if (tagSel.dataset.ownedCount !== String(owned.length)) {
    const prevTag = tagSel.value;
    const tagCounts = {};
    owned.forEach(c => c.tags.forEach(t => { tagCounts[t] = (tagCounts[t] || 0) + 1; }));
    tagSel.innerHTML = '<option value="">全タグ</option>' +
      Object.entries(tagCounts).sort((x, y) => y[1] - x[1])
        .map(([t, n]) => `<option value="${t}">${t}（${n}枚）</option>`).join('');
    tagSel.value = [...tagSel.options].some(o => o.value === prevTag) ? prevTag : '';
    tagSel.dataset.ownedCount = String(owned.length);
  }

  // 所持カードプール
  // デッキが1〜4枚のときは「追加したときの戦闘力上昇値」を計算してバッジ表示＆上昇値順ソート
  const reachTags = new Set((a ? a.nearMiss : []).map(sy => sy.tag));
  const canAdd = deck.length > 0 && deck.length < B.DECK_SIZE;
  const baseTotal = a ? a.total : 0;
  let list = owned.filter(c => !tagSel.value || c.tags.includes(tagSel.value));
  let entries = list.map(card => {
    const inDeck = deck.some(c => c.id === card.id);
    const delta = (canAdd && !inDeck)
      ? B.analyzeDeck([...deck, card], SYNERGIES).total - baseTotal
      : null;
    return { card, inDeck, delta };
  });
  entries.sort((x, y) => canAdd
    ? (y.delta ?? -1) - (x.delta ?? -1)
    : rarityIndex(y.card.rarity) - rarityIndex(x.card.rarity) || y.card.attack - x.card.attack);

  $('#pool-head-label').textContent =
    `所持カード ${owned.length}枚（${canAdd ? '追加時の戦闘力上昇順' : 'タップでデッキに入れる'}）`;

  poolEntries = entries;
  poolReachTags = reachTags;
  poolCanRemove = true;
  poolShown = 0;
  $('#deck-pool').innerHTML = '';
  renderMorePool();

  renderConquest();
  $('#my-deck-code').textContent = deck.length === B.DECK_SIZE
    ? deck.map(c => c.id).join('-')
    : 'デッキを5枚組むと表示されます';
  $('#share-code-btn').classList.toggle('hidden', deck.length !== B.DECK_SIZE);
  $('#copy-code-btn').classList.toggle('hidden', deck.length !== B.DECK_SIZE);
}

// プールも段階表示（全所持カードの一括DOM構築は重いため）
const POOL_PAGE = 60;
let poolEntries = [], poolReachTags = new Set(), poolShown = 0, poolCanRemove = true;

function renderMorePool() {
  const pool = $('#deck-pool');
  const deckLen = deckCards().length;
  const frag = document.createDocumentFragment();
  for (const { card, inDeck, delta } of poolEntries.slice(poolShown, poolShown + POOL_PAGE)) {
    const isReach = !inDeck && deckLen < B.DECK_SIZE && card.tags.some(t => poolReachTags.has(t));
    const div = document.createElement('div');
    div.className = 'pool-cell';
    div.innerHTML = miniCardHTML(card, (inDeck ? 'in-deck' : '') + (isReach ? ' reach-hit' : '')) +
      (delta != null ? `<span class="delta-badge">+${fmt(delta)}</span>` : '');
    div.onclick = () => {
      const cur = deckCards();
      if (inDeck) S.setDeck(cur.filter(c => c.id !== card.id).map(c => c.id));
      else if (cur.length < B.DECK_SIZE) S.setDeck([...cur.map(c => c.id), card.id]);
      renderBattleTab();
    };
    frag.appendChild(div);
  }
  pool.appendChild(frag);
  poolShown = Math.min(poolShown + POOL_PAGE, poolEntries.length);
  const remaining = poolEntries.length - poolShown;
  const btn = $('#pool-more');
  btn.classList.toggle('hidden', remaining <= 0);
  if (remaining > 0) btn.textContent = `もっと表示（あと${remaining}枚）`;
}

let lastBattleOpts = undefined;

function startBattle(opts = {}) {
  const pDeck = deckCards();
  if (pDeck.length < B.DECK_SIZE) return;
  track('battle_start', { mode: opts.bossPref ? 'boss' : opts.cpuDeck ? 'friend' : 'cpu' });
  lastBattleOpts = opts;
  const cDeck = opts.cpuDeck || B.buildCpuDeck(CARDS, pDeck, SYNERGIES);
  const pA = B.analyzeDeck(pDeck, SYNERGIES);
  const cA = B.analyzeDeck(cDeck, SYNERGIES);
  const res = B.resolveBattle(pA, cA);
  pendingResult = { res, pA, cA, opts, recorded: false };
  const oppName = opts.label || 'CPU';
  document.querySelector('.battle-board .side-tag:not(.you)').textContent = oppName;
  document.querySelector('.power-box.cpu .power-side').textContent = oppName;

  clearBattleTimers();
  $('#battle-overlay').classList.remove('hidden');
  $('#stage-battle').classList.remove('hidden');
  $('#stage-battle-result').classList.add('hidden');
  $('#syn-banner').innerHTML = '';
  $('#battle-fx').innerHTML = '';
  $('#cpu-power').textContent = '???';
  $('#player-power').textContent = '???';
  $('#cpu-power-detail').textContent = '';
  $('#player-power-detail').textContent = '';
  document.querySelectorAll('.power-box').forEach(b => b.classList.remove('win'));
  document.querySelectorAll('.showdown-row').forEach(r => r.classList.remove('lose'));

  // デッキ展開（CPU上段・自分下段）。VS演出の背後でカードが並んでいく
  renderShowdownRow('#cpu-deck-row', cDeck);
  renderShowdownRow('#player-deck-row', pDeck);

  // VS入場演出: 両者の名前が左右から飛び込んで激突する
  const intro = $('#vs-intro');
  $('#vs-intro-cpu').textContent = oppName;
  intro.classList.add('hidden');
  void intro.offsetWidth;   // displayを一度切ってアニメーションを毎回再生する
  intro.classList.remove('hidden');
  schedule(() => {
    flashScreen('white', 110);
    boardShake(true);
    const c = fxPoint(intro);
    spawnRing(c.x, c.y);
  }, 480);
  schedule(() => intro.classList.add('hidden'), 1450);

  // 演出シーケンス: VS → シナジー発動(CPU→自分) → 攻撃の応酬 → 防御ボーナス → 勝敗
  // シナジーが多い時に全部見せると1分超えになるため、
  // 5個以上は「◯連鎖」まとめバナー＋倍率上位3件のみに圧縮する（倍率の低い順で盛り上げる）
  const bannersFor = (analysis) => {
    const act = [...analysis.active].sort((a, b) => a.multiplier - b.multiplier);
    return act.length <= 4 ? { chain: 0, picks: act } : { chain: act.length, picks: act.slice(-3) };
  };
  let t = 1650;
  for (const side of ['cpu', 'player']) {
    const { chain, picks } = bannersFor(side === 'cpu' ? cA : pA);
    if (chain) {
      schedule(() => fireChain(side, chain), t);
      t += 1250;
    }
    for (const a of picks) {
      schedule(() => fireSynergy(side, a), t);
      t += 1250;
    }
  }

  // 攻撃の応酬: 両デッキが正面のカードへ交互に切りかかり、戦闘力が1撃ずつ積み上がる
  schedule(() => {
    $('#syn-banner').innerHTML = '';
    document.querySelectorAll('.showdown-card.syn-now').forEach(el => el.classList.remove('syn-now'));
    $('#cpu-power').textContent = '0';
    $('#player-power').textContent = '0';
  }, t);
  t += 250;
  const maxHit = Math.max(1, ...pA.cards.map(x => x.power), ...cA.cards.map(x => x.power));
  let pSum = 0, cSum = 0;
  for (let i = 0; i < B.DECK_SIZE; i++) {
    for (const side of ['c', 'p']) {
      const entry = (side === 'p' ? pA : cA).cards[i];
      if (!entry) continue;
      const from = side === 'p' ? pSum : cSum;
      const to = from + entry.power;
      if (side === 'p') pSum = to; else cSum = to;
      schedule(() => performAttack(side, i, entry, from, to, entry.power / maxHit), t);
      t += 420;
    }
  }
  t += 200;
  schedule(() => {
    addDefenseBonus('c', cSum, cA);
    addDefenseBonus('p', pSum, pA);
  }, t);
  t += 1100;
  schedule(() => revealWinner(res), t);
  t += 1700;
  schedule(() => showBattleResult(), t);
}

/**
 * 1枚が相手デッキの正面のカードへ切りかかる攻撃演出。
 * weight=デッキ内の威力比(0〜1)。エース級(0.5以上)は大技扱いで斬撃2連＋画面フラッシュが付く。
 */
function performAttack(side, idx, entry, from, to, weight) {
  const heavy = weight >= 0.5;
  const atkRow = side === 'p' ? '#player-deck-row' : '#cpu-deck-row';
  const defRow = side === 'p' ? '#cpu-deck-row' : '#player-deck-row';
  const attacker = document.querySelectorAll(`${atkRow} .showdown-card`)[idx];
  const targets = document.querySelectorAll(`${defRow} .showdown-card`);
  const target = targets[idx] || targets[0];
  if (!attacker || !target) return;
  attacker.style.animationDelay = '0s';   // デッキ展開時のディレイが残っていると突進が遅れる
  attacker.classList.remove('lunge-p', 'lunge-c');
  void attacker.offsetWidth;
  attacker.classList.add(side === 'p' ? 'lunge-p' : 'lunge-c');
  // 踏み込みがぶつかる瞬間に合わせてヒット演出を出す
  schedule(() => {
    const { x, y } = fxPoint(target);
    spawnSlash(x, y, side, heavy);
    spawnSparks(x, y, side, heavy ? 16 : 9);
    target.classList.remove('hit');
    void target.offsetWidth;
    target.classList.add('hit');
    damagePop(x, y, entry, side, heavy);
    boardShake(heavy);
    if (heavy) flashScreen(side === 'p' ? 'gold' : 'purple', 120);
    tickPower(side === 'p' ? '#player-power' : '#cpu-power', from, to, 280);
  }, 150);
}

/** 攻撃応酬の締め: 防御ボーナスを積んで最終戦闘力に到達させる */
function addDefenseBonus(side, atkSum, analysis) {
  const box = document.querySelector(side === 'p' ? '.power-box.player' : '.power-box.cpu');
  const { x, y } = fxPoint(box);
  const el = document.createElement('div');
  el.className = `fx-dmg ${side === 'p' ? 'fx-gold' : 'fx-purple'}`;
  el.style.left = `${x}px`;
  el.style.top = `${y - 34}px`;
  el.textContent = `防御 +${fmt(analysis.def)}`;
  $('#battle-fx').appendChild(el);
  setTimeout(() => el.remove(), 1100);
  tickPower(side === 'p' ? '#player-power' : '#cpu-power', atkSum, analysis.total, 600);
  $(side === 'p' ? '#player-power-detail' : '#cpu-power-detail').textContent =
    `攻撃 ${fmt(analysis.atk)} ＋ 防御 ${fmt(analysis.def)}`;
}

function renderShowdownRow(sel, deck) {
  $(sel).innerHTML = deck.map((c, i) =>
    `<div class="showdown-card" data-tags="${c.tags.join('|')}" style="animation-delay:${i * 0.1}s">
      ${cardHTML(c, true)}
    </div>`).join('');
}

// シナジー多重発動のまとめ演出: 「◯連鎖」バナー＋その側の全カードが一斉に浮き上がる
function fireChain(side, n) {
  const banner = $('#syn-banner');
  banner.innerHTML = `
    <div class="syn-banner-inner ${side}-b">
      ${icon('sparkles')}
      <span class="syn-b-name">シナジー${n}連鎖</span>
      <span class="syn-b-sub">${side === 'player' ? 'あなた' : 'CPU'}／一斉発動</span>
    </div>`;
  document.querySelectorAll('.showdown-card.syn-now').forEach(el => el.classList.remove('syn-now'));
  const row = side === 'player' ? '#player-deck-row' : '#cpu-deck-row';
  document.querySelectorAll(`${row} .showdown-card`).forEach(el => {
    el.classList.add(side === 'player' ? 'glow-p' : 'glow-c');
    void el.offsetWidth;
    el.classList.add('syn-now');
  });
  flashScreen(side === 'player' ? 'gold' : 'purple', 220);
  const c = fxPoint(banner);
  spawnRing(c.x, c.y);
  boardShake(false);
}

// シナジー発動演出: バナー表示＋発動した「組」のカードが浮き上がって強調される
function fireSynergy(side, syn) {
  const banner = $('#syn-banner');
  banner.innerHTML = `
    <div class="syn-banner-inner ${side}-b">
      ${icon('sparkles')}
      <span class="syn-b-name">${syn.name}</span>
      <span class="syn-b-mult">×${syn.multiplier.toFixed(1)}</span>
      <span class="syn-b-sub">${side === 'player' ? 'あなた' : 'CPU'}／「${syn.tag}」${syn.matched}枚</span>
    </div>`;
  // 前のシナジーの強調を解除（発動済みの淡い光 glow-p/glow-c は残す）
  document.querySelectorAll('.showdown-card.syn-now').forEach(el => el.classList.remove('syn-now'));
  const row = side === 'player' ? '#player-deck-row' : '#cpu-deck-row';
  document.querySelectorAll(`${row} .showdown-card`).forEach(el => {
    if (el.dataset.tags.split('|').includes(syn.tag)) {
      el.classList.add(side === 'player' ? 'glow-p' : 'glow-c');
      void el.offsetWidth;   // 連続発動でもポップアニメを再生させるためのリフロー
      el.classList.add('syn-now');
    }
  });
  flashScreen(side === 'player' ? 'gold' : 'purple', 220);
  const c = fxPoint(banner);
  spawnRing(c.x, c.y);
  boardShake(false);
}

/** 戦闘力表示を from→to にカウントし、跳ねさせる */
function tickPower(sel, from, to, ms) {
  const el = $(sel);
  el.classList.remove('bump');
  void el.offsetWidth;
  el.classList.add('bump');
  const start = performance.now();
  const tick = (now) => {
    const k = Math.min(1, (now - start) / ms);
    el.textContent = fmt(Math.round(from + (to - from) * (1 - Math.pow(1 - k, 3))));
    if (k < 1) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

function revealWinner(res) {
  const c = fxPoint($('#vs-mark'));
  spawnRing(c.x, c.y);
  boardShake(true);
  if (res.winner === 'p') {
    $('.power-box.player').classList.add('win');
    blowAway('#cpu-deck-row', -1);
    document.querySelectorAll('#player-deck-row .showdown-card').forEach((el, i) => {
      el.style.animationDelay = `${i * 0.07}s`;
      el.classList.add('victory');
    });
    spawnSparks(c.x, c.y, 'p', 18);
    flashScreen('rainbow', 500);
    document.body.classList.add('shake');
    setTimeout(() => document.body.classList.remove('shake'), 600);
  } else if (res.winner === 'c') {
    $('.power-box.cpu').classList.add('win');
    blowAway('#player-deck-row', 1);
    spawnSparks(c.x, c.y, 'c', 18);
    flashScreen('purple', 500);
  }
}

/** 敗者のデッキが吹き飛ばされて散る。dir=-1で上（CPU側の奥）、1で下（自分側の手前）へ */
function blowAway(rowSel, dir) {
  $(rowSel).classList.add('lose');
  document.querySelectorAll(`${rowSel} .showdown-card`).forEach((el, i) => {
    el.style.setProperty('--fly-x', `${(Math.random() - 0.5) * 220}px`);
    el.style.setProperty('--fly-y', `${dir * (70 + Math.random() * 90)}px`);
    el.style.setProperty('--fly-r', `${(Math.random() - 0.5) * 50}deg`);
    el.style.animationDelay = `${i * 0.05}s`;
    el.classList.add('blown');
  });
}

// ---------- 戦闘エフェクト（#battle-fx 内に使い捨てDOMを生成する） ----------
/** 要素の中心座標をエフェクト層基準で返す */
function fxPoint(el) {
  const fx = $('#battle-fx').getBoundingClientRect();
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2 - fx.left, y: r.top + r.height / 2 - fx.top };
}

/** 火花: n個の粒がランダム方向へ飛び散る */
function spawnSparks(x, y, side, n) {
  const wrap = document.createElement('div');
  wrap.className = `fx-sparks ${side === 'p' ? 'fx-gold' : 'fx-purple'}`;
  wrap.style.left = `${x}px`;
  wrap.style.top = `${y}px`;
  for (let i = 0; i < n; i++) {
    const s = document.createElement('i');
    const ang = Math.random() * Math.PI * 2;
    const dist = 34 + Math.random() * 66;
    s.style.setProperty('--dx', `${Math.cos(ang) * dist}px`);
    s.style.setProperty('--dy', `${Math.sin(ang) * dist}px`);
    s.style.animationDelay = `${Math.random() * 70}ms`;
    wrap.appendChild(s);
  }
  $('#battle-fx').appendChild(wrap);
  setTimeout(() => wrap.remove(), 900);
}

/** 斬撃の軌跡。double=trueで交差する2連斬り */
function spawnSlash(x, y, side, double) {
  const mk = (rot) => {
    const el = document.createElement('div');
    el.className = `fx-slash ${side === 'p' ? 'fx-gold' : 'fx-purple'}`;
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
    el.style.setProperty('--rot', `${rot}deg`);
    $('#battle-fx').appendChild(el);
    setTimeout(() => el.remove(), 600);
  };
  mk(-30 - Math.random() * 25);
  if (double) setTimeout(() => mk(25 + Math.random() * 25), 90);
}

/** 衝撃波リング */
function spawnRing(x, y) {
  const el = document.createElement('div');
  el.className = 'fx-ring';
  el.style.left = `${x}px`;
  el.style.top = `${y}px`;
  $('#battle-fx').appendChild(el);
  setTimeout(() => el.remove(), 700);
}

/** ダメージ数字のポップ。シナジー倍率が乗ったカードは倍率も添える */
function damagePop(x, y, entry, side, heavy) {
  // 端のカードでも数字が盤面から見切れないように内側へ寄せる
  const half = heavy ? 100 : 70;
  x = Math.min(Math.max(x, half), $('#battle-fx').clientWidth - half);
  const el = document.createElement('div');
  el.className = `fx-dmg ${side === 'p' ? 'fx-gold' : 'fx-purple'}${heavy ? ' heavy' : ''}`;
  el.style.left = `${x}px`;
  el.style.top = `${y - 16}px`;
  el.innerHTML = entry.mult > 1 ? `${fmt(entry.power)}<i>×${entry.mult}</i>` : fmt(entry.power);
  $('#battle-fx').appendChild(el);
  setTimeout(() => el.remove(), 1100);
}

/** 盤面を揺らす（heavy=大技・激突時の強い揺れ） */
function boardShake(heavy) {
  const b = document.querySelector('.battle-board');
  if (!b) return;
  b.classList.remove('shake-sm', 'shake-lg');
  void b.offsetWidth;
  b.classList.add(heavy ? 'shake-lg' : 'shake-sm');
}

function showBattleResult() {
  if (!pendingResult || pendingResult.recorded) return;
  pendingResult.recorded = true;
  const { res, pA, cA, opts } = pendingResult;
  const result = res.winner === 'p' ? 'win' : res.winner === 'c' ? 'lose' : 'draw';
  const streak = S.recordBattle(result);
  // ボス初撃破の報酬（チケットが手に入るのは全国制覇のここだけ。通常CPU戦・フレンド戦は0枚）
  let bossLine = '';
  if (opts?.bossPref && result === 'win') {
    const bossGained = S.recordBossDefeat(opts.bossPref);   // null=撃破済み / 0以上=初撃破の獲得チケット
    const count = S.getState().defeatedBosses.length;
    if (bossGained === null) {
      bossLine = `<div class="next-reward">${opts.label}に勝利（撃破済み）</div>`;
    } else {
      bossLine = `<div class="reward-line">${icon('check')}${opts.label}を撃破！（${count}/${BOSSES.length}）${bossGained > 0 ? `チケット <b>+${bossGained}</b>枚` : ''}</div>`;
      if (count === BOSSES.length) {
        bossLine += `<div class="reward-line">${icon('sparkles')}全国制覇達成！！</div>`;
      } else if (bossGained === 0) {
        bossLine += `<div class="next-reward">あと${5 - count % 5}体撃破でチケット+2</div>`;
      }
    }
  }
  const st = S.getState();
  const oppName = opts?.label || 'CPU';

  const title = $('#battle-result-title');
  title.textContent = result === 'win' ? `WIN！` : result === 'lose' ? 'LOSE…' : 'DRAW';
  title.className = `result-${result}`;
  if (result === 'win') flashScreen('gold', 700);

  // 通常CPU戦・フレンド戦は報酬なし。チケットが欲しいなら全国制覇へ、という導線を出す
  const nextBossName = BOSSES.find(b => !new Set(st.defeatedBosses).has(b.pref))?.name;
  $('#battle-result-body').innerHTML = `
    <p class="result-sub">${result !== 'draw' ? `${res.tier}！ ` : ''}戦闘力 あなた <b>${fmt(pA.total)}</b> − <b>${fmt(cA.total)}</b> ${oppName}</p>
    <div class="result-streak">
      ${bossLine}
      <div>連勝: <b>${streak}</b>（最高 ${st.bestStreak}）</div>
      ${!opts?.bossPref && nextBossName
        ? `<div class="next-reward">チケットは全国制覇でもらえる — 次は${nextBossName}</div>` : ''}
    </div>`;
  updateBattleAdBtn();

  // 対戦結果のシェア文面（ボス撃破 > 連勝 > 通常勝利 > 敗北 の順で自慢度が高いものを出す）
  const shareText = (() => {
    if (result === 'win' && opts?.bossPref) {
      return `「地域カードバトル」で${opts.label}を撃破！（全国制覇 ${S.getState().defeatedBosses.length}/${BOSSES.length}）`;
    }
    if (result === 'win') {
      const streakNote = streak >= 3 ? ` ただいま${streak}連勝中！` : '';
      return `「地域カードバトル」戦闘力${fmt(pA.total)}で${res.tier}！${streakNote}`;
    }
    return `「地域カードバトル」戦闘力${fmt(pA.total)}で挑むも敗北…誰かリベンジ手伝って`;
  })();
  // シェア画像: 両者のデッキ5枚ずつを並べ、負けた側を暗く落とす
  $('#battle-share-btn').onclick = async () => {
    const image = await buildShareImage({
      title: result === 'win' ? 'WIN！' : result === 'lose' ? 'LOSE…' : 'DRAW',
      sub: `戦闘力 あなた ${fmt(pA.total)} − ${fmt(cA.total)} ${oppName}`,
      rows: [
        { label: oppName, labelColor: '#c9a3f5', dim: result === 'win', cards: cA.cards.map(x => shareCardEntry(x.card)) },
        { label: 'あなた', labelColor: '#f2c14e', dim: result === 'lose', cards: pA.cards.map(x => shareCardEntry(x.card)) },
      ],
    });
    shareAndReward(shareText, { image });
  };
  // 結果画面の主ボタンを文脈に合わせる:
  // ボス勝利→次の主へ / ボス敗北→ガチャに誘導 / それ以外→もう一戦
  const againBtn = $('#battle-again-btn');
  againBtn.classList.remove('hidden');
  if (opts?.bossPref) {
    if (result === 'win') {
      const done = new Set(S.getState().defeatedBosses);
      const nextBoss = BOSSES.find(b => !done.has(b.pref));
      if (nextBoss) {
        againBtn.innerHTML = `${icon('sword')}${nextBoss.name}に挑む`;
        againBtn.onclick = () => startBattle({ cpuDeck: nextBoss.deck, label: nextBoss.name, bossPref: nextBoss.pref });
      } else {
        againBtn.classList.add('hidden');   // 全国制覇達成
      }
    } else {
      againBtn.innerHTML = `${icon('gift')}パックを引いて強化する`;
      againBtn.onclick = () => {
        $('#battle-overlay').classList.add('hidden');
        renderBattleTab();
        renderPackInfo();
        document.querySelector('.tab-btn[data-tab="pack"]').click();
      };
    }
  } else {
    againBtn.textContent = 'もう一戦';
    againBtn.onclick = () => startBattle(lastBattleOpts);
  }

  $('#stage-battle').classList.add('hidden');
  $('#stage-battle-result').classList.remove('hidden');
}

// ---------- 演出 ----------
function flashScreen(kind, ms) {
  const f = $('#flash');
  f.className = `flash-${kind}`;
  f.style.opacity = '1';
  setTimeout(() => {
    f.style.opacity = '0';
    setTimeout(() => { f.className = ''; }, 300);
  }, ms);
}

init();
