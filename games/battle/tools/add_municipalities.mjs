// 全市区町村をカード化するパイプライン
//   node tools/add_municipalities.mjs           → 取得＋CSV追記まで実行
//   node tools/add_municipalities.mjs --dry     → CSVに書かず件数だけ確認
// データ源: code4fukui/localgovjp（総務省コード由来） + Wikipedia API
// 進捗はtools/cache/muni_cache.jsonに保存され、再実行時は取得済みをスキップする
import { readFileSync, writeFileSync, appendFileSync, mkdirSync, existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { parseCSV } from '../../../engine/js/csvparse.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CACHE_DIR = path.join(ROOT, 'tools', 'cache');
const CACHE = path.join(CACHE_DIR, 'muni_cache.json');
const UA = 'jimoto-card-game/0.2 (personal hobby project)';
const SOURCE = 'https://raw.githubusercontent.com/code4fukui/localgovjp/master/localgovjp-utf8.csv';
const DRY = process.argv.includes('--dry');

const POLITICAL_CITIES = new Set(['札幌市','仙台市','さいたま市','千葉市','横浜市','川崎市','相模原市','新潟市','静岡市','浜松市','名古屋市','京都市','大阪市','堺市','神戸市','岡山市','広島市','北九州市','福岡市','熊本市']);
const CAPITALS = new Set(['札幌市','青森市','盛岡市','仙台市','秋田市','山形市','福島市','水戸市','宇都宮市','前橋市','さいたま市','千葉市','新宿区','横浜市','新潟市','富山市','金沢市','福井市','甲府市','長野市','岐阜市','静岡市','名古屋市','津市','大津市','京都市','大阪市','神戸市','奈良市','和歌山市','鳥取市','松江市','岡山市','広島市','山口市','徳島市','高松市','松山市','高知市','福岡市','佐賀市','長崎市','熊本市','大分市','宮崎市','鹿児島市','那覇市']);

// 手作業キュレーション層: 面白い自治体のレアリティ・タグ・豆知識を上書き
// キーは「都道府県|自治体名」。フィールドは部分指定OK（無指定はパイプライン算出値）
const OVERRIDES = {
  '北海道|千歳市': { tags: ['空港'], desc: '新千歳空港の街。支笏湖の水質は日本トップ級' },
  '北海道|帯広市': { tags: ['豪雪'], desc: '豚丼と六花亭の街。ばんえい競馬は世界唯一' },
  '北海道|釧路市': { rarity: 'R', tags: ['港町', '夜景'], desc: '世界三大夕日と称される港町。釧路湿原の玄関口' },
  '北海道|根室市': { rarity: 'R', tags: ['最果て', '港町'], desc: '本土最東端の街。日本で一番早く朝日が昇る' },
  '北海道|稚内市': { rarity: 'SR', tags: ['最果て', '港町', '日本一'], desc: '日本最北端の街。宗谷岬から樺太が見える日も' },
  '北海道|網走市': { rarity: 'R', tags: ['最果て', '港町'], desc: '流氷と網走監獄。オホーツクの海の幸が集まる' },
  '北海道|苫小牧市': { tags: ['港町'], desc: 'ホッキ貝水揚げ日本一の工業港湾都市' },
  '青森県|五所川原市': { tags: ['祭り'], desc: '高さ23mの立佞武多が街を練り歩く' },
  '青森県|大間町': { rarity: 'R', tags: ['最果て', '港町'], desc: '本州最北端。一本釣りマグロは初競り億超えの伝説' },
  '岩手県|花巻市': { rarity: 'R', tags: ['温泉地'], desc: '宮沢賢治のふるさと。花巻温泉郷とわんこそば' },
  '岩手県|久慈市': { tags: ['港町'], desc: '海女の北限。琥珀の産地として日本一' },
  '宮城県|大崎市': { tags: ['温泉地'], desc: 'こけしの鳴子温泉郷。ササニシキ発祥の地' },
  '宮城県|塩竈市': { tags: ['港町'], desc: '生マグロ水揚げ日本トップ級。塩竈神社の門前港町' },
  '秋田県|大仙市': { rarity: 'R', tags: ['花火'], desc: '日本三大花火「大曲の花火」に全国の花火師が集う' },
  '秋田県|横手市': { rarity: 'R', tags: ['豪雪', '祭り'], desc: 'かまくらと横手焼きそば。日本有数の豪雪都市' },
  '山形県|米沢市': { rarity: 'R', tags: ['ブランド牛', '城下町'], desc: '上杉家の城下町。米沢牛は日本三大和牛の一角' },
  '山形県|酒田市': { tags: ['港町'], desc: '北前船で栄えた湊町。山居倉庫とおしんの舞台' },
  '福島県|喜多方市': { rarity: 'SR', tags: ['ラーメン'], desc: '人口比ラーメン店数日本一。朝ラー文化の聖地' },
  '福島県|二本松市': { tags: ['城下町', '祭り'], desc: '智恵子のふるさと。提灯祭りと菊人形' },
  '福島県|白河市': { tags: ['ラーメン', '城下町'], desc: '白河ラーメンと小峰城。みちのくの玄関口' },
  '茨城県|笠間市': { tags: ['焼き物'], desc: '笠間焼と日本三大稲荷の笠間稲荷神社' },
  '茨城県|土浦市': { rarity: 'R', tags: ['花火', '湖'], desc: '日本三大花火の土浦全国花火競技大会。霞ヶ浦のほとり' },
  '栃木県|益子町': { rarity: 'R', tags: ['焼き物'], desc: '益子焼の窯元が集う陶芸の聖地。春秋の陶器市は大賑わい' },
  '栃木県|佐野市': { tags: ['ラーメン'], desc: '青竹打ちの佐野ラーメンと厄除け大師' },
  '群馬県|渋川市': { rarity: 'R', tags: ['温泉地'], desc: '石段街の伊香保温泉。日本のまんなかを名乗る' },
  '埼玉県|熊谷市': { rarity: 'R', tags: ['日本一'], desc: '最高気温41.1℃を記録した日本一暑い街の一角' },
  '埼玉県|久喜市': { tags: ['アニメ聖地'], desc: '鷲宮神社はらき☆すた聖地巡礼の元祖' },
  '埼玉県|長瀞町': { tags: ['秘境'], desc: 'ライン下りと岩畳。地球の窓と呼ばれる地質の宝庫' },
  '千葉県|木更津市': { tags: ['港町'], desc: 'アクアラインで都心直結。潮干狩りと証城寺の狸囃子' },
  '千葉県|鴨川市': { tags: ['港町', '南国'], desc: 'シャチのショーで有名な海の街。棚田の夜景も美しい' },
  '千葉県|香取市': { tags: ['小京都'], desc: '小江戸・佐原の町並みと伊能忠敬。香取神宮の門前町' },
  '東京都|大田区': { rarity: 'R', tags: ['東京23区', '空港'], desc: '羽田空港と銭湯と町工場の区。23区最大の面積' },
  '東京都|墨田区': { rarity: 'R', tags: ['東京23区', '花火'], desc: '隅田川花火大会と両国国技館。江戸の粋が残る' },
  '東京都|中野区': { rarity: 'R', tags: ['東京23区', 'アニメ聖地'], desc: '中野ブロードウェイはサブカルの殿堂' },
  '東京都|目黒区': { rarity: 'R', tags: ['東京23区', '山手線'], desc: '目黒川の桜並木は都内屈指の名所。実は目黒駅は品川区' },
  '東京都|文京区': { rarity: 'R', tags: ['東京23区'], desc: '東大と講道館。文豪たちが愛した文の京' },
  '東京都|三鷹市': { rarity: 'R', tags: ['アニメ聖地'], desc: 'ジブリ美術館と太宰治。玉川上水の緑道が続く' },
  '神奈川県|藤沢市': { rarity: 'R', tags: ['アニメ聖地', '港町'], desc: '江の島と湘南海岸。スラムダンクの踏切に世界中から巡礼' },
  '新潟県|燕市': { rarity: 'R', tags: ['日本一'], desc: '金属洋食器の国内シェア9割。世界が認める磨きの技' },
  '新潟県|魚沼市': { rarity: 'R', tags: ['豪雪', '日本一'], desc: '魚沼産コシヒカリはブランド米の頂点' },
  '新潟県|妙高市': { tags: ['豪雪', '温泉地'], desc: '妙高高原の温泉とスキー。日本百名山の麓' },
  '富山県|砺波市': { tags: ['日本一'], desc: 'チューリップ球根出荷量日本一。散居村の風景は圧巻' },
  '富山県|黒部市': { rarity: 'R', tags: ['秘境', '温泉地'], desc: '黒部峡谷のトロッコ電車と宇奈月温泉' },
  '石川県|小松市': { tags: ['空港'], desc: '小松空港と世界的建機メーカーの企業城下町' },
  '石川県|珠洲市': { rarity: 'R', tags: ['最果て', '半島'], desc: '能登半島の最先端。揚げ浜式製塩は日本唯一の伝統' },
  '福井県|小浜市': { tags: ['港町'], desc: '鯖街道の起点。京へ海の幸を運んだ御食国' },
  '福井県|永平寺町': { rarity: 'R', tags: ['門前町'], desc: '道元禅師が開いた曹洞宗大本山永平寺の門前町' },
  '山梨県|身延町': { tags: ['門前町'], desc: '日蓮宗総本山身延山久遠寺。しだれ桜の名所' },
  '長野県|上田市': { rarity: 'R', tags: ['城下町', '祭り'], desc: '真田氏の城下町。上田城は徳川軍を二度退けた' },
  '長野県|木曽町': { tags: ['秘境'], desc: '御嶽山の麓、中山道の宿場町。木曽馬のふるさと' },
  '長野県|小布施町': { rarity: 'R', tags: ['小京都'], desc: '栗と北斎の町。長野県で一番小さな町に年間100万人' },
  '岐阜県|多治見市': { rarity: 'R', tags: ['焼き物', '日本一'], desc: '美濃焼の中心地。最高気温を競う日本一暑い街の一角' },
  '岐阜県|郡上市': { rarity: 'R', tags: ['祭り', '城下町'], desc: '徹夜で踊る郡上おどり。清流吉田川と食品サンプル発祥' },
  '岐阜県|飛騨市': { rarity: 'R', tags: ['アニメ聖地'], desc: '映画「君の名は。」の聖地。古い町並みの飛騨古川' },
  '静岡県|沼津市': { rarity: 'R', tags: ['港町', 'アニメ聖地'], desc: '深海魚とラブライブ!サンシャイン!!の港町' },
  '静岡県|焼津市': { tags: ['港町'], desc: 'カツオ・マグロの遠洋漁業基地。水揚げ金額全国トップ級' },
  '静岡県|掛川市': { tags: ['城下町'], desc: '山内一豊の掛川城。深蒸し茶の名産地' },
  '静岡県|伊豆市': { rarity: 'R', tags: ['温泉地', '半島'], desc: '修善寺温泉と天城越え。わさびの本場' },
  '愛知県|瀬戸市': { rarity: 'R', tags: ['焼き物'], desc: '「せともの」の語源になった千年の窯業都市' },
  '愛知県|岡崎市': { rarity: 'R', tags: ['城下町', '花火'], desc: '徳川家康生誕の岡崎城。三河花火の伝統と八丁味噌' },
  '愛知県|豊橋市': { tags: ['花火'], desc: '手筒花火発祥の地。路面電車が走る東三河の中心' },
  '三重県|桑名市': { tags: ['城下町'], desc: '「その手は桑名の焼き蛤」。東海道の宿場町' },
  '三重県|熊野市': { tags: ['秘境', '世界遺産'], desc: '熊野古道と獅子岩。世界遺産の鬼ヶ城' },
  '三重県|伊賀市': { rarity: 'R', tags: ['忍者', '城下町'], desc: '伊賀流忍者のふるさと。松尾芭蕉もこの地の生まれ' },
  '滋賀県|甲賀市': { rarity: 'R', tags: ['忍者', '焼き物'], desc: '甲賀流忍者と信楽焼のたぬき。忍術屋敷が現存する' },
  '京都府|福知山市': { tags: ['城下町'], desc: '明智光秀が築いた城下町。肉じゃが発祥を名乗る街のひとつ' },
  '京都府|京丹後市': { tags: ['温泉地', '港町'], desc: '夕日ヶ浦温泉と間人ガニ。丹後ちりめんの産地' },
  '大阪府|岸和田市': { rarity: 'R', tags: ['祭り', '城下町'], desc: 'だんじり祭の熱狂。やりまわしは魂の技' },
  '兵庫県|明石市': { rarity: 'R', tags: ['港町', '日本一'], desc: '日本標準時の子午線が通る街。明石焼きとタコ' },
  '兵庫県|赤穂市': { tags: ['城下町'], desc: '忠臣蔵・四十七士のふるさと。赤穂の塩' },
  '兵庫県|西宮市': { rarity: 'R', tags: ['アニメ聖地'], desc: '甲子園球場とえべっさんの総本社。ハルヒの聖地' },
  '奈良県|天理市': { tags: ['門前町'], desc: '日本唯一の宗教都市を名乗る。天理ラーメンも有名' },
  '和歌山県|串本町': { rarity: 'R', tags: ['最果て', '半島', '港町'], desc: '本州最南端の潮岬。ラムサール条約のサンゴの海' },
  '鳥取県|倉吉市': { tags: ['小京都'], desc: '白壁土蔵群の街並み。二十世紀梨のふるさと' },
  '島根県|浜田市': { tags: ['港町'], desc: 'どんちっち三魚の水揚げ港。石見神楽の本場' },
  '島根県|安来市': { tags: ['日本一'], desc: 'どじょうすくいの安来節。足立美術館の庭園は21年連続日本一' },
  '岡山県|備前市': { rarity: 'R', tags: ['焼き物'], desc: '千年の炎が生む備前焼。日本六古窯の筆頭格' },
  '岡山県|津山市': { tags: ['城下町'], desc: '桜の名所・津山城とホルモンうどん' },
  '広島県|竹原市': { tags: ['小京都', 'アニメ聖地'], desc: '安芸の小京都。たまゆらの舞台になった町並み保存地区' },
  '広島県|東広島市': { rarity: 'R', tags: ['酒どころ'], desc: '酒都・西条。酒蔵通りに赤レンガの煙突が並ぶ' },
  '徳島県|美馬市': { tags: ['小京都'], desc: 'うだつの町並みで知られる脇町。うだつが上がる街' },
  '香川県|坂出市': { tags: ['うどん'], desc: '瀬戸大橋の四国側玄関口。讃岐うどんの激戦区' },
  '香川県|観音寺市': { tags: ['うどん'], desc: '銭形砂絵「寛永通宝」を見れば金運アップ' },
  '愛媛県|大洲市': { tags: ['小京都'], desc: '伊予の小京都。肱川のうかいと臥龍山荘' },
  '愛媛県|八幡浜市': { tags: ['港町'], desc: 'みかんと魚の街。四国有数のトロール漁業基地' },
  '高知県|土佐清水市': { rarity: 'R', tags: ['最果て', '港町'], desc: '四国最南端の足摺岬。ジョン万次郎のふるさと' },
  '高知県|南国市': { tags: ['南国', '空港'], desc: 'その名も「なんこく」市。高知空港と長宗我部氏の岡豊城' },
  '福岡県|久留米市': { rarity: 'R', tags: ['ラーメン'], desc: 'とんこつラーメン発祥の地。ゴム産業とブリヂストン' },
  '佐賀県|伊万里市': { rarity: 'R', tags: ['焼き物', '港町'], desc: '古伊万里を世界へ積み出した港。伊万里牛も名物' },
  '佐賀県|武雄市': { tags: ['温泉地'], desc: '1300年の武雄温泉。楼門は東京駅と同じ辰野金吾の設計' },
  '長崎県|平戸市': { rarity: 'R', tags: ['港町', '城下町'], desc: '日本最初の西洋貿易港。ザビエルも上陸した島の城下町' },
  '長崎県|波佐見町': { tags: ['焼き物'], desc: 'カジュアル食器の波佐見焼。おしゃれ陶器の新聖地' },
  '熊本県|玉名市': { tags: ['温泉地', 'ラーメン'], desc: '玉名温泉と玉名ラーメン。熊本ラーメンのルーツ' },
  '大分県|竹田市': { tags: ['城下町'], desc: '「荒城の月」の岡城跡。竹田湧水群の清冽な水' },
  '大分県|宇佐市': { rarity: 'R', tags: ['門前町'], desc: '全国4万社の八幡様の総本宮・宇佐神宮。からあげ専門店発祥の地とも' },
  '鹿児島県|南大隅町': { rarity: 'R', tags: ['最果て', '半島'], desc: '本土最南端の佐多岬。北緯31度線のモニュメント' },
  '鹿児島県|出水市': { tags: ['日本一'], desc: '1万羽超のツルが越冬する日本一の渡来地' },
  '鹿児島県|南九州市': { rarity: 'R', tags: ['日本一'], desc: '知覧茶の一大産地。市町村単位の荒茶生産量日本一' },
  '沖縄県|名護市': { tags: ['南国'], desc: 'やんばるの玄関口。オリオンビールのふるさと' },
  '沖縄県|糸満市': { tags: ['港町', '南国', '最果て'], desc: '海人（うみんちゅ）の街。沖縄本島最南端' },
  '沖縄県|与那国町': { rarity: 'SSR', tags: ['最果て', '島', '南国', '秘境', '日本一'], desc: '日本最西端の国境の島。海底遺跡と与那国馬' },
};

// 既存カードへの新タグ付与（name → tags）
const EXISTING_TAG_ADDS = {
  '札幌市': ['ラーメン', '夜景', '祭り'], '函館市': ['夜景'], '旭川市': ['ラーメン'],
  '青森市': ['祭り'], '山形市': ['ラーメン'], '仙台市': ['祭り'],
  '宇都宮市': ['餃子'], '長岡市': ['花火'], '新潟市': ['酒どころ'],
  '富士吉田市': ['うどん'], '湯沢市': ['うどん'], '高山市': ['ブランド牛', '祭り'],
  '熱海市': ['花火'], '浜松市': ['餃子'], '名古屋市': ['祭り'],
  '松阪市': ['ブランド牛'], '近江八幡市': ['ブランド牛'], '京都市': ['祭り', '酒どころ'],
  '大阪市': ['祭り'], '神戸市': ['夜景', 'ブランド牛', '酒どころ'], '横浜市': ['ラーメン'],
  '和歌山市': ['ラーメン'], '尾道市': ['ラーメン'], '徳島市': ['祭り'],
  '高松市': ['うどん'], '丸亀市': ['うどん'], '琴平町': ['門前町'],
  '福岡市': ['ラーメン', '祭り'], '北九州市': ['夜景'], '長崎市': ['夜景'],
  '宮崎市': ['餃子'], '成田市': ['門前町'], '長野市': ['門前町'],
  '伊勢市': ['門前町'], '太宰府市': ['門前町'], '出雲市': ['門前町'],
};

const NEW_TAGS = [
  ['ラーメン', 'ご当地ラーメンの聖地。一杯に街の歴史が詰まっている'],
  ['夜景', '日本有数の夜景を誇る街。宝石箱をひっくり返したような光'],
  ['焼き物', '窯業の伝統が息づく焼き物の里'],
  ['最果て', '日本の端っこ。ここから先は海しかない'],
  ['うどん', 'うどん文化が根付く麺どころ'],
  ['餃子', '餃子に人生を懸ける街。消費量トップを争う'],
  ['ブランド牛', '日本が世界に誇る和牛のふるさと'],
  ['アニメ聖地', 'アニメの舞台となり世界中のファンが巡礼に訪れる'],
  ['祭り', '魂を燃やす祭りの街。その日のために一年を生きる'],
  ['花火', '夜空を彩る花火の名所。日本の夏の集大成'],
  ['門前町', '大寺社の門前で栄えた祈りの町'],
  ['忍者', '忍びの里。史実に残る忍者のふるさと'],
  ['酒どころ', '名水が育む日本酒の産地。酒蔵の煙突が並ぶ'],
];

const NEW_SYNERGIES = [
  ['SY22', 'ラーメン行脚', 'ラーメン', 3, 2.0, '一日三杯は当たり前。ご当地の一杯を求めて'],
  ['SY23', '百万ドルの夜景', '夜景', 3, 2.4, '夜景都市が3つ集えば眩しさで敵は目を開けられない'],
  ['SY24', '窯元めぐり', '焼き物', 3, 2.3, '千年の炎は簡単には消えない'],
  ['SY25', '最果て探訪', '最果て', 3, 2.8, '東西南北の端に立つ者だけが知る景色がある'],
  ['SY26', 'うどん県連合', 'うどん', 3, 2.2, 'コシの強さは防御力。出汁の深さは攻撃力'],
  ['SY27', '餃子サミット', '餃子', 2, 2.6, '消費量日本一の座を懸けた終わりなき戦い'],
  ['SY28', '和牛頂上決戦', 'ブランド牛', 3, 2.6, '霜降りの輝きは刃より鋭い'],
  ['SY29', '聖地巡礼', 'アニメ聖地', 3, 2.4, '二次元と三次元が交差するとき物語は無敵になる'],
  ['SY30', '日本の祭囃子', '祭り', 3, 2.0, '笛と太鼓が鳴れば血が騒ぐ'],
  ['SY31', '夜空の大輪', '花火', 3, 2.4, '三大花火がそろえば夜空はもう昼間'],
  ['SY32', '門前町巡り', '門前町', 3, 2.1, '神仏の加護がデッキに宿る'],
  ['SY33', '忍びの里', '忍者', 2, 3.5, '甲賀と伊賀が手を組む禁断の同盟。全国に2枚しかない'],
  ['SY34', '酒豪同盟', '酒どころ', 3, 2.8, '酔えば酔うほど強くなる。灘・伏見・西条の底力'],
  ['SY35', '湯けむり大同盟', '温泉地', 5, 2.8, '五湯そろい踏み。もはや戦うより浸かりたい'],
  ['SY36', '天下布武', '城下町', 5, 2.6, '五城連合の前に落ちぬ城なし'],
  ['SY37', '世界遺産グランドツアー', '世界遺産', 5, 2.8, '人類の宝5つ。文明の力は圧倒的'],
  ['SY38', '首都完全体', '東京23区', 5, 3.0, '23区が5つそろえば首都機能は完全体となる'],
  ['SY39', '島国日本', '島', 5, 3.2, '日本は島国。島を制する者が国を制す'],
];

const esc = v => /[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const chunk = (a, n) => Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, i * n + n));

