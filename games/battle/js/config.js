// ============================================================
// ゲームテーマ設定
//
// ここは games/<ゲーム名>/ 配下＝ゲーム固有ファイル。
// エンジン側（engine/js/*.js）にテーマ固有の文言・IDは置かない。
// 「同じ作りの別テーマのカードバトル」（例: IT用語カードバトル）は
// games/ に新しいフォルダを作り、このファイルに相当するものを書く
// （手順はリポジトリ直下の README.md 参照）。
//
// このファイル以外のゲーム固有ファイル:
//   - index.html の <head>（title / OGP / favicon）と footer の出典表記
//   - about.html / credits.html / terms.html / privacy.html / ads.txt
//   - data/*.csv と images/（tools/ の生成スクリプトはテーマごとに作る）
// ============================================================

// ---------- ゲーム全体 ----------
export const GAME = {
  storageKey: 'jimoto-card-v1',            // localStorageのキー。テーマごとに必ず変える（変えると別セーブになる）
  title: '地域カードバトル',
  titleEn: 'LOCAL CARD BATTLE',
  hashtag: '地域カードバトル',              // シェア文末の #ハッシュタグ
  shareFileName: 'local-card-battle.png',  // シェア画像のファイル名
  packTitle: '地域',                        // パック表面の大書き
  packSub: 'TRAVEL PACK ・ 5 CARDS',       // パック表面のサブテキスト
  backEmblem: '地域',                       // カード裏面の紋章文字
  imageCreditLabel: 'Wikimedia Commons',   // カード詳細の画像出典リンクの表示名
};

// ---------- グループ ----------
// カードが属する大きな括り（card_master.csv の1列）。このゲームでは都道府県。
// IT用語版なら「分野」（ネットワーク／セキュリティ／DB…）などにする。
export const GROUP = {
  label: '都道府県',
  csvField: 'prefecture',   // card_master.csv 上の列名（データを作り直さず流用できるように指定式）
  bossCsvField: 'pref',     // boss_master.csv 上の列名
  // グループの上位分類（図鑑フィルタと地元選択画面の見出しに使う）。
  // 不要なら null にする → 図鑑のフィルタは全グループのフラットな一覧になる
  categories: {
    '北海道・東北': ['北海道', '青森県', '岩手県', '宮城県', '秋田県', '山形県', '福島県'],
    '関東': ['茨城県', '栃木県', '群馬県', '埼玉県', '千葉県', '東京都', '神奈川県'],
    '中部': ['新潟県', '富山県', '石川県', '福井県', '山梨県', '長野県', '岐阜県', '静岡県', '愛知県'],
    '近畿': ['三重県', '滋賀県', '京都府', '大阪府', '兵庫県', '奈良県', '和歌山県'],
    '中国・四国': ['鳥取県', '島根県', '岡山県', '広島県', '山口県', '徳島県', '香川県', '愛媛県', '高知県'],
    '九州・沖縄': ['福岡県', '佐賀県', '長崎県', '熊本県', '大分県', '宮崎県', '鹿児島県', '沖縄県'],
  },
  filterAllLabel: '全地方',   // 図鑑フィルタの先頭項目
};

/** groupが属する上位分類名を返す（categories未定義なら空文字） */
export function categoryOf(group) {
  if (!GROUP.categories) return '';
  return Object.keys(GROUP.categories).find(c => GROUP.categories[c].includes(group)) || '';
}

// ---------- カード種別 ----------
// card_master.csv の type 列 → 表示ラベルと封蝋の1文字。
// place はカード左下の所在地行のテキスト（省略時はカードのグループ名をそのまま出す）。
// 都道府県カードは自分自身が県名なので、所在地には地方名を出している。
export const CARD_TYPES = {
  pref: { label: '都道府県', seal: '都', place: (c) => categoryOf(c.group) },
  city: { label: '市区町村', seal: '町' },
  spot: { label: '名所', seal: '景' },
};

/** カードの所在地行テキスト */
export function placeOf(card) {
  return CARD_TYPES[card.type]?.place?.(card) ?? card.group;
}

// ---------- 「地元」（お気に入りグループ確変） ----------
// 起動時に1つ選ばせて、そのグループのカードの排出重みを上げる仕組み。
export const FAVORITE = {
  label: '地元',
  boost: 2.5,   // 同レアリティ内の選出重み倍率
  onboardLeadNew: 'あなたの<strong>地元</strong>はどこ？<br><span class="onboard-note">地元の都道府県のカードが出やすくなります</span>',
  onboardLeadChange: '<strong>地元</strong>を変更する<br><span class="onboard-note">選んだ都道府県のカードが出やすくなります（コレクションはそのまま）</span>',
  packHint: (group, owned, total) => `地元${group}のカードが出やすい！（地元コンプ ${owned}/${total}）`,
};

// ---------- 図鑑 ----------
export const COLLECTION = {
  searchPlaceholder: '地名で検索…',
};

// ---------- シナジー ----------
export const SYNERGY = {
  poolNote: (n) => `（全国に${n}枚存在）`,   // 「そのタグのカードが全体で何枚あるか」の注記
};

// ---------- 制覇モード（固定ボスの連戦） ----------
export const CONQUEST = {
  title: '全国制覇',
  completeText: '全国制覇達成！！',
  // チケットの入手経路はここだけ: milestoneEvery体ごとに+milestoneTickets、全制覇でさらに+completeTickets
  rewards: { milestoneEvery: 5, milestoneTickets: 2, completeTickets: 5 },
  ticketHint: (nextBossName) => `チケットは全国制覇でもらえる — 次は${nextBossName}`,
};

// ---------- 広告（Google AdSense） ----------
// サイト（ドメイン）ごとにAdSenseで発行されるIDを貼る。詳細はengine/js/ads.jsのコメント参照
export const ADS = {
  client: 'ca-pub-4007860542391348',   // サイト運営者ID。空なら広告なし（ダミー広告にフォールバック）
  testMode: true,                      // 審査通過後、本番リリース時に false にする
  slotBanner: '',                      // ディスプレイ広告ユニットのスロットID。空ならバナー枠を描画しない
};

// ---------- アクセス解析（Google Analytics 4） ----------
export const ANALYTICS = {
  gaId: 'G-SW8DDDVWKV',   // 測定ID。空なら何も読み込まない
};

// ---------- シェア文言 ----------
// 実際に投稿されたかは検証できないため、報酬は一度きり（state.jsのgrantFirstShareBonus参照）
export const SHARE = {
  collection: (favorite, owned, total) =>
    `「${GAME.title}」で${FAVORITE.label}${favorite}のカードを集めてる！ コレクション ${owned}/${total}枚`,
  pull: (card) => `「${GAME.title}」で ${card.rarity}『${card.name}』を引き当てた！`,
  card: (card, fmt) => `「${GAME.title}」で ${card.rarity}『${card.name}』をゲット！ 攻${fmt(card.attack)}／防${fmt(card.defense)}`,
  deck: (power, code, fmt) => `「${GAME.title}」戦闘力${fmt(power)}のデッキで待ってるぞ！ コード: ${code}`,
  bossWin: (bossName, done, total) => `「${GAME.title}」で${bossName}を撃破！（${CONQUEST.title} ${done}/${total}）`,
  win: (power, tier, streak, fmt) =>
    `「${GAME.title}」戦闘力${fmt(power)}で${tier}！${streak >= 3 ? ` ただいま${streak}連勝中！` : ''}`,
  lose: (power, fmt) => `「${GAME.title}」戦闘力${fmt(power)}で挑むも敗北…誰かリベンジ手伝って`,
};
