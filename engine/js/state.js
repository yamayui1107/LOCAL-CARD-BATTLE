// セーブデータ管理（localStorage）
import { GAME, CONQUEST } from './config.js';

const KEY = GAME.storageKey;

export const STAMINA_MAX = 10;               // 自然回復の上限
export const STAMINA_CAP = 30;               // 保有上限。広告視聴ぶんはここまで上限を超えて貯められる
export const AD_STAMINA = 10;                // 広告1本で回復するスタミナ
export const PACK_COST = 2;
export const REGEN_MS = 2 * 60 * 1000;      // 1スタミナ回復にかかる時間（待ち時間で離脱されないよう短め）
export const AD_COOLDOWN_MS = 0;   // 広告は見てくれるなら何回でもOKの方針
export const PITY_THRESHOLD = 20;            // このパック数SSR以上が出なければ次パックで確定
export const SHARE_BONUS_TICKETS = 30;       // 初回シェアボーナス（Xへのシェア限定・一度きり）

const defaults = () => ({
  favorite: null,        // お気に入りグループ（地元）。排出重みが上がる
  collection: {},        // cardId -> 所持枚数
  newCards: [],          // 未確認のNEWカードid
  stamina: STAMINA_MAX,
  staminaUpdatedAt: Date.now(),
  packsOpened: 0,
  totalDraws: 0,         // 通算ドロー枚数（10枚ごとSR確定の判定用）
  pitySinceSSR: 0,
  adLastAt: 0,
  deck: [],              // 対戦デッキ（cardId×5）
  defeatedBosses: [],    // 制覇モード: 撃破済みの主（グループ値）
  tickets: 0,            // パックチケット（スタミナ不要で開封）
  sharedOnce: false,     // 初回シェアボーナスを受け取り済みか
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
    const parsed = JSON.parse(raw);
    // 旧フィールド名の移行（homePref → favorite）。既存プレイヤーのセーブを壊さない
    if (parsed.homePref !== undefined && parsed.favorite === undefined) {
      parsed.favorite = parsed.homePref;
      delete parsed.homePref;
    }
    return { ...defaults(), ...parsed };
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
// 経過時間ぶんの回復を反映してから返す。
// STAMINA_MAX以上（広告で上乗せしたぶん）を持っている間は自然回復しない＝溜め込んでも損得なし
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
  state.stamina = Math.min(STAMINA_CAP, getStamina() + n);
  save();
}

/** 広告を見る意味があるか（保有上限に達していたら見せても無駄） */
export function canWatchAd() {
  return getStamina() < STAMINA_CAP;
}

// --- 広告 ---
export function adAvailableInMs() {
  const remain = AD_COOLDOWN_MS - (Date.now() - state.adLastAt);
  return Math.max(0, remain);
}

/**
 * 広告視聴の報酬: スタミナ+AD_STAMINA。
 * 満タン時に押せないと動線が死ぬので、STAMINA_CAPまでは上限を超えて貯められる
 */
export function watchAd() {
  state.adLastAt = Date.now();
  state.stamina = Math.min(STAMINA_CAP, getStamina() + AD_STAMINA);
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

/** 初回シェアボーナス。付与した枚数を返す（2回目以降は0） */
export function grantFirstShareBonus() {
  if (state.sharedOnce) return 0;
  state.sharedOnce = true;
  state.tickets += SHARE_BONUS_TICKETS;
  save();
  return SHARE_BONUS_TICKETS;
}

/** 初回シェアボーナスが未受け取りか（CTAの出し分け用） */
export function shareBonusAvailable() {
  return !state.sharedOnce;
}

/**
 * ボス初撃破を記録。獲得チケット数を返す（撃破済みならnull）。
 * 配布は節目のみ: milestoneEvery体ごと+milestoneTickets、全制覇でさらに+completeTickets
 * （config.jsのCONQUEST.rewards）。毎撃破+1だとガチャ経済が崩壊するため絞っている
 */
export function recordBossDefeat(group, totalBosses) {
  if (state.defeatedBosses.includes(group)) return null;
  state.defeatedBosses.push(group);
  const n = state.defeatedBosses.length;
  const r = CONQUEST.rewards;
  let gained = 0;
  if (n % r.milestoneEvery === 0) gained += r.milestoneTickets;
  if (n === totalBosses) gained += r.completeTickets;
  state.tickets += gained;
  save();
  return gained;
}

/**
 * 勝敗を記録し、更新後の連勝数を返す。
 * バトル自体にチケット報酬は無い（連勝ボーナスは廃止）。
 * CPU戦はスタミナ消費なしで無限に回せるため、報酬を付けると
 * 「放置周回でチケット無限」になりガチャ経済と広告の動機が両方壊れる。
 * チケットの入手はボス初撃破・初回シェアのみ、周回で増やしたいならスタミナ＝広告に誘導する
 */
export function recordBattle(result) {
  state.battles++;
  if (result === 'win') {
    state.wins++;
    state.winStreak++;
    state.bestStreak = Math.max(state.bestStreak, state.winStreak);
  } else if (result === 'lose') {
    state.winStreak = 0;
  } // 引き分けは連勝維持
  save();
  return state.winStreak;
}