async function apiGet(params) {
  const url = 'https://ja.wikipedia.org/w/api.php?' + new URLSearchParams({ format: 'json', ...params });
  for (let attempt = 1; ; attempt++) {
    const res = await fetch(url, { headers: { 'User-Agent': UA } });
    if (res.ok) return res.json();
    if (res.status === 429 && attempt < 6) { await sleep(5000 * attempt); continue; }
    throw new Error(`API ${res.status}`);
  }
}

// ---- 1. 市区町村リスト取得 ----
const srcText = await (await fetch(SOURCE, { headers: { 'User-Agent': UA } })).text();
const allMunis = parseCSV(srcText)
  .filter(r => r.city && !r.city.includes(' '))   // 政令市の行政区(「札幌市 中央区」)を除外
  .map(r => ({ pref: r.pref, name: r.city, kana: (r.citykana || '').replace(/ /g, ''), phrase: r.phrase || '' }));

const master = parseCSV(readFileSync(path.join(ROOT, 'data/card_master.csv'), 'utf8'));
const existingKeys = new Set(master.filter(m => m.type === 'city').map(m => `${m.prefecture}|${m.name}`));
const news = allMunis.filter(m => !existingKeys.has(`${m.pref}|${m.name}`));
console.log(`全市区町村: ${allMunis.length} / 既存: ${existingKeys.size} / 新規追加: ${news.length}`);
if (DRY) process.exit(0);

