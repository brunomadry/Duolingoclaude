/**
 * Live romaji -> kana conversion for answer fields, like a Japanese IME in "romaji input"
 * mode, so learners without a Japanese keyboard can still answer in kana.
 *
 * Rules: kya/sha/cha/ja yōon, double consonant = small っ (kka -> っか), "-" = ー, Hepburn
 * and Kunrei spellings (shi/si, tsu/tu, fu/hu). ん follows Hepburn because that is what the
 * app teaches: "n'" or "n" before a consonant is ん, and "nn" before a vowel or y is ん plus
 * an n-syllable (konnichiha -> こんにちは); "nn" elsewhere (end, before a consonant) is ん
 * as on Japanese keyboards. ん before a vowel is typed "n'" (kin'en -> きんえん).
 * A trailing incomplete sequence (e.g. "k", "sh", a lone "n") is kept as Latin letters so the
 * learner can keep typing; `final: true` converts a lone trailing "n" to ん.
 */

const TABLE: Record<string, string> = {
  a: 'あ',
  i: 'い',
  u: 'う',
  e: 'え',
  o: 'お',
  ka: 'か',
  ki: 'き',
  ku: 'く',
  ke: 'け',
  ko: 'こ',
  ga: 'が',
  gi: 'ぎ',
  gu: 'ぐ',
  ge: 'げ',
  go: 'ご',
  sa: 'さ',
  shi: 'し',
  si: 'し',
  su: 'す',
  se: 'せ',
  so: 'そ',
  za: 'ざ',
  ji: 'じ',
  zi: 'じ',
  zu: 'ず',
  ze: 'ぜ',
  zo: 'ぞ',
  ta: 'た',
  chi: 'ち',
  ti: 'ち',
  tsu: 'つ',
  tu: 'つ',
  te: 'て',
  to: 'と',
  da: 'だ',
  di: 'ぢ',
  du: 'づ',
  de: 'で',
  do: 'ど',
  na: 'な',
  ni: 'に',
  nu: 'ぬ',
  ne: 'ね',
  no: 'の',
  ha: 'は',
  hi: 'ひ',
  fu: 'ふ',
  hu: 'ふ',
  he: 'へ',
  ho: 'ほ',
  ba: 'ば',
  bi: 'び',
  bu: 'ぶ',
  be: 'べ',
  bo: 'ぼ',
  pa: 'ぱ',
  pi: 'ぴ',
  pu: 'ぷ',
  pe: 'ぺ',
  po: 'ぽ',
  ma: 'ま',
  mi: 'み',
  mu: 'む',
  me: 'め',
  mo: 'も',
  ya: 'や',
  yu: 'ゆ',
  yo: 'よ',
  ra: 'ら',
  ri: 'り',
  ru: 'る',
  re: 'れ',
  ro: 'ろ',
  wa: 'わ',
  wo: 'を',
  vu: 'ゔ',
  kya: 'きゃ',
  kyu: 'きゅ',
  kyo: 'きょ',
  gya: 'ぎゃ',
  gyu: 'ぎゅ',
  gyo: 'ぎょ',
  sha: 'しゃ',
  shu: 'しゅ',
  sho: 'しょ',
  sya: 'しゃ',
  syu: 'しゅ',
  syo: 'しょ',
  she: 'しぇ',
  ja: 'じゃ',
  ju: 'じゅ',
  jo: 'じょ',
  jya: 'じゃ',
  jyu: 'じゅ',
  jyo: 'じょ',
  zya: 'じゃ',
  zyu: 'じゅ',
  zyo: 'じょ',
  je: 'じぇ',
  cha: 'ちゃ',
  chu: 'ちゅ',
  cho: 'ちょ',
  tya: 'ちゃ',
  tyu: 'ちゅ',
  tyo: 'ちょ',
  cya: 'ちゃ',
  cyu: 'ちゅ',
  cyo: 'ちょ',
  che: 'ちぇ',
  nya: 'にゃ',
  nyu: 'にゅ',
  nyo: 'にょ',
  hya: 'ひゃ',
  hyu: 'ひゅ',
  hyo: 'ひょ',
  bya: 'びゃ',
  byu: 'びゅ',
  byo: 'びょ',
  pya: 'ぴゃ',
  pyu: 'ぴゅ',
  pyo: 'ぴょ',
  mya: 'みゃ',
  myu: 'みゅ',
  myo: 'みょ',
  rya: 'りゃ',
  ryu: 'りゅ',
  ryo: 'りょ',
  fa: 'ふぁ',
  fi: 'ふぃ',
  fe: 'ふぇ',
  fo: 'ふぉ',
  thi: 'てぃ',
  dhi: 'でぃ',
  xa: 'ぁ',
  xi: 'ぃ',
  xu: 'ぅ',
  xe: 'ぇ',
  xo: 'ぉ',
  la: 'ぁ',
  li: 'ぃ',
  lu: 'ぅ',
  le: 'ぇ',
  lo: 'ぉ',
  xya: 'ゃ',
  xyu: 'ゅ',
  xyo: 'ょ',
  lya: 'ゃ',
  lyu: 'ゅ',
  lyo: 'ょ',
  xtu: 'っ',
  ltu: 'っ',
  xtsu: 'っ',
  ltsu: 'っ',
};

const MAX_KEY = 4;
const CONSONANT = /^[bcdfghjklmpqrstvwxz]$/;

export interface ConvertOptions {
  /** Convert a trailing lone "n" to ん (on submit). */
  final?: boolean;
  /** Output katakana instead of hiragana. */
  katakana?: boolean;
}

function toKatakana(text: string): string {
  return text.replace(/[ぁ-ゖ]/g, (c) => String.fromCharCode(c.charCodeAt(0) + 0x60));
}

export function romajiToKana(input: string, opts: ConvertOptions = {}): string {
  const text = input.toLowerCase();
  let out = '';
  let i = 0;
  while (i < text.length) {
    const c = text[i] ?? '';
    const next = text[i + 1] ?? '';
    // ん: "nn", "n'" or n before a consonant that cannot follow n in a syllable.
    if (c === 'n') {
      if (next === 'n') {
        const after = text[i + 2] ?? '';
        out += 'ん';
        // Hepburn: "nn" + vowel/y is ん + na/ni/nya...; otherwise both n's make one ん.
        i += /[aiueoy]/.test(after) ? 1 : 2;
        continue;
      }
      if (next === "'") {
        out += 'ん';
        i += 2;
        continue;
      }
      if (next && CONSONANT.test(next) && next !== 'y') {
        out += 'ん';
        i += 1;
        continue;
      }
      if (!next) {
        out += opts.final ? 'ん' : 'n';
        i += 1;
        continue;
      }
    }
    // Small っ: a doubled consonant (kka, tta, sshi, tchi).
    if (CONSONANT.test(c) && (next === c || (c === 't' && next === 'c'))) {
      out += 'っ';
      i += 1;
      continue;
    }
    if (c === '-') {
      out += 'ー';
      i += 1;
      continue;
    }
    let matched = false;
    for (let len = MAX_KEY; len >= 1; len--) {
      const key = text.slice(i, i + len);
      const kana = TABLE[key];
      if (kana) {
        out += kana;
        i += len;
        matched = true;
        break;
      }
    }
    if (!matched) {
      out += c;
      i += 1;
    }
  }
  return opts.katakana ? toKatakana(out) : out;
}

/** True while the text still ends in Latin letters that may become kana. */
export function hasPendingRomaji(text: string): boolean {
  return /[a-z]$/i.test(text);
}
