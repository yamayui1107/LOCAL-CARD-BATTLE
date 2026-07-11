// セーブデータ管理（localStorage）
const KEY = 'jimoto-card-v1';

export const STAMINA_MAX = 10;
export const PACK_COST = 2;
export const REGEN_MS = 2 * 60 * 1000;      // 1スタミナ回復にかかる時間（待ち時間で離脱されないよう短め）
export const AD_COOLDOWN_MS = 0;   // 広告は見てくれるなら何回でもOKの方針
export const PITY_THRESHOLD = 20;            // このパック数SSR以上が出なければ次パックで確定

const defaults = () => ({
  homePref: null,
  collection: {},        // cardId -> 所持枚数
  newCards: [],          // 未確認のNEWカードid
  stamina: STAMINA_MAX,
  staminaUpdatedAt: Date.now(),
  packsOpened: 0,
  totalDraws: 0,         // 通算ドロー枚数（10枚ごとSR確定の判定用）
  pitySinceSSR: 0,
  adLastAt: 0,
  deck: [],              // 対戦デッキ（cardId×5）
  defeatedBosses: [],    // 全国制覇: 撃破済みの主（都道府県名）
  tickets: 0,            // パックチケット（スタミナ不要で開封）
  winStreak: 0,
  bestStreak: 0,
  wins: 0,
  battles: 0,
});

let state = load();

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return defaults();
    return { ...defaults(), ...JSON.parse(raw) };
  } catch {
    return defaults();
  }
}

export function save() {
  localStorage.setItem(KEY, JSON.stringify(state));
}

export function getState() {
  return state;
}

export function resetAll() {
  state = defaults();
  save();
}

// --- スタミナ ---
// 経過時間ぶんの回復を反映してから返す
export function getStamina() {
  const now = Date.now();
  if (state.stamina >= STAMINA_MAX) {
    state.staminaUpdatedAt = now;
    return state.stamina;
  }
  const elapsed = now - state.staminaUpdatedAt;
  const recovered = Math.floor(elapsed / REGEN_MS);
  if (recovered > 0) {
    state.stamina = Math.min(STAMINA_MAX, state.stamina + recovered);
    state.staminaUpdatedAt = state.stamina >= STAMINA_MAX ? now : state.staminaUpdatedAt + recovered * REGEN_MS;
    save();
  }
  return state.stamina;
}

// 次の1スタミナ回復までの残りms（満タンならnull）
export function msToNextStamina() {
  if (getStamina() >= STAMINA_MAX) return null;
  return REGEN_MS - (Date.now() - state.staminaUpdatedAt);
}

export function spendStamina(n) {
  if (getStamina() < n) return false;
  if (state.stamina >= STAMINA_MAX) state.staminaUpdatedAt = Date.now();
  state.stamina -= n;
  save();
  return true;
}

export function addStamina(n) {
  state.stamina = Math.min(STAMINA_MAX, getStamina() + n);
  save();
}

// --- 広告 ---
export function adAvailableInMs() {
  const remain = AD_COOLDOWN_MS - (Date.now() - state.adLastAt);
  return Math.max(0, remain);
}

export function watchAd() {
  state.adLastAt = Date.now();
  state.stamina = STAMINA_MAX;   // 広告視聴で全回復
  state.staminaUpdatedAt = Date.now();
  save();
}

// --- コレクション ---
export function ownedCount(cardId) {
  return state.collection[cardId] || 0;
}

export function addCards(cards) {
  const news = [];
  for (const c of cards) {
    if (!state.collection[c.id]) {
      news.push(c.id);
      state.newCards.push(c.id);
    }
    state.collection[c.id] = (state.collection[c.id] || 0) + 1;
  }
  save();
  return news; // 初入手のカードid
}

export function clearNew(cardId) {
  state.newCards = state.newCards.filter(id => id !== cardId);
  save();
}

// --- 対戦 ---
export function setDeck(ids) {
  state.deck = ids;
  save();
}

export function useTicket() {
  if (state.tickets <= 0) return false;
  state.tickets--;
  save();
  return true;
}

/** ボス初撃破を記録。獲得チケット数を返す（初回+1、10/20/30/40/47体目の節目+3） */
export function recordBossDefeat(pref) {
  if (state.defeatedBosses.includes(pref)) return 0;
  state.defeatedBosses.push(pref);
  let gained = 1;
  if ([10, 20, 30, 40, 47].includes(state.defeatedBosses.length)) gained += 3;
  state.tickets += gained;
  save();
  return gained;
}

/** 勝敗を記録し、{streak, gained} を返す（gained=今回獲得チケット） */
export function recordBattle(result, rewardForStreak) {
  state.battles++;
  let gained = 0;
  if (result === 'win') {
    state.wins++;
    state.winStreak++;
    state.bestStreak = Math.max(state.bestStreak, state.winStreak);
    gained = rewardForStreak(state.winStreak);
    state.tickets += gained;
  } else if (result === 'lose') {
    state.winStreak = 0;
  } // 引き分けは連勝維持
  save();
  return { streak: state.winStreak, gained };
}