// ---- 2. Wikipediaから冒頭文・画像・曖昧さ回避を解決（キャッシュ付き） ----
mkdirSync(CACHE_DIR, { recursive: true });
const cache = existsSync(CACHE) ? JSON.parse(readFileSync(CACHE, 'utf8')) : {};
const saveCache = () => writeFileSync(CACHE, JSON.stringify(cache), 'utf8');

async function fetchWikiBatch(items, titleFn) {
  // items: muni[], titleFn: muni→記事名。 結果はcache[key]へ
  const pend = items.filter(m => !cache[`${m.pref}|${m.name}`]);
  for (const group of chunk(pend, 20)) {
    const titles = group.map(titleFn);
    const data = await apiGet({
      action: 'query', redirects: 1,
      prop: 'extracts|pageprops|pageimages',
      exintro: 1, explaintext: 1, exlimit: 'max',
      piprop: 'thumbnail|name', pithumbsize: 400,
      titles: titles.join('|'),
    });
    const norm = new Map();
    for (const m of [...(data.query.normalized || []), ...(data.query.redirects || [])]) {
      norm.set(m.to, norm.get(m.from) ?? m.from);   // to→元のリクエスト名
    }
    for (const page of Object.values(data.query.pages)) {
      const reqTitle = norm.get(page.title) ?? page.title;
      const muni = group[titles.indexOf(reqTitle)];
      if (!muni) continue;
      const key = `${muni.pref}|${muni.name}`;
      const isDisambig = page.pageprops && 'disambiguation' in page.pageprops;
      if (page.missing !== undefined || isDisambig) {
        cache[key] = { needRetry: true };
      } else {
        cache[key] = {
          title: page.title,
          extract: (page.extract || '').split('\n')[0],
          thumb: page.thumbnail ? page.thumbnail.source : '',
          pageimage: page.pageimage || '',
        };
      }
    }
    saveCache();
    process.stdout.write(`\rWikipedia照会 ${Object.keys(cache).length}`);
    await sleep(400);
  }
}

