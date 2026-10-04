/**
 * Japanese word splitter for N5 content.
 *
 * Splits Japanese text into tokens and maps every word token to vocabulary ids
 * (content/vocab.json), recognising the N5 inflections of verbs and
 * adjectives. Used to record which words an example sentence uses, to check
 * that a sentence only uses words the learner has been taught, and to validate
 * AI output against a whitelist (build the lexicon from the taught words only;
 * everything else then comes back as `unknown`).
 *
 * Pure TypeScript with no runtime imports: runs in the browser (Safari 15+, no
 * regex lookbehind), in the Cloudflare Worker and in Node scripts.
 *
 * How it works
 * ------------
 * 1. `createLexicon()` GENERATES surface forms from dictionary forms (no
 *    deinflection). Every entry is expanded for each of its spellings (kanji
 *    as written in the vocabulary, kana, and the few extra spellings in
 *    `SPELLING_VARIANTS`):
 *    - verbs (v5*, v1, vk, vs-i, v5k-s, v5r-i): dictionary form, ます ました
 *      ません ませんでした ましょう ましょうか, stem + たい たくない たかった
 *      たくなかった たくて, て/で, た/だ, たら, たり, ない なかった なく なくて
 *      ないで, volitional (よう/おう), ながら, なさい, and the bare masu stem
 *      (only accepted directly before に, as in 見に行く, and only when no
 *      other word has the same surface: 休み is the noun).
 *      Irregulars: する, 来る/くる (きて, こない, こよう), 行く (いって),
 *      ある (ない, なかった).
 *    - i-adjectives: dictionary form, く くない かった くなかった くて くなくて
 *      かったら; adj-ix いい conjugates from よ (よく, よかった) and also accepts
 *      よい and 良い.
 *    - suru nouns (vs): the noun alone plus noun + every する form above.
 *    - everything else (nouns, na-adjectives, adverbs, ...): the bare form;
 *      な, に, です, だ and friends are separate grammar tokens.
 *    Kana spellings of words that have a kanji spelling are "weak": a single
 *    kana (て for 手, は for 歯) is not generated at all, and a weak word loses
 *    to a grammar word with the same surface (くらい is the particle, not 暗い;
 *    さん after a name is the suffix, not 三).
 *
 * 2. `tokenize()` is a longest-match segmenter run as a small dynamic
 *    programme, so a greedy choice that would strand the rest of the sentence
 *    is avoided (これはいいです must not become これ / はい / い / です).
 *    Parses are compared by:
 *      a. fewest rule violations (see `violations` in `tokenize`),
 *      b. fewest characters left unknown,
 *      c. fewest "noun directly followed by a content word" joins (prefers
 *         あれ / は / なに over あれ / はな / に),
 *      d. longest first token (classic left-to-right longest match),
 *      e. kind at equal length: number > vocabulary word > grammar word >
 *         weak vocabulary word (a counter beats a word right after a number).
 *    Rules (each broken rule is one violation):
 *    - particles and the copula cannot open a clause (but may follow 」) or
 *      follow は/が/を/も/や; が/を/に/へ/で/と and the copula cannot follow
 *      に/へ/で/と; nothing but a particle may follow the copula;
 *    - honorific お/ご must be followed by a vocabulary word, a bare masu
 *      stem by に, a name suffix (さん) by nothing but a word or unknown run;
 *    - a token cannot start with a small kana or ー, and を is never unknown;
 *    - a weak hiragana word, or one starting with い (いて, いた), cannot
 *      follow an unknown kanji: it is okurigana of the unknown word (生きて);
 *    - a particle between two unknown hiragana runs belongs to the word
 *      (しっかり, not しっ + か + り), except は/を/へ/の;
 *    - a katakana or kanji run is covered by known tokens or split only at
 *      known words of at least 3 katakana / 2 kanji (or a kanji word with
 *      okurigana ending the run), so ペンキ stays whole instead of ペン + キ
 *      and 日本語 instead of 日 + 本 + 語, while 再来年引退 gives 再来年 + 引退.
 *    Kana-only conjunctions and expressions that are also grammar (でも, では)
 *    are read as vocabulary only at the start of a clause.
 *
 * Numbers (ASCII and full-width digits, kanji numerals 〇一二三四五六七八九十百
 * 千万 when they are not part of a longer word such as 一つ or 八百屋),
 * punctuation (one token per character, runs of spaces or of the same mark
 * merged; ー counts as punctuation only when it does not follow kana) and Latin
 * letters get their own kinds. Any other unmatched run of characters becomes a
 * single `unknown` token.
 */

/* ------------------------------------------------------------------- types */

export interface LexEntry {
  id: string;
  kana: string;
  kanji?: string;
  pos: readonly string[];
}

export type TokenKind = 'word' | 'grammar' | 'number' | 'punct' | 'latin' | 'unknown';

/** Inflection names produced by `inflections()` and reported on word tokens. */
export type InflectionForm =
  | 'dict'
  | 'stem'
  | 'masu'
  | 'mashita'
  | 'masen'
  | 'masen-deshita'
  | 'mashou'
  | 'mashou-ka'
  | 'tai'
  | 'takunai'
  | 'takatta'
  | 'takunakatta'
  | 'takute'
  | 'te'
  | 'ta'
  | 'tara'
  | 'tari'
  | 'nai'
  | 'nakatta'
  | 'naku'
  | 'nakute'
  | 'naide'
  | 'volitional'
  | 'nagara'
  | 'nasai'
  | 'ku'
  | 'kunai'
  | 'katta'
  | 'kunakatta'
  | 'kute'
  | 'kunakute'
  | 'kattara';

export interface Token {
  surface: string;
  /** UTF-16 offsets into the input: `text.slice(start, end) === surface`. */
  start: number;
  end: number;
  kind: TokenKind;
  /** Every vocabulary id the surface could be (dictionary forms first); empty unless kind is 'word'. */
  wordIds: string[];
  /** Dictionary form (same spelling as the surface) when the first candidate is inflected. */
  base?: string;
  /** Inflection of the first candidate when it is inflected. */
  form?: InflectionForm;
  /**
   * Key from `GRAMMAR_WORDS` for kind 'grammar'. On a 'word' token it names a
   * grammar word with the same surface (より, など, でも), so callers can accept
   * either reading.
   */
  grammar?: string;
}

export type GrammarRole =
  | 'particle'
  | 'copula'
  | 'ending'
  | 'polite'
  | 'prefix'
  | 'suffix'
  | 'noun'
  | 'adverb'
  | 'counter';

/**
 * Where a grammar word may appear, judged by the token before it:
 * - number: after a number (３, 三, 何, なん, いち) - counters;
 * - predicate: after a verb or adjective form or the copula;
 * - predicate-or-na: as above, or after the particle な;
 * - content: after a word or an unknown word (not after a particle).
 */
export type GrammarContext = 'number' | 'predicate' | 'predicate-or-na' | 'content';

