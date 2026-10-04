/**
 * Romaji rules: when romaji is shown, kana to romaji, and checking typed romaji answers.
 *
 * Romanisation is Modified Hepburn without macrons: long vowels are written as typed
 * (おう = ou, ー repeats the vowel: コーヒー = koohii), ん is n (n' before a vowel or y),
 * small っ doubles the next consonant (っち = tchi). Particles cannot be told apart from
 * ordinary syllables without context, so は, へ and を are always ha, he and o.
 */
import { ROMAJI_AUTO_UNTIL } from '../shared/constants.ts';

export type RomajiSetting = 'auto' | 'always' | 'never';
/** show: printed under the kana; tap: hidden until tapped; off: not available at all. */
export type RomajiDisplay = 'show' | 'tap' | 'off';

export function romajiDisplay(setting: RomajiSetting, currentLessonN: number): RomajiDisplay {
  if (setting === 'always') return 'show';
  if (setting === 'never') return 'off';
  return currentLessonN <= ROMAJI_AUTO_UNTIL ? 'show' : 'tap';
}

// Tables are keyed by hiragana; katakana is folded into hiragana before lookup.

/** Single kana: each row of kana with the romaji of its cells, in order. */
const ROWS: readonly (readonly [string, string])[] = [
  ['あいうえお', 'a i u e o'],
  ['かきくけこ', 'ka ki ku ke ko'],
  ['がぎぐげご', 'ga gi gu ge go'],
  ['さしすせそ', 'sa shi su se so'],
  ['ざじずぜぞ', 'za ji zu ze zo'],
  ['たちつてと', 'ta chi tsu te to'],
  ['だぢづでど', 'da ji zu de do'],
  ['なにぬねの', 'na ni nu ne no'],
  ['はひふへほ', 'ha hi fu he ho'],
  ['ばびぶべぼ', 'ba bi bu be bo'],
  ['ぱぴぷぺぽ', 'pa pi pu pe po'],
  ['まみむめも', 'ma mi mu me mo'],
  ['やゆよ', 'ya yu yo'],
  ['らりるれろ', 'ra ri ru re ro'],
  ['わゐゑを', 'wa i e o'],
  ['ゔ', 'vu'],
  // Small kana on their own (after a kana they usually form a pair, see PAIRS).
  ['ぁぃぅぇぉ', 'a i u e o'],
  ['ゃゅょゎゕゖ', 'ya yu yo wa ka ke'],
];

/** Extended pairs, mostly for katakana loanwords (ティ, ファ, ウィ, ...). */
const EXTENDED_PAIRS =
  'いぇ ye うぁ wa うぃ wi うぇ we うぉ wo ゔぁ va ゔぃ vi ゔぇ ve ゔぉ vo ゔゅ vyu ' +
  'くぁ kwa くぃ kwi くぇ kwe くぉ kwo ぐぁ gwa しぇ she じぇ je ちぇ che すぃ si ずぃ zi ' +
  'つぁ tsa つぃ tsi つぇ tse つぉ tso てぃ ti てゅ tyu でぃ di でゅ dyu とぅ tu どぅ du ' +
  'ふぁ fa ふぃ fi ふぇ fe ふぉ fo ふゅ fyu';

/**
 * Extra spellings accepted when typing (wāpuro, Kunrei and Nihon-shiki habits), never
 * shown. Yōon of し, じ, ち, ぢ get theirs generated below.
 */
const TYPED_ALTERNATIVES: Readonly<Record<string, readonly string[]>> = {
  し: ['si'],
  じ: ['zi'],
  ち: ['ti'],
  ぢ: ['di', 'zi'],
  つ: ['tu'],
  づ: ['du'],
  ふ: ['hu'],
  を: ['wo'],
  ゐ: ['wi'],
  ゑ: ['we'],
  しぇ: ['sye'],
  じぇ: ['zye', 'jye'],
  ちぇ: ['tye', 'cye'],
  てぃ: ['thi'],
  でぃ: ['dhi'],
  てゅ: ['thu'],
  でゅ: ['dhu'],
  とぅ: ['twu'],
  どぅ: ['dwu'],
};

const SINGLE = new Map<string, string>();
for (const [kana, romaji] of ROWS) {
  const cells = romaji.split(' ');
  Array.from(kana).forEach((char, i) => SINGLE.set(char, cells[i] ?? ''));
}