await fetchWikiBatch(news, m => m.name);
// 曖昧さ回避・記事なし → 「○○ (××県)」で再照会
const retries = news.filter(m => cache[`${m.pref}|${m.name}`]?.needRetry);
if (retries.length) {
  console.log(`\n曖昧さ回避の再照会: ${retries.length}件`);
  for (const m of retries) delete cache[`${m.pref}|${m.name}`];
  await fetchWikiBatch(retries, m => `${m.name} (${m.pref})`);
}
console.log('');

// ---- 3. ページビュー（有名度）取得 ----
async function fetchPageviews(muni) {
  const key = `${muni.pref}|${muni.name}`;
  const c = cache[key];
  if (!c || c.needRetry || c.pv !== undefined) return;
  const title = encodeURIComponent((c.title || muni.name).replace(/ /g, '_'));
  const url = `https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article/ja.wikipedia/all-access/user/${title}/monthly/2025010100/2025123100`;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      // タイムアウト必須: ハングした接続が並列バッチ全体を止めるため
      const res = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(15000) });
      if (res.status === 429) { await sleep(3000 * attempt); continue; }
      if (!res.ok) { c.pv = 0; return; }
      const j = await res.json();
      const views = (j.items || []).reduce((s, x) => s + x.views, 0);
      c.pv = Math.round(views / Math.max(1, (j.items || []).length));
      return;
    } catch { /* タイムアウト等 → リトライ */ }
  }
  c.pv = 0; // 3回失敗したら諦めて低有名度扱い（後から再取得可能）
}
let done = 0;
for (const group of chunk(news, 8)) {
  await Promise.all(group.map(fetchPageviews));
  done += group.length;
  if (done % 80 === 0) { saveCache(); process.stdout.write(`\rページビュー ${done}/${news.length}`); }
  await sleep(250);
}
saveCache();
console.log(`\rページビュー ${done}/${news.length}`);