export interface GrammarWord {
  /** Stable key, used to gate grammar by lesson. */
  key: string;
  surfaces: readonly string[];
  role: GrammarRole;
  /** Short developer note in English. */
  en: string;
  after?: GrammarContext;
  /** Only recognised when the text continues with one of these strings. */
  before?: readonly string[];
}

function gw(
  role: GrammarRole,
  key: string,
  surfaces: readonly string[],
  en: string,
  extra: { after?: GrammarContext; before?: readonly string[] } = {},
): GrammarWord {
  return { key, surfaces, role, en, ...extra };
}

function counter(key: string, surfaces: readonly string[], en: string): GrammarWord {
  return gw('counter', key, surfaces, en, { after: 'number' });
}

/**
 * Function words and endings that are not vocabulary entries but are needed
 * to read N5 sentences. A surface listed here and in the vocabulary (より,
 * など, でも) is reported as the vocabulary word with `grammar` set to the key.
 *
 * Particles:   wa は, ga が, ga-but が ("but", after a predicate), wo を,
 *              ni に, e へ, de で, to と, mo も, no の, ka か, yo よ, ne ね,
 *              na な, ya や, kara から, made まで, yori より, dake だけ,
 *              shika しか, kurai くらい, gurai ぐらい, goro ごろ/頃,
 *              nado など, kedo けど, keredo けれど/けれども, demo でも,
 *              node ので, n ん (explanatory, before です/だ).
 * Endings:     yone よね.
 * Copula:      desu, deshita, deshou, da, datta, darou, dewa-arimasen,
 *              ja-arimasen, dewa-arimasen-deshita, ja-arimasen-deshita,
 *              dewa-nai, ja-nai, dewa-nakatta, ja-nakatta.
 * Polite:      gozaimasu ございます/ございました.
 * Prefixes:    o-prefix お, go-prefix ご (only before a vocabulary word).
 * Suffixes:    san さん, chan ちゃん, kun くん, sama さま/様, tachi たち/達.
 * Nouns:       toki とき/時, koto こと/事, hou ほう (comparisons),
 *              you よう (ように, ようです).
 * Adverbs:     sou そう (そうです).
 * Counters (only after a number or 何): ji 時, fun 分, byou 秒, shuukan 週間,
 *              kagetsu か月, nen 年, gatsu 月, nichi 日, youbi 曜日, en 円,
 *              nin 人, sai 歳, tsu つ, ko 個, hon 本, mai 枚, satsu 冊,
 *              hiki 匹, dai 台, kai 回, kai-floor 階, hai 杯, ban 番, do 度.
 */
export const GRAMMAR_WORDS: readonly GrammarWord[] = [
  // Particles
  gw('particle', 'wa', ['は'], 'topic marker'),
  gw('particle', 'ga', ['が'], 'subject marker'),
  gw('particle', 'ga-but', ['が'], '"but" after a predicate', { after: 'predicate' }),
  gw('particle', 'wo', ['を'], 'direct object marker'),
  gw('particle', 'ni', ['に'], 'target, point in time, place of existence'),
  gw('particle', 'e', ['へ'], 'direction'),
  gw('particle', 'de', ['で'], 'place of action, means'),
  gw('particle', 'to', ['と'], '"and", "with", quotation'),
  gw('particle', 'mo', ['も'], '"also", "too"'),
  gw('particle', 'no', ['の'], 'possession, nominaliser'),
  gw('particle', 'ka', ['か'], 'question, "or"'),
  gw('particle', 'yo', ['よ'], 'sentence-final assertion'),
  gw('particle', 'ne', ['ね'], 'sentence-final agreement'),
  gw('particle', 'na', ['な'], 'na-adjective linker, prohibition', { after: 'content' }),
  gw('particle', 'ya', ['や'], 'non-exhaustive "and"'),
  gw('particle', 'kara', ['から'], '"from", "because"'),
  gw('particle', 'made', ['まで'], '"until", "as far as"'),
  gw('particle', 'yori', ['より'], '"than"'),
  gw('particle', 'dake', ['だけ'], '"only"'),
  gw('particle', 'shika', ['しか'], '"only" (with a negative)'),
  gw('particle', 'kurai', ['くらい'], '"about", "approximately"'),
  gw('particle', 'gurai', ['ぐらい'], '"about", "approximately"'),
  gw('particle', 'goro', ['ごろ', '頃'], '"around" a point in time'),
  gw('particle', 'nado', ['など'], '"and so on"'),
  gw('particle', 'kedo', ['けど'], '"but" (casual)'),
  gw('particle', 'keredo', ['けれど', 'けれども'], '"but"'),
  gw('particle', 'demo', ['でも'], '"even", "or something"'),
  gw('particle', 'node', ['ので'], '"because"'),
  gw('particle', 'n', ['ん'], 'explanatory ん (んです)', {
    after: 'predicate-or-na',
    before: ['です', 'でした', 'でしょう', 'だ', 'じゃ', 'では'],
  }),
  // Sentence endings
  gw('ending', 'yone', ['よね'], 'sentence-final よ + ね'),
  // Copula
  gw('copula', 'desu', ['です'], 'polite copula'),
  gw('copula', 'deshita', ['でした'], 'polite copula, past'),
  gw('copula', 'deshou', ['でしょう'], 'probably'),
  gw('copula', 'da', ['だ'], 'plain copula'),
  gw('copula', 'datta', ['だった'], 'plain copula, past'),
  gw('copula', 'darou', ['だろう'], 'probably (plain)'),
  gw('copula', 'dewa-arimasen', ['ではありません'], 'polite negative copula'),
  gw('copula', 'ja-arimasen', ['じゃありません'], 'polite negative copula (spoken)'),
  gw('copula', 'dewa-arimasen-deshita', ['ではありませんでした'], 'polite negative copula, past'),
  gw('copula', 'ja-arimasen-deshita', ['じゃありませんでした'], 'polite negative past (spoken)'),
  gw('copula', 'dewa-nai', ['ではない'], 'plain negative copula'),
  gw('copula', 'ja-nai', ['じゃない'], 'plain negative copula (spoken)'),
  gw('copula', 'dewa-nakatta', ['ではなかった'], 'plain negative copula, past'),
  gw('copula', 'ja-nakatta', ['じゃなかった'], 'plain negative past (spoken)'),
  // Polite verb forms that are not vocabulary entries
  gw('polite', 'gozaimasu', ['ございます', 'ございました'], 'polite "to be" (ありがとうございます)'),
  // Honorific prefixes
  gw('prefix', 'o-prefix', ['お'], 'honorific お before a word'),
  gw('prefix', 'go-prefix', ['ご'], 'honorific ご before a word'),
  // Suffixes
  gw('suffix', 'san', ['さん'], 'Mr/Ms'),
  gw('suffix', 'chan', ['ちゃん'], 'affectionate suffix'),
  gw('suffix', 'kun', ['くん'], 'suffix for boys'),
  gw('suffix', 'sama', ['さま', '様'], 'very polite Mr/Ms'),
  gw('suffix', 'tachi', ['たち', '達'], 'plural for people'),
  // Formal nouns and adverbs
  gw('noun', 'toki', ['とき', '時'], '"when", "time"'),
  gw('noun', 'koto', ['こと', '事'], '"thing", nominaliser'),
  gw('noun', 'hou', ['ほう'], '"side", comparisons (～のほうが)'),
  gw('noun', 'you', ['よう'], '"way", "like" (～のように, ～ようです)'),
  gw('adverb', 'sou', ['そう'], '"so", "that way" (そうです)'),
  // Counters
  counter('ji', ['時', 'じ'], "o'clock"),
  counter('fun', ['分', 'ふん', 'ぷん'], 'minutes'),
  counter('byou', ['秒', 'びょう'], 'seconds'),
  counter('shuukan', ['週間', 'しゅうかん'], 'weeks (duration)'),
  counter('kagetsu', ['か月', 'ヶ月', 'カ月', 'ヵ月', 'かげつ'], 'months (duration)'),
  counter('nen', ['年', 'ねん'], 'years'),
  counter('gatsu', ['月', 'がつ'], 'month names'),
  counter('nichi', ['日', 'にち'], 'days, dates'),
  counter('youbi', ['曜日', 'ようび'], 'day of the week (何曜日)'),
  counter('en', ['円', 'えん'], 'yen'),
  counter('nin', ['人', 'にん'], 'people'),
  counter('sai', ['歳', '才', 'さい'], 'years of age'),
  counter('tsu', ['つ'], 'general counter (３つ)'),
  counter('ko', ['個', 'こ'], 'small objects'),
  counter('hon', ['本', 'ほん', 'ぼん', 'ぽん'], 'long objects'),
  counter('mai', ['枚', 'まい'], 'flat objects'),
  counter('satsu', ['冊', 'さつ'], 'books'),
  counter('hiki', ['匹', 'ひき', 'びき', 'ぴき'], 'small animals'),
  counter('dai', ['台', 'だい'], 'machines, vehicles'),
  counter('kai', ['回', 'かい'], 'times, occurrences'),
  counter('kai-floor', ['階', 'がい'], 'floors'),
  counter('hai', ['杯', 'はい', 'ばい', 'ぱい'], 'cups, glasses'),
  counter('ban', ['番', 'ばん'], 'number in a sequence'),
  counter('do', ['度', 'ど'], 'times, degrees'),
];