const PAIRS = new Map<string, string>();
const ALTERNATIVES = new Map<string, readonly string[]>(Object.entries(TYPED_ALTERNATIVES));
const SMALL_Y: readonly (readonly [string, string])[] = [
  ['ゃ', 'a'],
  ['ゅ', 'u'],
  ['ょ', 'o'],
];
for (const head of 'きぎにひびぴみりしじちぢ') {
  const stem = (SINGLE.get(head) ?? '').slice(0, -1); // drop the i: k, sh, ch, j, ...
  // sh, ch and j absorb the y (sha, cha, ja); the other rows keep it (kya, nya).
  const glide = stem.length > 1 || stem === 'j' ? '' : 'y';
  for (const [small, vowel] of SMALL_Y) PAIRS.set(head + small, stem + glide + vowel);
}
const TYPED_YOON: Readonly<Record<string, readonly string[]>> = {
  し: ['sy'],
  じ: ['zy', 'jy'],
  ち: ['ty', 'cy'],
  ぢ: ['dy', 'zy'],
};
for (const [head, prefixes] of Object.entries(TYPED_YOON)) {
  for (const [small, vowel] of SMALL_Y) {
    ALTERNATIVES.set(
      head + small,
      prefixes.map((p) => p + vowel),
    );
  }
}
const extended = EXTENDED_PAIRS.split(' ');
for (let i = 0; i + 1 < extended.length; i += 2) {
  const [kana, romaji] = [extended[i], extended[i + 1]];
  if (kana && romaji) PAIRS.set(kana, romaji);
}

/** Katakana with a dakuten on the wa row, which hiragana lacks. */
const KATAKANA_VW: Readonly<Record<string, string>> = {
  ヷ: 'ゔぁ',
  ヸ: 'ゔぃ',
  ヹ: 'ゔぇ',
  ヺ: 'ゔぉ',
};

/**
 * Folds the text to full-width hiragana: half-width katakana is widened, kana followed by a
 * combining (han)dakuten is composed, and katakana is shifted to hiragana. Other characters
 * are left exactly as they are.
 */
function toHiragana(text: string): string {
  const composed = text
    .replace(/[･-ﾟ]+/g, (run) => run.normalize('NFKC'))
    .replace(/[぀-ヿ][゙゚]+/g, (pair) => pair.normalize('NFC'));
  let out = '';
  for (const char of composed) {
    const code = char.codePointAt(0) ?? 0;
    if ((code >= 0x30a1 && code <= 0x30f6) || code === 0x30fd || code === 0x30fe) {
      out += String.fromCodePoint(code - 0x60);
    } else {
      out += KATAKANA_VW[char] ?? char;
    }
  }
  return out;
}

type UnitKind = 'kana' | 'n' | 'sokuon' | 'long' | 'other';

interface Unit {
  kind: UnitKind;
  /** Hiragana for kana units, the original character otherwise. */
  text: string;
  /** Romaji of a kana unit on its own; the text itself for other characters. */
  romaji: string;
}

/** Repeats a kana for the iteration marks ゝ (plain) and ゞ (voiced). */
function iterate(previous: string, voiced: boolean): string | null {
  const plain = previous
    .normalize('NFD')
    .replace(/[゙゚]/g, '')
    .normalize('NFC');
  const repeated = voiced ? `${plain}゙`.normalize('NFC') : plain;
  return SINGLE.has(repeated) && repeated !== 'ん' ? repeated : null;
}

function tokenize(text: string): Unit[] {
  const chars = Array.from(toHiragana(text));
  const units: Unit[] = [];
  let previous: string | null = null;
  for (let i = 0; i < chars.length; i++) {
    const char = chars[i] ?? '';
    const following = chars[i + 1] ?? '';
    const pair = PAIRS.get(char + following);
    if (pair !== undefined) {
      units.push({ kind: 'kana', text: char + following, romaji: pair });
      previous = null;
      i++;
      continue;
    }
    if (char === 'っ') {
      units.push({ kind: 'sokuon', text: char, romaji: '' });
      continue;
    }
    if (char === 'ん') {
      units.push({ kind: 'n', text: char, romaji: 'n' });
      previous = null;
      continue;
    }
    if (char === 'ー') {
      units.push({ kind: 'long', text: char, romaji: '' });
      continue;
    }
    const kana: string | null =
      (char === 'ゝ' || char === 'ゞ') && previous !== null
        ? iterate(previous, char === 'ゞ')
        : SINGLE.has(char)
          ? char
          : null;
    const romaji = kana === null ? undefined : SINGLE.get(kana);
    if (kana !== null && romaji !== undefined) {
      units.push({ kind: 'kana', text: kana, romaji });
      previous = kana;
      continue;
    }
    units.push({ kind: 'other', text: char, romaji: char });
    previous = null;
  }
  return units;
}

const STARTS_WITH_CONSONANT = /^[bcdfghjklmnpqrstvwxyz]/;

/** The letter a small っ adds in front of a syllable, or '' when there is nothing to double. */
function geminate(romaji: string): string {
  if (romaji.startsWith('ch')) return 't';
  return STARTS_WITH_CONSONANT.test(romaji) ? romaji.charAt(0) : '';
}

/** Hepburn spelling of each unit in context (ん before a vowel, っ, ー). */
function spell(units: readonly Unit[]): string[] {
  const parts: string[] = [];
  let written = '';
  units.forEach((unit, i) => {
    const next = units[i + 1];
    let part: string;
    switch (unit.kind) {
      case 'n':
        part = next?.kind === 'kana' && /^[aeiouy]/.test(next.romaji) ? "n'" : 'n';
        break;
      case 'sokuon':
        // At the end, before a vowel or before anything but kana there is nothing to double.
        part = next?.kind === 'kana' ? geminate(next.romaji) : '';
        break;
      case 'long':
        part = /[aeiou]$/.exec(written)?.[0] ?? '-';
        break;
      default:
        part = unit.romaji;
    }
    parts.push(part);
    written += part;
  });
  return parts;
}

