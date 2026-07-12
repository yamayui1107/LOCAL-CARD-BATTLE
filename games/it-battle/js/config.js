// ============================================================
// ゲームテーマ設定 — IT用語カードバトル
//
// ここは games/it-battle/ 配下＝ゲーム固有ファイル。
// エンジン側（engine/js/*.js）にテーマ固有の文言・IDは置かない。
// ============================================================

// ---------- ゲーム全体 ----------
export const GAME = {
  storageKey: 'it-terms-card-v1',          // localStorageのキー。テーマごとに固有（変えると別セーブ）
  title: 'IT用語カードバトル',
  titleEn: 'IT TERMS CARD BATTLE',
  hashtag: 'IT用語カードバトル',            // シェア文末の #ハッシュタグ
  shareFileName: 'it-terms-card-battle.png',
  packTitle: 'IT用語',                      // パック表面の大書き
  packSub: 'TECH PACK ・ 5 CARDS',         // パック表面のサブテキスト
  backEmblem: 'IT',                         // カード裏面の紋章文字
  labelOrientation: 'horizontal',           // パック表面・カード裏の書字方向（英字混じりなので横書き）
  imageCreditLabel: 'Wikimedia Commons',   // 画像を導入したときの出典リンク表示名（現状カード画像なし）
};

// ---------- グループ ----------
// カードが属する大きな括り。このゲームでは「分野」（全10分野）。
export const GROUP = {
  label: '分野',
  csvField: 'field',        // card_master.csv 上の列名
  bossCsvField: 'field',    // boss_master.csv 上の列名
  // 分野の上位分類（図鑑フィルタと得意分野選択画面の見出し）
  categories: {
    '開発': ['プログラミング言語', 'Web技術', '開発プロセス・ツール'],
    'インフラ': ['ネットワーク', 'OS・ハードウェア', 'クラウド・インフラ'],
    'データ・AI': ['データベース', 'AI・データサイエンス'],
    'セキュリティ・理論': ['セキュリティ', '基礎理論・アルゴリズム'],
  },
  filterAllLabel: '全分野',
};

/** groupが属する上位分類名を返す（categories未定義なら空文字） */
export function categoryOf(group) {
  if (!GROUP.categories) return '';
  return Object.keys(GROUP.categories).find(c => GROUP.categories[c].includes(group)) || '';
}

// ---------- カード種別 ----------
// card_master.csv の type 列 → 表示ラベルと封蝋の1文字。
// place（所在地行）は省略＝分野名がそのまま表示される。
export const CARD_TYPES = {
  lang: { label: '言語', seal: '言' },
  tech: { label: '技術', seal: '技' },
  term: { label: '用語', seal: '語' },
  tool: { label: 'ツール', seal: '具' },
};

/** カードの所在地行テキスト */
export function placeOf(card) {
  return CARD_TYPES[card.type]?.place?.(card) ?? card.group;
}

// ---------- 「得意分野」（お気に入りグループ確変） ----------
export const FAVORITE = {
  label: '得意分野',
  boost: 2.5,   // 同レアリティ内の選出重み倍率
  onboardLeadNew: 'あなたの<strong>得意分野</strong>は？<br><span class="onboard-note">選んだ分野のカードが出やすくなります</span>',
  onboardLeadChange: '<strong>得意分野</strong>を変更する<br><span class="onboard-note">選んだ分野のカードが出やすくなります（コレクションはそのまま）</span>',
  packHint: (group, owned, total) => `得意分野「${group}」のカードが出やすい！（分野コンプ ${owned}/${total}）`,
};

// ---------- 図鑑 ----------
export const COLLECTION = {
  searchPlaceholder: '用語で検索…',
};

// ---------- シナジー ----------
export const SYNERGY = {
  poolNote: (n) => `（全${n}枚存在）`,
};

// ---------- 制覇モード（各分野の門番・番人・主30体＋シンギュラリティ） ----------
export const CONQUEST = {
  title: '分野制覇',
  completeText: '全分野制覇達成！！',
  // 31体編成。配布は5体ごと+2（6回=12枚）、全制覇+5 ＝ 生涯17枚
  rewards: { milestoneEvery: 5, milestoneTickets: 2, completeTickets: 5 },
  ticketHint: (nextBossName) => `チケットは分野制覇でもらえる — 次は${nextBossName}`,
};

// ---------- 広告（Google AdSense） ----------
export const ADS = {
  client: 'ca-pub-4007860542391348',   // サイト運営者ID（地域版と同一アカウント）
  testMode: true,                      // 新ドメインのサイト追加審査の通過後、本番リリース時に false にする
  slotBanner: '',                      // ディスプレイ広告ユニットのスロットID。空ならバナー枠を描画しない
};

// ---------- アクセス解析（Google Analytics 4） ----------
// このゲーム用の測定IDを発行したら貼る。空の間は何も読み込まない
export const ANALYTICS = {
  gaId: '',
};

// ---------- シェア文言 ----------
// 実際に投稿されたかは検証できないため、報酬は一度きり（engine/js/state.js参照）
export const SHARE = {
  collection: (favorite, owned, total) =>
    `「${GAME.title}」で${FAVORITE.label}「${favorite}」のカードを集めてる！ コレクション ${owned}/${total}枚`,
  pull: (card) => `「${GAME.title}」で ${card.rarity}『${card.name}』を引き当てた！`,
  card: (card, fmt) => `「${GAME.title}」で ${card.rarity}『${card.name}』をゲット！ 攻${fmt(card.attack)}／防${fmt(card.defense)}`,
  deck: (power, code, fmt) => `「${GAME.title}」戦闘力${fmt(power)}のデッキで待ってるぞ！ コード: ${code}`,
  bossWin: (bossName, done, total) => `「${GAME.title}」で${bossName}を撃破！（${CONQUEST.title} ${done}/${total}）`,
  win: (power, tier, streak, fmt) =>
    `「${GAME.title}」戦闘力${fmt(power)}で${tier}！${streak >= 3 ? ` ただいま${streak}連勝中！` : ''}`,
  lose: (power, fmt) => `「${GAME.title}」戦闘力${fmt(power)}で挑むも敗北…誰かリベンジ手伝って`,
};