/**
 * Extra spellings for vocabulary entries, keyed by the entry's main written
 * form (`kanji`, or `kana` for kana-only entries). Covers common kanji for
 * words the vocabulary lists in kana, modern okurigana, ご飯 for 御飯, and the
 * everyday readings わたし (私) and なに (何).
 */
export const SPELLING_VARIANTS: Readonly<Record<string, readonly string[]>> = {
  ください: ['下さい'],
  できる: ['出来る'],
  いい: ['良い'],
  おいしい: ['美味しい'],
  おもしろい: ['面白い'],
  かわいい: ['可愛い'],
  ほんとう: ['本当'],
  たいへん: ['大変'],
  たくさん: ['沢山'],
  たぶん: ['多分'],
  ちょうど: ['丁度'],
  みんな: ['皆'],
  ほか: ['他'],
  いす: ['椅子'],
  かぎ: ['鍵'],
  かばん: ['鞄'],
  はし: ['箸'],
  ちゃわん: ['茶碗'],
  しょうゆ: ['醤油'],
  おなか: ['お腹'],
  おまわりさん: ['お巡りさん'],
  はく: ['履く'],
  かける: ['掛ける'],
  つける: ['付ける'],
  かかる: ['掛かる'],
  あびる: ['浴びる'],
  さようなら: ['さよなら'],
  じゃ: ['じゃあ'],
  終る: ['終わる'],
  曲る: ['曲がる'],
  御飯: ['ご飯'],
  晩御飯: ['晩ご飯'],
  昼御飯: ['昼ご飯'],
  朝ごはん: ['朝ご飯'],
  子供: ['子ども'],
  入口: ['入り口'],
  伯母さん: ['叔母さん'],
  私: ['わたし'],
  何: ['なに'],
};

/* ------------------------------------------------------------- inflection */

export interface Inflection {
  surface: string;
  /** Dictionary form in the same spelling. */
  base: string;
  form: InflectionForm;
}

interface RawForm extends Inflection {
  /** Produced by verb or adjective conjugation (or the dictionary form of one). */
  verbal: boolean;
  /** Finite form that can end a clause (食べる, 食べました, 高い, 高かった). */
  predicate: boolean;
}

type VerbClass = 'godan' | 'iku' | 'aru' | 'ichidan' | 'kuru' | 'suru';

const GODAN_ROWS: Readonly<
  Record<string, { i: string; a: string; o: string; te: string; ta: string }>
> = {
  う: { i: 'い', a: 'わ', o: 'お', te: 'って', ta: 'った' },
  く: { i: 'き', a: 'か', o: 'こ', te: 'いて', ta: 'いた' },
  ぐ: { i: 'ぎ', a: 'が', o: 'ご', te: 'いで', ta: 'いだ' },
  す: { i: 'し', a: 'さ', o: 'そ', te: 'して', ta: 'した' },
  つ: { i: 'ち', a: 'た', o: 'と', te: 'って', ta: 'った' },
  ぬ: { i: 'に', a: 'な', o: 'の', te: 'んで', ta: 'んだ' },
  ぶ: { i: 'び', a: 'ば', o: 'ぼ', te: 'んで', ta: 'んだ' },
  む: { i: 'み', a: 'ま', o: 'も', te: 'んで', ta: 'んだ' },
  る: { i: 'り', a: 'ら', o: 'ろ', te: 'って', ta: 'った' },
};

const GODAN_POS = new Set([
  'v5u',
  'v5u-s',
  'v5k',
  'v5g',
  'v5s',
  'v5t',
  'v5n',
  'v5b',
  'v5m',
  'v5r',
  'v5aru',
]);

function verbClass(pos: readonly string[]): VerbClass | null {
  for (const p of pos) {
    if (p === 'v1' || p === 'v1-s') return 'ichidan';
    if (p === 'vk') return 'kuru';
    if (p === 'vs-i' || p === 'vs-s') return 'suru';
    if (p === 'v5k-s') return 'iku';
    if (p === 'v5r-i') return 'aru';
    if (GODAN_POS.has(p)) return 'godan';
  }
  return null;
}

interface Stems {
  /** masu stem (連用形). */
  i: string;
  /** Prefix for ない (未然形); for ある this is the empty prefix of ない. */
  a: string;
  te: string;
  ta: string;
  vol: string;
}