/**
 * Modified Hepburn romaji (without macrons) for hiragana and katakana. Characters that are
 * not kana (kanji, Latin, punctuation) pass through unchanged. A small っ with nothing to
 * double (end of text, before a vowel) is dropped, so あっ is "a".
 */
export function kanaToRomaji(kana: string): string {
  return spell(tokenize(kana)).join('');
}

const MACRONS: Readonly<Record<string, string>> = {
  ā: 'aa',
  â: 'aa',
  ī: 'ii',
  î: 'ii',
  ū: 'uu',
  û: 'uu',
  ē: 'ee',
  ê: 'ee',
  ō: 'oo',
  ô: 'oo',
};
const DASHES = /[\p{Pd}ー]/gu;

/**
 * Normalised forms of a typed answer: lower case, macrons as doubled vowels, without spaces,
 * apostrophes or punctuation. Hyphens are either dropped or, after a vowel, read as a long
 * vowel mark (ko-hi- = koohii), so two forms may come back; none when nothing is left.
 */
function normalizeAnswer(input: string): string[] {
  const text = input
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[āâīîūûēêōô]/g, (vowel) => MACRONS[vowel] ?? vowel)
    .replace(/[^\p{L}\p{N}\p{Pd}]/gu, '');
  const plain = text.replace(DASHES, '');
  const long = text.replace(/([aeiou])[\p{Pd}ー]/gu, '$1$1').replace(DASHES, '');
  // A hyphen at the very end can only be a long-vowel mark ("ka-" is カー, never か).
  if (/[aeiou][\p{Pd}ー]$/u.test(text)) return [long].filter((form) => form.length > 0);
  return [...new Set([plain, long])].filter((form) => form.length > 0);
}

/** Every accepted spelling for each unit, in order; a っ is merged into the next kana. */
function acceptedSpellings(units: readonly Unit[]): string[][] {
  const shown = spell(units);
  const kanaOptions = (unit: Unit, i: number): string[] => {
    const options = [shown[i] ?? unit.romaji, ...(ALTERNATIVES.get(unit.text) ?? [])];
    // おう may be typed as written (ou) or as it sounds (oo, or ō via the macron rule).
    if (unit.text === 'う' && shown.slice(0, i).join('').endsWith('o')) options.push('o');
    return options;
  };

  const result: string[][] = [];
  for (let i = 0; i < units.length; i++) {
    const unit = units[i];
    if (!unit) continue;
    const next = units[i + 1];
    switch (unit.kind) {
      case 'kana':
        result.push(kanaOptions(unit, i));
        break;
      case 'n':
        // n, nn (wāpuro) or m before b, m, p (traditional Hepburn: shimbun).
        result.push(
          next?.kind === 'kana' && /^[bmp]/.test(next.romaji) ? ['n', 'nn', 'm'] : ['n', 'nn'],
        );
        break;
      case 'sokuon':
        if (next?.kind === 'kana' && shown[i] !== '') {
          const doubled = kanaOptions(next, i + 1).flatMap((option) => {
            if (option.startsWith('ch')) return [`t${option}`, `c${option}`];
            return STARTS_WITH_CONSONANT.test(option) ? [option.charAt(0) + option] : [option];
          });
          result.push(doubled);
          i++;
        } else {
          result.push(['']);
        }
        break;
      case 'long':
        result.push([shown[i] === '-' ? '' : (shown[i] ?? '')]);
        break;
      case 'other':
        result.push([normalizeAnswer(unit.text)[0] ?? '']);
        break;
    }
  }
  return result;
}

function matches(answer: string, spellings: readonly (readonly string[])[]): boolean {
  let positions = new Set([0]);
  for (const options of spellings) {
    const reached = new Set<number>();
    for (const position of positions) {
      for (const option of options) {
        if (answer.startsWith(option, position)) reached.add(position + option.length);
      }
    }
    if (reached.size === 0) return false;
    positions = reached;
  }
  return positions.has(answer.length);
}

/**
 * Whether typed romaji reads `kana`. Accepts Hepburn and common wāpuro spellings (si, ti, tu,
 * hu, zi, di, du, wo, nn, sya, tya, zya, ...), doubled consonants for っ (tchi, cchi, tti),
 * m for ん before b/m/p, and ou or oo for おう. Case, spaces, apostrophes, hyphens and
 * punctuation are ignored; macrons (ō) count as doubled vowels. えい is only ei (not ee), and
 * particles are literal: は is ha, not wa.
 */
export function isRomajiAnswerCorrect(input: string, kana: string): boolean {
  const answers = normalizeAnswer(input);
  if (answers.length === 0) return false;
  const spellings = acceptedSpellings(tokenize(kana));
  return answers.some((answer) => matches(answer, spellings));
}