// ---- 4. カード行の生成 ----
const pvs = news.map(m => cache[`${m.pref}|${m.name}`]?.pv || 0).sort((a, b) => a - b);
const pct = pv => pvs.findIndex(v => v >= pv) / pvs.length;
const hash = s => [...s].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) >>> 0, 7);

let seq = Math.max(...master.filter(m => m.id.startsWith('C')).map(m => Number(m.id.slice(1)))) + 1;
const masterRows = [], detailRows = [], tagRows = [], imageRows = [];

for (const m of news) {
  const key = `${m.pref}|${m.name}`;
  const c = cache[key] || {};
  const ov = OVERRIDES[key] || {};
  const p = pct(c.pv || 0);
  const id = 'C' + String(seq++).padStart(3, '0');

  // 攻/防は100倍スケール（迫力重視。既存カードも同スケール）
  const attack = ov.attack ?? Math.max(16, Math.min(88, Math.round(18 + 62 * Math.pow(p, 1.6)))) * 100;
  const typeF = m.name.endsWith('区') ? 0.72 : m.name.endsWith('市') ? 0.62 : m.name.endsWith('町') ? 0.5 : 0.42;
  const defense = ov.defense ?? Math.max(800, (Math.round(attack * typeF / 100) + (hash(m.name) % 7) - 3) * 100);
  const rarity = ov.rarity ?? (p >= 0.97 ? 'SR' : p >= 0.72 ? 'R' : 'N');

  // 自動タグ + 手動タグ
  const tags = new Set(ov.tags || []);
  if (POLITICAL_CITIES.has(m.name)) tags.add('政令指定都市');
  if (CAPITALS.has(m.name)) tags.add('県庁所在地');
  if (m.pref === '東京都' && m.name.endsWith('区')) tags.add('東京23区');
  if (m.name.endsWith('村')) tags.add('村');
  const stem = m.name.replace(/(市|町|村|区)$/, '');
  if (stem && /^[ぁ-ゖー]+$/.test(stem)) tags.add('ひらがな');

  // 豆知識: 手動 > Wikipedia冒頭文 > 自治体キャッチコピー
  let desc = ov.desc || '';
  if (!desc && c.extract) {
    desc = c.extract.replace(/\s+/g, ' ').trim();
    const cut = desc.indexOf('。', 30);
    desc = cut > 0 ? desc.slice(0, Math.min(cut + 1, 90)) : desc.slice(0, 90);
  }
  if (!desc) desc = m.phrase.slice(0, 60) || `${m.pref}の自治体`;

  masterRows.push([id, m.name, m.kana, 'city', m.pref, rarity, attack, defense]);
  detailRows.push([id, attack, defense, desc]);
  for (const t of tags) tagRows.push([id, t]);
  if (c.thumb) imageRows.push([id, c.thumb, c.title || m.name, '(Wikipedia代表画像)', 'Wikimedia Commons', `https://ja.wikipedia.org/wiki/${encodeURIComponent(c.title || m.name)}`]);
}