function verbStems(s: string, cls: VerbClass): Stems | null {
  if (cls === 'ichidan') {
    if (!s.endsWith('る') || s.length < 2) return null;
    const r = s.slice(0, -1);
    return { i: r, a: r, te: `${r}て`, ta: `${r}た`, vol: `${r}よう` };
  }
  if (cls === 'kuru') {
    const p = s.slice(0, -2);
    if (s.endsWith('来る')) {
      return { i: `${p}来`, a: `${p}来`, te: `${p}来て`, ta: `${p}来た`, vol: `${p}来よう` };
    }
    if (s.endsWith('くる')) {
      return { i: `${p}き`, a: `${p}こ`, te: `${p}きて`, ta: `${p}きた`, vol: `${p}こよう` };
    }
    return null;
  }
  if (cls === 'suru') {
    if (!s.endsWith('する')) return null;
    const p = s.slice(0, -2);
    return { i: `${p}し`, a: `${p}し`, te: `${p}して`, ta: `${p}した`, vol: `${p}しよう` };
  }
  const row = GODAN_ROWS[s.slice(-1)];
  if (row === undefined || s.length < 2) return null;
  const r = s.slice(0, -1);
  const stems: Stems = {
    i: r + row.i,
    a: r + row.a,
    te: r + row.te,
    ta: r + row.ta,
    vol: `${r}${row.o}う`,
  };
  if (cls === 'iku') {
    stems.te = `${r}って`;
    stems.ta = `${r}った`;
  }
  // ある: the negative is plain ない (not あらない).
  if (cls === 'aru') stems.a = s.slice(0, -2);
  return stems;
}

function verbForms(s: string, cls: VerbClass): RawForm[] | null {
  const st = verbStems(s, cls);
  if (st === null) return null;
  const out: RawForm[] = [];
  const add = (surface: string, form: InflectionForm, predicate: boolean): void => {
    out.push({ surface, base: s, form, verbal: true, predicate });
  };
  add(s, 'dict', true);
  add(`${st.i}ます`, 'masu', true);
  add(`${st.i}ました`, 'mashita', true);
  add(`${st.i}ません`, 'masen', true);
  add(`${st.i}ませんでした`, 'masen-deshita', true);
  add(`${st.i}ましょう`, 'mashou', true);
  add(`${st.i}ましょうか`, 'mashou-ka', true);
  add(`${st.i}たい`, 'tai', true);
  add(`${st.i}たくない`, 'takunai', true);
  add(`${st.i}たかった`, 'takatta', true);
  add(`${st.i}たくなかった`, 'takunakatta', true);
  add(`${st.i}たくて`, 'takute', false);
  add(st.te, 'te', false);
  add(st.ta, 'ta', true);
  add(`${st.ta}ら`, 'tara', false);
  add(`${st.ta}り`, 'tari', false);
  add(`${st.a}ない`, 'nai', true);
  add(`${st.a}なかった`, 'nakatta', true);
  add(`${st.a}なく`, 'naku', false);
  add(`${st.a}なくて`, 'nakute', false);
  add(`${st.a}ないで`, 'naide', false);
  add(st.vol, 'volitional', true);
  add(`${st.i}ながら`, 'nagara', false);
  add(`${st.i}なさい`, 'nasai', true);
  // The bare stem (見に行く, 買いに行く); a single kana stem (き, し, み) is too ambiguous.
  if (st.i.length >= 2 || isKanjiString(st.i)) add(st.i, 'stem', false);
  return out;
}

function adjectiveForms(s: string, ix: boolean): RawForm[] | null {
  if (!s.endsWith('い') || s.length < 2) return null;
  const out: RawForm[] = [];
  const add = (surface: string, form: InflectionForm, predicate: boolean): void => {
    out.push({ surface, base: s, form, verbal: true, predicate });
  };
  add(s, 'dict', true);
  let k = s.slice(0, -1);
  if (ix && s.endsWith('いい')) {
    // いい conjugates from よい: よく, よかった, ...
    k = `${s.slice(0, -2)}よ`;
    add(`${k}い`, 'dict', true);
  }
  add(`${k}く`, 'ku', false);
  add(`${k}くない`, 'kunai', true);
  add(`${k}かった`, 'katta', true);
  add(`${k}くなかった`, 'kunakatta', true);
  add(`${k}くて`, 'kute', false);
  add(`${k}くなくて`, 'kunakute', false);
  add(`${k}かったら`, 'kattara', false);
  return out;
}

function formsOfSpelling(s: string, pos: readonly string[]): RawForm[] {
  const bare: RawForm = { surface: s, base: s, form: 'dict', verbal: false, predicate: false };
  const cls = verbClass(pos);
  if (cls !== null) return verbForms(s, cls) ?? [bare];
  if (pos.includes('adj-ix')) return adjectiveForms(s, true) ?? [bare];
  if (pos.includes('adj-i')) return adjectiveForms(s, false) ?? [bare];
  if (pos.includes('vs')) {
    // Suru noun: the noun alone, plus noun + する in every verb form.
    const noun = s.endsWith('する') && s.length > 2 ? s.slice(0, -2) : s;
    const nounForm: RawForm = { ...bare, surface: noun, base: noun };
    return [nounForm, ...(verbForms(`${noun}する`, 'suru') ?? [])];
  }
  return [bare];
}

function spellingsOf(entry: LexEntry): string[] {
  const main = entry.kanji ?? entry.kana;
  const out = [main, entry.kana, ...(SPELLING_VARIANTS[main] ?? [])];
  return [...new Set(out.filter((s) => s.length > 0))];
}

/** Every surface form generated for an entry, over all its spellings. */
export function inflections(entry: LexEntry): Inflection[] {
  const out: Inflection[] = [];
  const seen = new Set<string>();
  for (const spelling of spellingsOf(entry)) {
    for (const f of formsOfSpelling(spelling, entry.pos)) {
      if (seen.has(f.surface)) continue;
      seen.add(f.surface);
      out.push({ surface: f.surface, base: f.base, form: f.form });
    }
  }
  return out;
}

/* ---------------------------------------------------------------- lexicon */

/** One vocabulary reading of a surface. */
export interface LexReading {
  id: string;
  /** Index of the entry in the input, used for stable ordering. */
  order: number;
  base: string;
  form: InflectionForm;
  /** Kana spelling of a word normally written with kanji. */
  weak: boolean;
  /** Finite verb or adjective form. */
  predicate: boolean;
  /** Bare masu stem, only valid before に. */
  stem: boolean;
  /** Noun, pronoun or na-adjective in its bare form (normally followed by a particle). */
  nominal: boolean;
  /** Number word or 何: counters may follow. */
  numeric: boolean;
  /** The entry itself is a particle (より, など). */
  particle: boolean;
  /** Read as this word only at the start of a clause (でも, では). */
  clauseInitial: boolean;
}

export interface SurfaceInfo {
  readonly words: readonly LexReading[];
  readonly grammar: readonly GrammarWord[];
}

/** Trie over all surfaces keyed by UTF-16 code unit, used for matching. */
export interface TrieNode {
  info: SurfaceInfo | undefined;
  next: Map<number, TrieNode> | undefined;
}

export interface Lexicon {
  readonly entries: readonly LexEntry[];
  /** Every known surface (vocabulary forms and grammar words). Treat as read-only. */
  readonly surfaces: ReadonlyMap<string, SurfaceInfo>;
  readonly trie: TrieNode;
}

const KANA_ONLY = /^[ぁ-ゟ゠-ヿｦ-ﾟ]+$/;
const NUMERIC_KANJI = new Set(['何']);

function isKanjiString(s: string): boolean {
  if (s.length === 0) return false;
  for (const ch of s) {
    if (!isKanjiCode(ch.codePointAt(0) ?? 0)) return false;
  }
  return true;
}

/** True when `s` can be written entirely as a sequence of grammar surfaces (では = で + は). */
function splitsIntoGrammar(s: string, grammar: ReadonlySet<string>): boolean {
  const ok: boolean[] = new Array<boolean>(s.length + 1).fill(false);
  ok[0] = true;
  for (let i = 0; i < s.length; i++) {
    if (ok[i] !== true) continue;
    for (let j = i + 1; j <= s.length; j++) {
      if (grammar.has(s.slice(i, j))) ok[j] = true;
    }
  }
  return ok[s.length] === true;
}

/**
 * Precomputes every surface form of the given entries plus the grammar words.
 * Fast enough to build per request in a Worker (about 700 entries in a few ms).
 */
export function createLexicon(entries: readonly LexEntry[]): Lexicon {
  const words = new Map<string, LexReading[]>();
  const grammar = new Map<string, GrammarWord[]>();
  const plainGrammar = new Set<string>();

  for (const g of GRAMMAR_WORDS) {
    for (const s of g.surfaces) {
      const list = grammar.get(s);
      if (list === undefined) grammar.set(s, [g]);
      else list.push(g);
      if (g.role !== 'prefix' && g.role !== 'counter' && g.before === undefined) {
        plainGrammar.add(s);
      }
    }
  }

  entries.forEach((entry, order) => {
    const pos = entry.pos;
    const hasKanji = entry.kanji !== undefined && entry.kanji.length > 0;
    const nounLike =
      (pos.includes('n') || pos.includes('pn') || pos.includes('adj-na')) && !pos.includes('adv');
    const numericEntry = pos.includes('num') || NUMERIC_KANJI.has(entry.kanji ?? '');
    const particle = pos.includes('prt');
    const conjLike = pos.includes('conj') || pos.includes('exp') || pos.includes('int');
    for (const spelling of spellingsOf(entry)) {
      const weak = hasKanji && KANA_ONLY.test(spelling);
      for (const f of formsOfSpelling(spelling, pos)) {
        if (weak && f.surface.length === 1) continue;
        const reading: LexReading = {
          id: entry.id,
          order,
          base: f.base,
          form: f.form,
          weak,
          predicate: f.predicate,
          stem: f.form === 'stem',
          nominal: nounLike && !f.verbal,
          numeric: numericEntry && !f.verbal,
          particle,
          clauseInitial:
            conjLike && !f.verbal && KANA_ONLY.test(f.surface)
              ? splitsIntoGrammar(f.surface, plainGrammar)
              : false,
        };
        const list = words.get(f.surface);
        if (list === undefined) words.set(f.surface, [reading]);
        else list.push(reading);
      }
    }
  });

  const surfaces = new Map<string, SurfaceInfo>();
  for (const [surface, list] of words) {
    if (list.length === 1) {
      surfaces.set(surface, { words: list, grammar: grammar.get(surface) ?? [] });
      continue;
    }
    // A bare stem only counts when nothing else has the same surface (休み is the noun).
    const strong = list.some((r) => !r.stem) ? list.filter((r) => !r.stem) : list;
    strong.sort(
      (x, y) => Number(x.form !== 'dict') - Number(y.form !== 'dict') || x.order - y.order,
    );
    const seen = new Set<string>();
    const unique = strong.filter((r) => (seen.has(r.id) ? false : (seen.add(r.id), true)));
    surfaces.set(surface, { words: unique, grammar: grammar.get(surface) ?? [] });
  }
  for (const [surface, list] of grammar) {
    if (!surfaces.has(surface)) surfaces.set(surface, { words: [], grammar: list });
  }

  const trie: TrieNode = { info: undefined, next: undefined };
  for (const [surface, info] of surfaces) {
    let node = trie;
    for (let k = 0; k < surface.length; k++) {
      const code = surface.charCodeAt(k);
      node.next ??= new Map();
      let child = node.next.get(code);
      if (child === undefined) {
        child = { info: undefined, next: undefined };
        node.next.set(code, child);
      }
      node = child;
    }
    node.info = info;
  }

  return { entries, surfaces, trie };
}

/* -------------------------------------------------------------- characters */

const C_HIRA = 0;
const C_KATA = 1;
const C_KANJI = 2;
const C_DIGIT = 3;
const C_LATIN = 4;
const C_SPACE = 5;
const C_PUNCT = 6;
const C_OTHER = 7;
/** Second half of a surrogate pair. */
const C_CONT = 8;

const KANJI_NUMERALS = '〇一二三四五六七八九十百千万';
const SMALL_KANA = 'ぁぃぅぇぉっゃゅょゎゕゖァィゥェォッャュョヮㇰㇱㇲㇳㇴㇵㇶㇷㇸㇹㇺㇻㇼㇽㇾㇿｧｨｩｪｫｬｭｮｯ';
const LONG_MARKS = 'ーｰ';
const NUMBER_SEPARATORS = '.,．，';
const PUNCT_RE = /[\p{P}\p{S}]/u;
const SPACE_RE = /\s/u;

function isKanjiCode(cp: number): boolean {
  return (
    (cp >= 0x4e00 && cp <= 0x9fff) ||
    (cp >= 0x3400 && cp <= 0x4dbf) ||
    (cp >= 0xf900 && cp <= 0xfaff) ||
    (cp >= 0x20000 && cp <= 0x3134f) ||
    cp === 0x3005 || // 々
    cp === 0x3006 || // 〆
    cp === 0x3007 // 〇
  );
}

function baseClass(ch: string, cp: number): number {
  if (cp >= 0x3041 && cp <= 0x309f) return C_HIRA;
  if ((cp >= 0x30a1 && cp <= 0x30fa) || (cp >= 0x30fd && cp <= 0x30ff)) return C_KATA;
  if ((cp >= 0x31f0 && cp <= 0x31ff) || (cp >= 0xff66 && cp <= 0xff9f && cp !== 0xff70)) {
    return C_KATA;
  }
  if (isKanjiCode(cp)) return C_KANJI;
  if ((cp >= 0x30 && cp <= 0x39) || (cp >= 0xff10 && cp <= 0xff19)) return C_DIGIT;
  if (
    (cp >= 0x41 && cp <= 0x5a) ||
    (cp >= 0x61 && cp <= 0x7a) ||
    (cp >= 0xc0 && cp <= 0x24f && cp !== 0xd7 && cp !== 0xf7) ||
    (cp >= 0xff21 && cp <= 0xff3a) ||
    (cp >= 0xff41 && cp <= 0xff5a)
  ) {
    return C_LATIN;
  }
  if (SPACE_RE.test(ch)) return C_SPACE;
  if (PUNCT_RE.test(ch)) return C_PUNCT;
  return C_OTHER;
}

/* ------------------------------------------------------------- tokenizer */