// ---- 5. CSV追記 ----
const append = (file, rows) => appendFileSync(path.join(ROOT, 'data', file), rows.map(r => r.map(esc).join(',')).join('\n') + '\n', 'utf8');
append('card_master.csv', masterRows.map(r => [r[0], r[1], r[2], r[3], r[4], r[5]]));
append('card_detail.csv', detailRows);
if (tagRows.length) append('card_tag.csv', tagRows);
if (imageRows.length) append('card_image.csv', imageRows);

// タグ・シナジー・既存カードタグ（重複追加を防いで追記）
const tagMaster = new Set(parseCSV(readFileSync(path.join(ROOT, 'data/tag_master.csv'), 'utf8')).map(t => t.tag));
const addTagDefs = NEW_TAGS.filter(([t]) => !tagMaster.has(t)).concat(tagMaster.has('村') ? [] : [['村', '日本の原風景が残る村。じわじわ強い']]);
if (addTagDefs.length) append('tag_master.csv', addTagDefs);

const synIds = new Set(parseCSV(readFileSync(path.join(ROOT, 'data/synergy_master.csv'), 'utf8')).map(s => s.id));
const addSyn = NEW_SYNERGIES.filter(([id]) => !synIds.has(id));
if (addSyn.length) append('synergy_master.csv', addSyn.concat(synIds.has('SY40') ? [] : [['SY40', '村の底力', '村', 3, 2.5, '限界集落なんて言わせない。村には村の意地がある']]));

const existingTagPairs = new Set(parseCSV(readFileSync(path.join(ROOT, 'data/card_tag.csv'), 'utf8')).map(r => `${r.card_id}|${r.tag}`));
const nameToId = new Map(master.map(m => [m.name, m.id]));
const extraRows = [];
for (const [name, tags] of Object.entries(EXISTING_TAG_ADDS)) {
  const cid = nameToId.get(name);
  if (!cid) { console.log(`既存タグ付与スキップ（カードなし）: ${name}`); continue; }
  for (const t of tags) if (!existingTagPairs.has(`${cid}|${t}`)) extraRows.push([cid, t]);
}
if (extraRows.length) append('card_tag.csv', extraRows);

console.log(`追加カード: ${masterRows.length}枚 / タグ行: ${tagRows.length + extraRows.length} / 画像URL: ${imageRows.length}`);
console.log(`新タグ定義: ${addTagDefs.length} / 新シナジー: ${addSyn.length ? addSyn.length + 1 : 0}`);
const noDesc = detailRows.filter(r => String(r[3]).endsWith('の自治体')).length;
console.log(`豆知識フォールバック(要確認): ${noDesc}件`);