// Parser states: what kind of token came before the current position.
const S_START = 0; // start of text, after punctuation
const S_NUMBER = 1; // after a number or 何 (counters allowed)
const S_NOMINAL = 2; // after a noun, pronoun or na-adjective
const S_WORD = 3; // after another word (adverb, adj-pn, te-form, ...)
const S_PRED = 4; // after a finite verb or adjective
const S_GRAM = 5; // after a particle
const S_CASE = 6; // after は が を も や (no particle or copula may follow)
const S_OBLIQUE = 7; // after に へ で と (no が を に へ で と or copula may follow)
const S_COPULA = 8; // after です, だ, ...
const S_NA = 9; // after な
const S_UNK = 10; // after an unknown run ending in katakana or another script
const S_UNK_HIRA = 11; // after an unknown run ending in hiragana
const S_UNK_KANJI = 12; // after an unknown run ending in kanji
const S_GRAM_UNK = 13; // after grammar words that follow an unknown hiragana run
const S_PREFIX = 14; // after お/ご (a word must follow)
const S_STEM = 15; // after a bare masu stem (に must follow)
const STATES = 16;

const CASE_KEYS = new Set(['wa', 'ga', 'wo', 'mo', 'ya']);
const OBLIQUE_KEYS = new Set(['ni', 'e', 'de', 'to']);
/** Particles that cannot follow に へ で と directly. */
const AFTER_OBLIQUE_BLOCKED = new Set(['ga', 'ga-but', 'wo', 'ni', 'e', 'de', 'to']);
/** Particles that practically never occur inside a word, so they always end an unknown run. */
const WORD_EDGE_KEYS = new Set(['wa', 'wo', 'e', 'no']);
/** Roles that cannot open a clause or follow は が を も や. */
const RESTRICTED_ROLES = new Set<GrammarRole>([
  'particle',
  'copula',
  'ending',
  'suffix',
  'counter',
]);

// Preference between steps of equal length (lower wins).
const R_NUMBER = 0;
const R_WORD = 1;
const R_GRAMMAR = 2;
const R_WEAK_WORD = 3;
const R_OTHER = 4;
const R_UNKNOWN_RUN = 5;
const R_UNKNOWN = 6;

/** Closing brackets and quotes: a particle may follow them (「…」と言った). */
const CLOSING_RE = /[\p{Pe}\p{Pf}]/u;
/** Shortest katakana word that may split a katakana run (テレビ|ゲーム but not ペン|キ). */
const MIN_KATAKANA_ANCHOR = 3;

interface Step {
  len: number;
  kind: TokenKind;
  /** State after this step (not used for grammar steps, which depend on the reading). */
  next: number;
  rank: number;
  /** Vocabulary readings valid at this position (kind 'word'). */
  words: readonly LexReading[];
  /**
   * Grammar words with this surface whose `before` condition holds; on a word
   * step, the grammar words sharing its surface (reported as `Token.grammar`).
   */
  grammar: readonly GrammarWord[];
  /** Word step with a content reading (not a particle such as より, not a number word). */
  content: boolean;
  /** Word or unknown step that starts with hiragana. */
  hiragana: boolean;
  /** Word step that would be okurigana after an unknown kanji (weak kana, or いて/いた ...). */
  okurigana: boolean;
  /** Unknown step covering a whole piece of a katakana or kanji run. */
  run: boolean;
  /** Unknown step over a character that is always a particle (を). */
  particleChar: boolean;
}

function afterOk(after: GrammarContext | undefined, state: number): boolean {
  switch (after) {
    case undefined:
      return true;
    case 'number':
      return state === S_NUMBER;
    case 'predicate':
      return state === S_PRED || state === S_COPULA;
    case 'predicate-or-na':
      return state === S_PRED || state === S_COPULA || state === S_NA;
    case 'content':
      return (
        state === S_NOMINAL ||
        state === S_WORD ||
        state === S_PRED ||
        state === S_UNK ||
        state === S_UNK_HIRA ||
        state === S_UNK_KANJI
      );
  }
}

/** Picks the grammar reading for a state: a context-specific word beats a general one. */
function chooseGrammar(list: readonly GrammarWord[], state: number): GrammarWord | null {
  let general: GrammarWord | null = null;
  for (const g of list) {
    if (!afterOk(g.after, state)) continue;
    if (g.after !== undefined) return g;
    general ??= g;
  }
  return general;
}

function wordState(words: readonly LexReading[]): number {
  if (words.some((r) => r.numeric)) return S_NUMBER;
  if (words.some((r) => r.predicate)) return S_PRED;
  if (words.every((r) => r.stem)) return S_STEM;
  if (words.every((r) => r.nominal)) return S_NOMINAL;
  return S_WORD;
}

function grammarState(g: GrammarWord, state: number): number {
  if (g.role === 'prefix') return S_PREFIX;
  if ((state === S_UNK_HIRA || state === S_GRAM_UNK) && !WORD_EDGE_KEYS.has(g.key)) {
    return S_GRAM_UNK;
  }
  if (g.role === 'copula') return S_COPULA;
  if (g.role === 'polite') return S_PRED;
  if (g.role === 'noun' || g.role === 'suffix' || g.role === 'counter') return S_NOMINAL;
  if (g.role === 'adverb') return S_WORD;
  if (g.key === 'na') return S_NA;
  if (CASE_KEYS.has(g.key)) return S_CASE;
  if (OBLIQUE_KEYS.has(g.key)) return S_OBLIQUE;
  return S_GRAM;
}

function makeStep(len: number, kind: TokenKind, rank: number, next: number): Step {
  return {
    len,
    kind,
    next,
    rank,
    words: [],
    grammar: [],
    content: false,
    hiragana: false,
    okurigana: false,
    run: false,
    particleChar: false,
  };
}

interface Scratch {
  viol: Int32Array;
  unk: Int32Array;
  join: Int32Array;
  len: Int32Array;
  rank: Int32Array;
  next: Int32Array;
  reachable: Uint8Array;
  step: (Step | undefined)[];
  grammar: (GrammarWord | null)[];
}

let scratchBuffers: Scratch | undefined;

/**
 * DP tables reused between calls (tokenize is synchronous, so sharing is safe);
 * only `reachable` needs clearing because every other cell that is read was
 * written earlier in the same call.
 */
function scratch(size: number): Scratch {
  if (scratchBuffers === undefined || scratchBuffers.viol.length < size) {
    const cap = Math.max(size, 1024);
    scratchBuffers = {
      viol: new Int32Array(cap),
      unk: new Int32Array(cap),
      join: new Int32Array(cap),
      len: new Int32Array(cap),
      rank: new Int32Array(cap),
      next: new Int32Array(cap),
      reachable: new Uint8Array(cap),
      step: new Array<Step | undefined>(cap).fill(undefined),
      grammar: new Array<GrammarWord | null>(cap).fill(null),
    };
  } else {
    scratchBuffers.reachable.fill(0, 0, size);
  }
  return scratchBuffers;
}

/**
 * Splits `text` into tokens. Every character belongs to exactly one token and
 * tokens are returned in order, so joining the surfaces gives back the text.
 */
export function tokenize(text: string, lexicon: Lexicon): Token[] {
  const n = text.length;
  if (n === 0) return [];

  // Character classes per UTF-16 unit.
  const cls = new Uint8Array(n);
  const dependent = new Uint8Array(n);
  const numeral = new Uint8Array(n);
  const closing = new Uint8Array(n);
  for (let i = 0; i < n; ) {
    const cp = text.codePointAt(i) ?? 0;
    const width = cp > 0xffff ? 2 : 1;
    const ch = text.slice(i, i + width);
    let c = baseClass(ch, cp);
    if (LONG_MARKS.includes(ch)) {
      const prev = i > 0 ? (cls[i - 1] ?? C_OTHER) : C_OTHER;
      const afterKana = prev === C_HIRA || prev === C_KATA;
      c = afterKana ? prev : C_PUNCT;
      if (afterKana) dependent[i] = 1;
    } else if (SMALL_KANA.includes(ch)) {
      dependent[i] = 1;
    } else if (c === C_PUNCT && CLOSING_RE.test(ch)) {
      closing[i] = 1;
    }
    if (KANJI_NUMERALS.includes(ch)) numeral[i] = 1;
    cls[i] = c;
    if (width === 2) cls[i + 1] = C_CONT;
    i += width;
  }
  const classAt = (i: number): number => cls[i] ?? C_OTHER;
  const widthAt = (i: number): number => (i + 1 < n && classAt(i + 1) === C_CONT ? 2 : 1);
  const clauseStart = (i: number): boolean => {
    if (i === 0) return true;
    let j = i - 1;
    while (j > 0 && classAt(j) === C_CONT) j--;
    const p = classAt(j);
    return (p === C_SPACE || p === C_PUNCT) && closing[j] !== 1;
  };

  /** End of the number starting at i (digits, kanji numerals, 3.5, 1,000). */
  const numberEnd = (i: number): number => {
    let j = i + 1;
    for (;;) {
      if (j < n && (classAt(j) === C_DIGIT || numeral[j] === 1)) {
        j++;
      } else if (
        j + 1 < n &&
        NUMBER_SEPARATORS.includes(text.charAt(j)) &&
        classAt(j - 1) === C_DIGIT &&
        classAt(j + 1) === C_DIGIT
      ) {
        j += 2;
      } else {
        return j;
      }
    }
  };

  // End of the katakana or kanji run containing each position (0 elsewhere).
  const runEnd = new Int32Array(n);
  for (let i = 0; i < n; ) {
    const c = classAt(i);
    let j = i + widthAt(i);
    if (c === C_KATA || c === C_KANJI) {
      while (j < n && (classAt(j) === c || classAt(j) === C_CONT)) j++;
      runEnd.fill(j, i, j);
    }
    i = j;
  }
  // Known words may split a katakana or kanji run; an unknown piece of a run
  // must run from a run start or anchor end to a run end or anchor start.
  const anchorStart = new Uint8Array(n + 1);
  const anchorEnd = new Uint8Array(n + 1);

  // Pass 1: steps that do not depend on the parser state, except unknown runs.
  const steps: Step[][] = new Array<Step[]>(n);
  for (let i = 0; i < n; ) {
    const c = classAt(i);
    const width = widthAt(i);
    const list: Step[] = [];
    steps[i] = list;
    if (c === C_SPACE || c === C_PUNCT || c === C_LATIN || c === C_DIGIT) {
      let j = i + width;
      if (c === C_SPACE || c === C_LATIN) {
        while (j < n && classAt(j) === c) j++;
      } else if (c === C_PUNCT) {
        // One token per mark; runs of the same mark (……, !!) stay together.
        const ch = text.slice(i, i + width);
        while (j < n && classAt(j) === C_PUNCT && text.startsWith(ch, j)) j += width;
      } else {
        j = numberEnd(i);
      }
      const kind: TokenKind = c === C_DIGIT ? 'number' : c === C_LATIN ? 'latin' : 'punct';
      const next = c === C_DIGIT ? S_NUMBER : c === C_LATIN ? S_WORD : S_START;
      list.push(makeStep(j - i, kind, kind === 'number' ? R_NUMBER : R_OTHER, next));
      for (let k = i + 1; k < j; k++) steps[k] = [];
      i = j;
      continue;
    }
    if (numeral[i] === 1) list.push(makeStep(numberEnd(i) - i, 'number', R_NUMBER, S_NUMBER));

    // Vocabulary and grammar surfaces starting here.
    const atClauseStart = clauseStart(i);
    const end = runEnd[i] ?? 0;
    let node: TrieNode | undefined = lexicon.trie;
    for (let k = i; k < n; k++) {
      node = node.next?.get(text.charCodeAt(k));
      if (node === undefined) break;
      const info = node.info;
      if (info === undefined) continue;
      const len = k + 1 - i;
      const words = atClauseStart ? info.words : info.words.filter((r) => !r.clauseInitial);
      if (words.length > 0) {
        const weak = words.every((r) => r.weak);
        const step = makeStep(len, 'word', weak ? R_WEAK_WORD : R_WORD, wordState(words));
        step.words = words;
        step.grammar = info.grammar;
        step.content = words.some((r) => !r.particle && !r.numeric);
        step.hiragana = c === C_HIRA;
        step.okurigana = step.hiragana && (weak || text.charAt(i) === 'い');
        list.push(step);
        if (c === C_KANJI || c === C_KATA) {
          let same = i;
          while (same < i + len && classAt(same) === c) same++;
          const scriptLen = same - i;
          const minAnchor = c === C_KANJI ? 2 : MIN_KATAKANA_ANCHOR;
          if (scriptLen >= minAnchor) anchorStart[i] = 1;
          if (scriptLen >= minAnchor && same === i + len) anchorEnd[i + len] = 1;
          // A word with okurigana that ends the run (休|んだ in 間休んだ).
          if (same === end && i + len > end) anchorStart[i] = 1;
        }
      }
      const grammar = info.grammar.filter(
        (g) => g.before === undefined || g.before.some((b) => text.startsWith(b, i + len)),
      );
      if (grammar.length > 0) {
        const step = makeStep(len, 'grammar', R_GRAMMAR, S_GRAM);
        step.grammar = grammar;
        list.push(step);
      }
    }
    if (width === 2) steps[i + 1] = [];
    i += width;
  }

  // Pass 2: unknown steps. Single characters inside katakana and kanji runs
  // are penalised, so those runs come out whole or split at known words.
  for (let i = 0; i < n; i += widthAt(i)) {
    const list = steps[i] ?? [];
    const c = classAt(i);
    if (c === C_SPACE || c === C_PUNCT || c === C_LATIN || c === C_DIGIT || c === C_CONT) {
      continue;
    }
    const unknownState = c === C_KANJI ? S_UNK_KANJI : c === C_HIRA ? S_UNK_HIRA : S_UNK;
    const end = runEnd[i] ?? 0;
    if (end > 0 && (i === 0 || classAt(i - 1) !== c || anchorEnd[i] === 1)) {
      for (let r = i + 1; r <= end; r++) {
        if (r < end && (anchorStart[r] !== 1 || classAt(r) === C_CONT)) continue;
        const step = makeStep(r - i, 'unknown', R_UNKNOWN_RUN, unknownState);
        step.run = true;
        list.push(step);
      }
    }
    const single = makeStep(widthAt(i), 'unknown', R_UNKNOWN, unknownState);
    single.hiragana = c === C_HIRA;
    single.particleChar = text.charAt(i) === 'を';
    list.push(single);
  }

  // Dynamic programme from the end: best parse of text[i..] given the state before i.
  // Only (position, state) pairs reachable from the start are solved.
  const size = (n + 1) * STATES;
  const {
    viol: bestViol,
    unk: bestUnk,
    join: bestJoin,
    len: bestLen,
    rank: bestRank,
    next: bestNext,
    reachable,
    step: bestStep,
    grammar: bestGrammar,
  } = scratch(size);
  for (let s = 0; s < STATES; s++) {
    const at = n * STATES + s;
    bestViol[at] = s === S_PREFIX || s === S_STEM ? 1 : 0;
    bestUnk[at] = 0;
    bestJoin[at] = 0;
  }
  reachable[S_START] = 1;
  for (let i = 0; i < n; i++) {
    const list = steps[i] ?? [];
    for (let s = 0; s < STATES; s++) {
      if (reachable[i * STATES + s] !== 1) continue;
      for (const step of list) {
        let next = step.next;
        if (step.kind === 'grammar') {
          const g = chooseGrammar(step.grammar, s);
          if (g === null) continue;
          next = grammarState(g, s);
        }
        reachable[(i + step.len) * STATES + next] = 1;
      }
    }
  }

  for (let i = n - 1; i >= 0; i--) {
    const list = steps[i] ?? [];
    if (list.length === 0) continue;
    const c = classAt(i);
    const isDependent = dependent[i] === 1;
    const atClauseStart = clauseStart(i);
    for (let s = 0; s < STATES; s++) {
      const at = i * STATES + s;
      if (reachable[at] !== 1) continue;
      let found = false;
      for (const step of list) {
        let grammar: GrammarWord | null = null;
        let next = step.next;
        let violations = 0;
        let unknown = 0;
        let joins = 0;
        let rank = step.rank;
        if (step.kind === 'word') {
          if (s === S_UNK_KANJI && step.okurigana) violations++;
          if (s === S_COPULA) violations++;
          if (s === S_NOMINAL && step.content) joins++;
        } else if (step.kind === 'grammar') {
          grammar = chooseGrammar(step.grammar, s);
          if (grammar === null) continue;
          next = grammarState(grammar, s);
          if (s === S_NUMBER && grammar.role === 'counter') rank = R_NUMBER;
          if (RESTRICTED_ROLES.has(grammar.role) && (atClauseStart || s === S_CASE)) {
            violations++;
          }
          if (
            s === S_OBLIQUE &&
            (grammar.role === 'copula' || AFTER_OBLIQUE_BLOCKED.has(grammar.key))
          ) {
            violations++;
          }
          if (grammar.role === 'suffix' && !afterOk('content', s)) violations++;
        } else if (step.kind === 'unknown') {
          unknown = step.len;
          if (!step.run && (c === C_KANJI || c === C_KATA)) violations++;
          // A particle between two unknown hiragana runs is part of one word (しっかり).
          if (s === S_GRAM_UNK && step.hiragana) violations++;
          if (step.particleChar) violations++;
        }
        const continuesUnknown =
          step.kind === 'unknown' && (s === S_UNK || s === S_UNK_HIRA || s === S_UNK_KANJI);
        if (isDependent && !continuesUnknown) violations++;
        if (s === S_PREFIX && step.kind !== 'word') violations++;
        if (s === S_STEM && grammar?.key !== 'ni') violations++;

        const to = (i + step.len) * STATES + next;
        violations += bestViol[to] ?? 0;
        unknown += bestUnk[to] ?? 0;
        joins += bestJoin[to] ?? 0;
        if (found) {
          const dv = violations - (bestViol[at] ?? 0);
          const du = unknown - (bestUnk[at] ?? 0);
          const dj = joins - (bestJoin[at] ?? 0);
          const dl = (bestLen[at] ?? 0) - step.len;
          const dr = rank - (bestRank[at] ?? 0);
          const better =
            dv !== 0 ? dv < 0 : du !== 0 ? du < 0 : dj !== 0 ? dj < 0 : dl !== 0 ? dl < 0 : dr < 0;
          if (!better) continue;
        }
        found = true;
        bestViol[at] = violations;
        bestUnk[at] = unknown;
        bestJoin[at] = joins;
        bestLen[at] = step.len;
        bestRank[at] = rank;
        bestNext[at] = next;
        bestStep[at] = step;
        bestGrammar[at] = grammar;
      }
    }
  }

  // Walk the best path and build tokens, merging adjacent unknown steps.
  const tokens: Token[] = [];
  let state = S_START;
  for (let i = 0; i < n; ) {
    const at = i * STATES + state;
    const step = bestStep[at];
    if (step === undefined) break; // unreachable: every position has an unknown step
    const j = i + step.len;
    const surface = text.slice(i, j);
    const prevToken = tokens[tokens.length - 1];
    if (step.kind === 'unknown' && prevToken?.kind === 'unknown') {
      prevToken.surface += surface;
      prevToken.end = j;
    } else if (step.kind === 'word') {
      const token: Token = {
        surface,
        start: i,
        end: j,
        kind: 'word',
        wordIds: step.words.map((r) => r.id),
      };
      const first = step.words[0];
      if (first !== undefined && first.form !== 'dict') {
        token.base = first.base;
        token.form = first.form;
      }
      const altGrammar = step.grammar.length > 0 ? chooseGrammar(step.grammar, state) : null;
      if (altGrammar !== null && altGrammar.role !== 'counter') token.grammar = altGrammar.key;
      tokens.push(token);
    } else if (step.kind === 'grammar') {
      const token: Token = { surface, start: i, end: j, kind: 'grammar', wordIds: [] };
      const g = bestGrammar[at] ?? null;
      if (g !== null) token.grammar = g.key;
      tokens.push(token);
    } else {
      tokens.push({ surface, start: i, end: j, kind: step.kind, wordIds: [] });
    }
    state = bestNext[at] ?? S_START;
    i = j;
  }
  return tokens;
}

/** Unique vocabulary ids used by the tokens, in order of first appearance. */
export function usedWordIds(tokens: readonly Token[]): string[] {
  const seen = new Set<string>();
  for (const t of tokens) {
    if (t.kind !== 'word') continue;
    for (const id of t.wordIds) seen.add(id);
  }
  return [...seen];
}

/** Tokens that matched nothing (kind 'unknown'). */
export function unknownTokens(tokens: readonly Token[]): Token[] {
  return tokens.filter((t) => t.kind === 'unknown');
}
