import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  GRAMMAR_WORDS,
  SPELLING_VARIANTS,
  createLexicon,
  inflections,
  tokenize,
  unknownTokens,
  usedWordIds,
  type InflectionForm,
  type LexEntry,
  type Token,
} from './jp-words.ts';

interface VocabJson {
  words: { id: string; kana: string; kanji?: string; pos?: string[] }[];
}
interface SentencesJson {
  sentences: { id: number; ja: string; kana?: string }[];
}

const read = (name: string): unknown =>
  JSON.parse(readFileSync(new URL(`../../content/${name}`, import.meta.url), 'utf8'));

const toEntry = (w: VocabJson['words'][number]): LexEntry =>
  w.kanji === undefined
    ? { id: w.id, kana: w.kana, pos: w.pos ?? [] }
    : { id: w.id, kana: w.kana, kanji: w.kanji, pos: w.pos ?? [] };

const vocab = (read('vocab.json') as VocabJson).words;
const sentences = (read('sentences.json') as SentencesJson).sentences;
const entries = vocab.map(toEntry);
const lexicon = createLexicon(entries);

const tok = (text: string): Token[] => tokenize(text, lexicon);

/** Compact view: word as `surface[id|id]`, grammar as `surface{key}`, the rest as `surface<kind>`. */
function fmt(t: Token): string {
  if (t.kind === 'word') return `${t.surface}[${t.wordIds.join('|')}]`;
  if (t.kind === 'grammar') return `${t.surface}{${t.grammar ?? ''}}`;
  return `${t.surface}<${t.kind}>`;
}
const show = (text: string): string[] => tok(text).map(fmt);

function entry(id: string): LexEntry {
  const e = entries.find((x) => x.id === id);
  if (e === undefined) throw new Error(`no vocabulary entry ${id}`);
  return e;
}

function sentence(id: number, ja: string): string {
  const s = sentences.find((x) => x.id === id);
  expect(s?.ja, `sentence ${id}`).toBe(ja);
  return ja;
}

/** Every surface must be ONE word token that includes `id`; base and form are checked when `id` is the first candidate. */
function expectForms(id: string, base: string, forms: Record<string, InflectionForm>): void {
  for (const [surface, form] of Object.entries(forms)) {
    const tokens = tok(surface);
    expect(tokens.map(fmt), surface).toHaveLength(1);
    const t = tokens[0]!;
    expect(t.kind, surface).toBe('word');
    expect(t.wordIds, surface).toContain(id);
    if (t.wordIds[0] !== id) continue;
    if (form === 'dict') {
      expect(t.base, surface).toBeUndefined();
      expect(t.form, surface).toBeUndefined();
    } else {
      expect(t.base, surface).toBe(base);
      expect(t.form, surface).toBe(form);
    }
  }
}

/** The surface is not read as a single vocabulary word. */
function expectNotAWord(surface: string): void {
  const tokens = tok(surface);
  expect(tokens.length === 1 && tokens[0]!.kind === 'word', surface).toBe(false);
}

describe('verb conjugation', () => {
  it('godan う: 会う, every generated form', () => {
    expectForms('au', '会う', {
      会う: 'dict',
      会います: 'masu',
      会いました: 'mashita',
      会いません: 'masen',
      会いませんでした: 'masen-deshita',
      会いましょう: 'mashou',
      会いましょうか: 'mashou-ka',
      会いたい: 'tai',
      会いたくない: 'takunai',
      会いたかった: 'takatta',
      会いたくなかった: 'takunakatta',
      会いたくて: 'takute',
      会って: 'te',
      会った: 'ta',
      会ったら: 'tara',
      会ったり: 'tari',
      会わない: 'nai',
      会わなかった: 'nakatta',
      会わなく: 'naku',
      会わなくて: 'nakute',
      会わないで: 'naide',
      会おう: 'volitional',
      会いながら: 'nagara',
      会いなさい: 'nasai',
    });
    expectForms('au', 'あう', { あいます: 'masu', あわない: 'nai', あおう: 'volitional' });
  });

  it('inflections() lists kanji and kana surfaces', () => {
    const forms = inflections(entry('au'));
    const surfaces = forms.map((f) => f.surface);
    expect(surfaces).toEqual(expect.arrayContaining(['会う', 'あう', '会って', 'あって', '会い']));
    expect(forms.find((f) => f.surface === '会って')).toEqual({
      surface: '会って',
      base: '会う',
      form: 'te',
    });
    expect(inflections(entry('gakusei'))).toEqual([
      { surface: '学生', base: '学生', form: 'dict' },
      { surface: 'がくせい', base: 'がくせい', form: 'dict' },
    ]);
  });

  it('godan く and the irregular 行く', () => {
    expectForms('kaku', '書く', {
      書きます: 'masu',
      書いて: 'te',
      書いた: 'ta',
      書かない: 'nai',
      書こう: 'volitional',
      書きたい: 'tai',
    });
    expectForms('iku', '行く', {
      行きます: 'masu',
      行って: 'te',
      行った: 'ta',
      行ったら: 'tara',
      行かない: 'nai',
      行こう: 'volitional',
      行きながら: 'nagara',
    });
    expectForms('iku', 'いく', { いきます: 'masu', いかない: 'nai' });
    expectNotAWord('行いて');
  });

  it('godan ぐ す つ ぬ ぶ む', () => {
    expectForms('oyogu', '泳ぐ', {
      泳ぎます: 'masu',
      泳いで: 'te',
      泳いだ: 'ta',
      泳がない: 'nai',
      泳ごう: 'volitional',
    });
    expectForms('hanasu', '話す', {
      話します: 'masu',
      話して: 'te',
      話した: 'ta',
      話さない: 'nai',
      話そう: 'volitional',
    });
    expectForms('matsu', '待つ', {
      待ちます: 'masu',
      待って: 'te',
      待った: 'ta',
      待たない: 'nai',
      待とう: 'volitional',
    });
    expectForms('shinu', '死ぬ', {
      死にます: 'masu',
      死んで: 'te',
      死んだ: 'ta',
      死なない: 'nai',
      死のう: 'volitional',
    });
    expectForms('asobu', '遊ぶ', {
      遊びます: 'masu',
      遊んで: 'te',
      遊んだ: 'ta',
      遊ばない: 'nai',
      遊ぼう: 'volitional',
    });
    expectForms('nomu', '飲む', {
      飲みます: 'masu',
      飲んで: 'te',
      飲んだ: 'ta',
      飲まない: 'nai',
      飲もう: 'volitional',
      飲みたい: 'tai',
    });
  });

  it('帰る is godan, not ichidan', () => {
    expectForms('kaeru', '帰る', {
      帰ります: 'masu',
      帰って: 'te',
      帰った: 'ta',
      帰らない: 'nai',
      帰ろう: 'volitional',
    });
    expectNotAWord('帰ます');
    expectNotAWord('帰て');
    expectNotAWord('帰よう');
  });

  it('every godan る verb in the vocabulary conjugates as godan (入る, 走る, 知る)', () => {
    const godanRu = entries.filter((e) => e.pos.includes('v5r') && e.kanji !== undefined);
    expect(godanRu.length).toBeGreaterThan(20);
    for (const e of godanRu) {
      const stem = e.kanji!.slice(0, -1);
      expect(tok(`${stem}ります`)[0]?.wordIds, e.kanji).toContain(e.id);
      expect(tok(`${stem}って`)[0]?.wordIds, e.kanji).toContain(e.id);
      expect(tok(`${stem}らない`)[0]?.wordIds, e.kanji).toContain(e.id);
      for (const ichidan of [`${stem}ます`, `${stem}て`, `${stem}ない`]) {
        const tokens = tok(ichidan);
        const asOneWord = tokens.length === 1 && tokens[0]!.wordIds.includes(e.id);
        expect(asOneWord, ichidan).toBe(false);
      }
    }
  });

  it('ある negates as ない', () => {
    expectForms('aru', 'ある', {
      ある: 'dict',
      あります: 'masu',
      ありません: 'masen',
      ありました: 'mashita',
      あった: 'ta',
      ない: 'nai',
      なかった: 'nakatta',
      なくて: 'nakute',
    });
    expectNotAWord('あらない');
  });

  it('ichidan 食べる 見る 起きる', () => {
    expectForms('taberu', '食べる', {
      食べます: 'masu',
      食べて: 'te',
      食べた: 'ta',
      食べない: 'nai',
      食べなかった: 'nakatta',
      食べよう: 'volitional',
      食べたい: 'tai',
      食べたら: 'tara',
      食べながら: 'nagara',
      食べなさい: 'nasai',
    });
    expectForms('taberu', 'たべる', { たべます: 'masu', たべて: 'te' });
    expectForms('miru', '見る', {
      見ます: 'masu',
      見て: 'te',
      見た: 'ta',
      見ない: 'nai',
      見よう: 'volitional',
    });
    expectForms('miru', 'みる', { みます: 'masu', みて: 'te' });
    expectForms('okiru', '起きる', {
      起きます: 'masu',
      起きて: 'te',
      起きない: 'nai',
      起きよう: 'volitional',
    });
    expectNotAWord('食べります');
    expectNotAWord('食べって');
  });

  it('する and 来る', () => {
    expectForms('suru', 'する', {
      する: 'dict',
      します: 'masu',
      しました: 'mashita',
      して: 'te',
      しない: 'nai',
      しよう: 'volitional',
      したい: 'tai',
      しながら: 'nagara',
    });
    expectForms('kuru', '来る', {
      来る: 'dict',
      来ます: 'masu',
      来て: 'te',
      来た: 'ta',
      来ない: 'nai',
      来よう: 'volitional',
      来たい: 'tai',
    });
    expectForms('kuru', 'くる', { くる: 'dict', こない: 'nai', こよう: 'volitional' });
    expectForms('kuru', 'くる', { きます: 'masu' });
  });

  it('suru nouns: the noun alone and noun + する', () => {
    expectForms('benkyou', '勉強する', {
      勉強: 'dict',
      勉強する: 'dict',
      勉強します: 'masu',
      勉強して: 'te',
      勉強した: 'ta',
      勉強しない: 'nai',
      勉強しよう: 'volitional',
      勉強したい: 'tai',
    });
    expectForms('benkyou', 'べんきょうする', { べんきょうします: 'masu' });
    // The vocabulary lists コピーする with する already attached.
    expectForms('kopiisuru', 'コピーする', { コピー: 'dict', コピーしました: 'mashita' });
  });

  it('te-form + いる / ください are separate tokens', () => {
    expect(show('食べています')).toEqual(['食べて[taberu]', 'います[iru-be]']);
    expect(show('見てください')).toEqual(['見て[miru]', 'ください[kudasai]']);
    expect(show('行かないでください')).toEqual(['行かないで[iku]', 'ください[kudasai]']);
    expect(show('勉強しています')).toEqual(['勉強して[benkyou]', 'います[iru-be]']);
  });

  it('the bare masu stem is only read before に', () => {
    expect(show('見に行きます')).toEqual(['見[miru]', 'に{ni}', '行きます[iku]']);
    expect(show('買いに行く')).toEqual(['買い[kau]', 'に{ni}', '行く[iku]']);
    // A noun with the same surface wins over the stem.
    expect(show('休みです')).toEqual(['休み[yasumi]', 'です{desu}']);
  });

  it('mixed okurigana and extra spellings', () => {
    expectForms('owaru', '終る', { 終ります: 'masu', 終らない: 'nai' });
    expectForms('owaru', '終わる', { 終わります: 'masu', 終わった: 'ta' });
    expectForms('dekiru', '出来る', { 出来ます: 'masu' });
    expect(show('ご飯を食べて下さい')).toEqual([
      'ご飯[gohan]',
      'を{wo}',
      '食べて[taberu]',
      '下さい[kudasai]',
    ]);
  });
});

describe('adjectives', () => {
  it('i-adjective 高い', () => {
    expectForms('takai', '高い', {
      高い: 'dict',
      高く: 'ku',
      高くない: 'kunai',
      高かった: 'katta',
      高くなかった: 'kunakatta',
      高くて: 'kute',
      高かったら: 'kattara',
    });
    expect(show('高いです')).toEqual(['高い[takai]', 'です{desu}']);
    expect(show('高くないです')).toEqual(['高くない[takai]', 'です{desu}']);
    expect(show('高かったです')).toEqual(['高かった[takai]', 'です{desu}']);
  });

  it('いい conjugates from よ and accepts よい and 良い', () => {
    expectForms('ii', 'いい', {
      いい: 'dict',
      よい: 'dict',
      よくない: 'kunai',
      よかった: 'katta',
      よくなかった: 'kunakatta',
      よくて: 'kute',
    });
    expectForms('ii', '良い', { 良い: 'dict', 良かった: 'katta' });
    // よく is both the adverb and the く form of いい.
    expect(tok('よく')[0]?.wordIds).toEqual(['yoku', 'ii']);
    expectNotAWord('いかった');
    expectNotAWord('いくない');
  });

  it('na-adjectives take な, に, です and だ as grammar tokens', () => {
    expect(show('きれいな花')).toEqual(['きれい[kirei]', 'な{na}', '花[hana-flower]']);
    expect(show('きれいです')).toEqual(['きれい[kirei]', 'です{desu}']);
    expect(show('静かな部屋')).toEqual(['静か[shizuka]', 'な{na}', '部屋[heya]']);
    expect(show('静かに')).toEqual(['静か[shizuka]', 'に{ni}']);
    expect(show('静かだった')).toEqual(['静か[shizuka]', 'だった{datta}']);
    // Na-adjectives ending in い do not conjugate like i-adjectives.
    expectNotAWord('きれくない');
  });
});

describe('copula and particles', () => {
  it('私は学生です。', () => {
    const tokens = tok('私は学生です。');
    expect(tokens.map((t) => t.surface)).toEqual(['私', 'は', '学生', 'です', '。']);
    expect(tokens.map((t) => t.kind)).toEqual(['word', 'grammar', 'word', 'grammar', 'punct']);
    expect(tokens.map((t) => t.grammar)).toEqual([undefined, 'wa', undefined, 'desu', undefined]);
    expect(tokens.map((t) => [t.start, t.end])).toEqual([
      [0, 1],
      [1, 2],
      [2, 4],
      [4, 6],
      [6, 7],
    ]);
  });

  it.each([
    ['学生でした', 'deshita'],
    ['学生でしょう', 'deshou'],
    ['学生だ', 'da'],
    ['学生だった', 'datta'],
    ['学生ではありません', 'dewa-arimasen'],
    ['学生じゃありません', 'ja-arimasen'],
    ['学生ではありませんでした', 'dewa-arimasen-deshita'],
    ['学生ではない', 'dewa-nai'],
    ['学生じゃない', 'ja-nai'],
    ['学生じゃなかった', 'ja-nakatta'],
  ])('%s ends in the copula %s', (text, key) => {
    expect(show(text)).toEqual(['学生[gakusei]', `${text.slice(2)}{${key}}`]);
  });

  it('case particles', () => {
    expect(show('本を読みます')).toEqual(['本[hon]', 'を{wo}', '読みます[yomu]']);
    expect(show('学校へ行きます')).toEqual(['学校[gakkou]', 'へ{e}', '行きます[iku]']);
    expect(show('友達と映画を見ました')).toEqual([
      '友達[tomodachi]',
      'と{to}',
      '映画[eiga]',
      'を{wo}',
      '見ました[miru]',
    ]);
    expect(show('私も学生です')).toEqual([
      '私[watakushi|watashi]',
      'も{mo}',
      '学生[gakusei]',
      'です{desu}',
    ]);
    expect(show('私の本')).toEqual(['私[watakushi|watashi]', 'の{no}', '本[hon]']);
    expect(show('駅から学校まで')).toEqual(['駅[eki]', 'から{kara}', '学校[gakkou]', 'まで{made}']);
    expect(show('学校には')).toEqual(['学校[gakkou]', 'に{ni}', 'は{wa}']);
  });

  it('sentence endings', () => {
    expect(show('何ですか')).toEqual(['何[nan]', 'です{desu}', 'か{ka}']);
    expect(show('高いですね')).toEqual(['高い[takai]', 'です{desu}', 'ね{ne}']);
    expect(show('いいですよ')).toEqual(['いい[ii]', 'です{desu}', 'よ{yo}']);
    expect(show('そうですよね')).toEqual(['そう{sou}', 'です{desu}', 'よね{yone}']);
  });

  it('vocabulary particles keep the grammar key as an alternative', () => {
    expect(tok('肉や野菜など')).toMatchObject([
      { surface: '肉', kind: 'word' },
      { surface: 'や', kind: 'grammar', grammar: 'ya' },
      { surface: '野菜', kind: 'word' },
      { surface: 'など', kind: 'word', wordIds: ['nado'], grammar: 'nado' },
    ]);
    expect(tok('先生より')[1]).toMatchObject({ kind: 'word', wordIds: ['yori'], grammar: 'yori' });
  });

  it('weak kana spellings lose to grammar: くらい is not 暗い, さん is not 三', () => {
    expect(show('一時間くらい')).toEqual(['一<number>', '時間[jikan]', 'くらい{kurai}']);
    expect(show('一時間ぐらい')).toEqual(['一<number>', '時間[jikan]', 'ぐらい{gurai}']);
    expect(show('くらいへや')).toEqual(['くらい[kurai]', 'へや[heya]']);
    expect(show('マイクさん')).toEqual(['マイク<unknown>', 'さん{san}']);
  });

  it('other particles', () => {
    expect(show('三時ごろ')).toEqual(['三<number>', '時{ji}', 'ごろ{goro}']);
    expect(show('水だけ')).toEqual(['水[mizu]', 'だけ{dake}']);
    expect(show('千円しかない')).toEqual(['千<number>', '円{en}', 'しか{shika}', 'ない[aru]']);
    expect(show('雨なので')).toEqual(['雨[ame-rain]', 'な{na}', 'ので{node}']);
    expect(show('高いけど')).toEqual(['高い[takai]', 'けど{kedo}']);
    expect(show('行くんです')).toEqual(['行く[iku]', 'ん{n}', 'です{desu}']);
    expect(show('静かなんです')).toEqual(['静か[shizuka]', 'な{na}', 'ん{n}', 'です{desu}']);
    expect(show('寒いだけでなく')).toEqual(['寒い[samui]', 'だけ{dake}', 'でなく{dewa-naku}']);
  });

  it('が is "but" after a predicate', () => {
    expect(show('行きたいですが、')).toEqual([
      '行きたい[iku]',
      'です{desu}',
      'が{ga-but}',
      '、<punct>',
    ]);
    expect(show('雨が降る')).toEqual(['雨[ame-rain]', 'が{ga}', '降る[furu]']);
  });

  it('でも and では are conjunctions only at the start of a clause', () => {
    expect(tok('でも、高いです')[0]).toMatchObject({
      kind: 'word',
      wordIds: ['demo'],
      grammar: 'demo',
    });
    expect(show('お茶でも飲みましょう')).toEqual([
      'お茶[ocha]',
      'でも{demo}',
      '飲みましょう[nomu]',
    ]);
    expect(show('では、また')).toEqual(['では[dewa]', '、<punct>', 'また[mata]']);
    expect(show('学校では')).toEqual(['学校[gakkou]', 'で{de}', 'は{wa}']);
  });

  it('honorific お and ご need a following word', () => {
    expect(show('お名前は')).toEqual(['お{o-prefix}', '名前[namae]', 'は{wa}']);
    expect(show('ご家族')).toEqual(['ご{go-prefix}', '家族[kazoku]']);
    expect(show('おなまえ')).toEqual(['お{o-prefix}', 'なまえ[namae]']);
    expect(show('お茶')).toEqual(['お茶[ocha]']);
    expect(show('お')).toEqual(['お<unknown>']);
  });

  it('時 is a counter after a number and とき otherwise', () => {
    expect(show('九時')).toEqual(['九<number>', '時{ji}']);
    expect(show('何時')).toEqual(['何[nan]', '時{ji}']);
    expect(show('子供の時')).toEqual(['子供[kodomo]', 'の{no}', '時{toki}']);
  });

  it('a particle may follow a closing quote', () => {
    expect(show('「九時だ」と言った')).toEqual([
      '「<punct>',
      '九<number>',
      '時{ji}',
      'だ{da}',
      '」<punct>',
      'と{to}',
      '言った[iu]',
    ]);
  });
});

describe('real sentences', () => {
  it('kanji and kana sentences from content/sentences.json', () => {
    expect(show(sentence(4914, '「どなたですか」「お母さんよ」'))).toEqual([
      '「<punct>',
      'どなた[donata]',
      'です{desu}',
      'か{ka}',
      '」<punct>',
      '「<punct>',
      'お母さん[okaasan]',
      'よ{yo}',
      '」<punct>',
    ]);
    expect(show(sentence(77648, '冷蔵庫にバターはありますか。'))).toEqual([
      '冷蔵庫[reizouko]',
      'に{ni}',
      'バター[bataa]',
      'は{wa}',
      'あります[aru]',
      'か{ka}',
      '。<punct>',
    ]);
    expect(show(sentence(79848, '問題はお金がないということです。'))).toEqual([
      '問題[mondai]',
      'は{wa}',
      'お金[okane]',
      'が{ga}',
      'ない[aru]',
      'と{to}',
      'いう[iu]',
      'こと{koto}',
      'です{desu}',
      '。<punct>',
    ]);
    expect(show(sentence(152747, '私は毎朝８時に学校へ出かける。'))).toEqual([
      '私[watakushi|watashi]',
      'は{wa}',
      '毎朝[maiasa]',
      '８<number>',
      '時{ji}',
      'に{ni}',
      '学校[gakkou]',
      'へ{e}',
      '出かける[dekakeru]',
      '。<punct>',
    ]);
    expect(show(sentence(79501, '薬がなくなったら来てください。'))).toEqual([
      '薬[kusuri]',
      'が{ga}',
      'なく[naku|aru]',
      'なったら[naru]',
      '来て[kuru]',
      'ください[kudasai]',
      '。<punct>',
    ]);
    expect(show(sentence(141797, '先生、どうもありがとうございました。'))).toEqual([
      '先生[sensei]',
      '、<punct>',
      'どうも[doumo]',
      'ありがとう[arigatou]',
      'ございました{gozaimasu}',
      '。<punct>',
    ]);
  });

  it('sentences with unknown words keep them as single tokens', () => {
    expect(show(sentence(4707, 'ムーリエルは２０歳になりました。'))).toEqual([
      'ムーリエル<unknown>',
      'は{wa}',
      '２０<number>',
      '歳{sai}',
      'に{ni}',
      'なりました[naru]',
      '。<punct>',
    ]);
    expect(show(sentence(74148, 'これは兄です。かっこいいですね。'))).toEqual([
      'これ[kore]',
      'は{wa}',
      '兄[ani]',
      'です{desu}',
      '。<punct>',
      'かっこ<unknown>',
      'いい[ii]',
      'です{desu}',
      'ね{ne}',
      '。<punct>',
    ]);
    expect(show(sentence(162088, '私は１９５０年１月８日に東京で生まれました。'))).toEqual([
      '私[watakushi|watashi]',
      'は{wa}',
      '１９５０<number>',
      '年{nen}',
      '１<number>',
      '月{gatsu}',
      '８<number>',
      '日{nichi}',
      'に{ni}',
      '東京<unknown>',
      'で{de}',
      '生まれました[umareru]',
      '。<punct>',
    ]);
  });

  it('kana-only learner text', () => {
    expect(show('わたしはがくせいです')).toEqual([
      'わたし[watashi]',
      'は{wa}',
      'がくせい[gakusei]',
      'です{desu}',
    ]);
    expect(show('これはいいです')).toEqual(['これ[kore]', 'は{wa}', 'いい[ii]', 'です{desu}']);
    expect(show('これはなんですか')).toEqual([
      'これ[kore]',
      'は{wa}',
      'なん[nan]',
      'です{desu}',
      'か{ka}',
    ]);
    expect(show('あれはなにですか')).toEqual([
      'あれ[are]',
      'は{wa}',
      'なに[nan]',
      'です{desu}',
      'か{ka}',
    ]);
    expect(show('よくのみます')).toEqual(['よく[yoku|ii]', 'のみます[nomu]']);
    expect(show('きょうはいいてんきですね')).toEqual([
      'きょう[kyou]',
      'は{wa}',
      'いい[ii]',
      'てんき[tenki]',
      'です{desu}',
      'ね{ne}',
    ]);
    expect(show('わたし は がくせい です')).toEqual([
      'わたし[watashi]',
      ' <punct>',
      'は{wa}',
      ' <punct>',
      'がくせい[gakusei]',
      ' <punct>',
      'です{desu}',
    ]);
    expect(show('あさごはんにはなにがいいですか')).toEqual([
      'あさごはん[asagohan]',
      'に{ni}',
      'は{wa}',
      'なに[nan]',
      'が{ga}',
      'いい[ii]',
      'です{desu}',
      'か{ka}',
    ]);
  });
});

describe('ambiguity', () => {
  it('returns every id a surface could be', () => {
    expect(tok('きて')[0]?.wordIds).toEqual(['kiru-put-on', 'kuru']);
    expect(tok('来て')[0]?.wordIds).toEqual(['kuru']);
    expect(tok('着て')[0]?.wordIds).toEqual(['kiru-put-on']);
    expect(tok('はし')[0]?.wordIds).toEqual(['hashi-chopsticks', 'hashi-bridge']);
    expect(tok('いって')[0]?.wordIds).toEqual(expect.arrayContaining(['iku', 'iu', 'iru-need']));
    expect(tok('あつい')[0]?.wordIds).toHaveLength(3);
  });

  it('drops a kana inflection when a kana dictionary word has the same surface', () => {
    expect(tok('すみません')[0]?.wordIds).toEqual(['sumimasen']);
    expect(tok('住みません')[0]?.wordIds).toEqual(['sumu']);
  });

  it('reports the dictionary form of the first candidate', () => {
    expect(tok('来ました')[0]).toMatchObject({ base: '来る', form: 'mashita' });
    expect(tok('きて')[0]).toMatchObject({ base: 'きる', form: 'te' });
    expect(tok('学生')[0]?.base).toBeUndefined();
  });
});

describe('unknown runs', () => {
  it('become one token per run', () => {
    expect(show('マイクさんは学生です')).toEqual([
      'マイク<unknown>',
      'さん{san}',
      'は{wa}',
      '学生[gakusei]',
      'です{desu}',
    ]);
    expect(show('ジャッキー・スコットさん')).toEqual([
      'ジャッキー<unknown>',
      '・<punct>',
      'スコット<unknown>',
      'さん{san}',
    ]);
    expect(show('フランス語を勉強します')).toEqual([
      'フランス語<unknown>',
      'を{wo}',
      '勉強します[benkyou]',
    ]);
  });

  it('do not split katakana or kanji runs into stray known pieces', () => {
    expect(show('ペンキ')).toEqual(['ペンキ<unknown>']);
    expect(show('東京駅')).toEqual(['東京駅<unknown>']);
    expect(show('テレビニュース')).toEqual(['テレビ[terebi]', 'ニュース[nyuusu]']);
    expect(show('テレビゲーム')).toEqual(['テレビ[terebi]', 'ゲーム<unknown>']);
    expect(show('再来年引退')).toEqual(['再来年[sarainen]', '引退<unknown>']);
    expect(show('３日間')).toEqual(['３<number>', '日{nichi}', '間<unknown>']);
    expect(show('第三')).toEqual(['第<unknown>', '三<number>']);
  });

  it('keep okurigana and inner particles with the unknown word', () => {
    expect(show('生きています')).toEqual(['生きて<unknown>', 'います[iru-be]']);
    expect(show('しっかり勉強します')).toEqual(['しっかり<unknown>', '勉強します[benkyou]']);
    expect(show('生産する')).toEqual(['生産<unknown>', 'する[suru]']);
    // いただく is not in the vocabulary: no verb may follow plain だ directly.
    expect(unknownTokens(tok('いただきました')).length).toBeGreaterThan(0);
    expect(show('学生だと言った')).toEqual(['学生[gakusei]', 'だ{da}', 'と{to}', '言った[iu]']);
  });

  it('handles long text', () => {
    const text = '私は毎朝８時に学校へ出かける。'.repeat(400);
    const tokens = tok(text);
    expect(tokens).toHaveLength(10 * 400);
    expect(tokens.at(-1)).toMatchObject({ surface: '。', end: text.length });
    expect(show('私は学生です。')).toHaveLength(5);
  });

  it('unknownTokens and usedWordIds', () => {
    const tokens = tok('マイクはフランス語の本を読みます。');
    expect(unknownTokens(tokens).map((t) => [t.surface, t.start, t.end])).toEqual([
      ['マイク', 0, 3],
      ['フランス語', 4, 9],
    ]);
    expect(usedWordIds(tok('私は私の本を読みます'))).toEqual([
      'watakushi',
      'watashi',
      'hon',
      'yomu',
    ]);
    expect(usedWordIds(tok('きて'))).toEqual(['kiru-put-on', 'kuru']);
  });

  it('a lexicon of taught words acts as a whitelist', () => {
    const taught = createLexicon(['watakushi', 'gakusei'].map(entry));
    expect(unknownTokens(tokenize('私は学生です', taught))).toEqual([]);
    expect(unknownTokens(tokenize('私は先生です', taught)).map((t) => t.surface)).toEqual(['先生']);
  });
});

describe('numbers, punctuation and Latin', () => {
  it('numbers and counters', () => {
    expect(show('３時半')).toEqual(['３<number>', '時{ji}', '半[han]']);
    expect(show('2026年10月4日')).toEqual([
      '2026<number>',
      '年{nen}',
      '10<number>',
      '月{gatsu}',
      '4<number>',
      '日{nichi}',
    ]);
    expect(show('１０００円')).toEqual(['１０００<number>', '円{en}']);
    expect(show('1,000円')).toEqual(['1,000<number>', '円{en}']);
    expect(show('3.5キロ')).toEqual(['3.5<number>', 'キロ[kiro]']);
    expect(show('二千人')).toEqual(['二千<number>', '人{nin}']);
    expect(show('何人')).toEqual(['何[nan]', '人{nin}']);
    expect(show('あの人')).toEqual(['あの[ano]', '人[hito]']);
    expect(show('３つ')).toEqual(['３<number>', 'つ{tsu}']);
    // A quantity can modify the verb directly.
    expect(show('３日かかった')).toEqual(['３<number>', '日{nichi}', 'かかった[kakaru]']);
    expect(show('２時間かかります')).toEqual(['２<number>', '時間[jikan]', 'かかります[kakaru]']);
  });

  it('kanji numerals are numbers unless part of a longer word', () => {
    expect(show('一')).toEqual(['一<number>']);
    expect(show('一つ')).toEqual(['一つ[hitotsu]']);
    expect(show('二十日')).toEqual(['二十日[hatsuka]']);
    expect(show('八百屋')).toEqual(['八百屋[yaoya]']);
    expect(show('一緒に')).toEqual(['一緒[issho]', 'に{ni}']);
    expect(show('これ一つ')).toEqual(['これ[kore]', '一つ[hitotsu]']);
  });

  it('punctuation', () => {
    expect(show('「はい」、そうです！？')).toEqual([
      '「<punct>',
      'はい[hai]',
      '」<punct>',
      '、<punct>',
      'そう{sou}',
      'です{desu}',
      '！<punct>',
      '？<punct>',
    ]);
    expect(show('はい……いいえ')).toEqual(['はい[hai]', '……<punct>', 'いいえ[iie]']);
    expect(show('はい  いいえ')).toEqual(['はい[hai]', '  <punct>', 'いいえ[iie]']);
    expect(show('はい　いいえ。')).toEqual(['はい[hai]', '　<punct>', 'いいえ[iie]', '。<punct>']);
    expect(show('『本』')).toEqual(['『<punct>', '本[hon]', '』<punct>']);
  });

  it('ー is punctuation only when it does not follow kana', () => {
    expect(show('コーヒー')).toEqual(['コーヒー[koohii]']);
    expect(show('ー')).toEqual(['ー<punct>']);
    expect(show('本ー本')).toEqual(['本[hon]', 'ー<punct>', '本[hon]']);
  });

  it('Latin letters', () => {
    expect(show('ＣＤを３枚買いました')).toEqual([
      'ＣＤ<latin>',
      'を{wo}',
      '３<number>',
      '枚{mai}',
      '買いました[kau]',
    ]);
    expect(show('OK です')).toEqual(['OK<latin>', ' <punct>', 'です{desu}']);
  });

  it('empty and blank input', () => {
    expect(tok('')).toEqual([]);
    expect(show('  ')).toEqual(['  <punct>']);
  });

  it('characters outside the BMP stay whole', () => {
    const tokens = tok('本😀');
    expect(tokens.map((t) => [t.surface, t.kind])).toEqual([
      ['本', 'word'],
      ['😀', 'punct'],
    ]);
  });
});

describe('tables', () => {
  it('GRAMMAR_WORDS has unique kebab-case keys and surfaces', () => {
    const keys = GRAMMAR_WORDS.map((g) => g.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const g of GRAMMAR_WORDS) {
      expect(g.key).toMatch(/^[a-z][a-z-]*$/);
      expect(g.surfaces.length).toBeGreaterThan(0);
      for (const s of g.surfaces) expect(s.length).toBeGreaterThan(0);
    }
    for (const key of ['wa', 'ga', 'wo', 'ni', 'desu', 'deshita', 'da', 'o-prefix', 'ji']) {
      expect(keys).toContain(key);
    }
  });

  it('SPELLING_VARIANTS keys are the main written form of a vocabulary entry', () => {
    const main = new Set(vocab.map((w) => w.kanji ?? w.kana));
    for (const key of Object.keys(SPELLING_VARIANTS)) expect(main, key).toContain(key);
  });
});

describe('regressions from the adversarial review', () => {
  it('はい is "yes" only at the start of a clause, so は + いくつ is not はい + くつ', () => {
    expect(show(sentence(228303, 'ウエストのサイズはいくつですか。'))).toEqual([
      'ウエスト<unknown>',
      'の{no}',
      'サイズ<unknown>',
      'は{wa}',
      'いくつ[ikutsu]',
      'です{desu}',
      'か{ka}',
      '。<punct>',
    ]);
    expect(show(sentence(210824, 'その語にはいくつかの意味がある。')).slice(1, 6)).toEqual([
      '語<unknown>',
      'に{ni}',
      'は{wa}',
      'いくつ[ikutsu]',
      'か{ka}',
    ]);
    expect(show('すっかり食べ終わってはいない')).toEqual([
      'すっかり食べ<unknown>',
      '終わって[owaru]',
      'は{wa}',
      'いない[iru-be]',
    ]);
    // Not ご + はい either.
    expect(show('りんごはいくつありますか')).toEqual([
      'りんご<unknown>',
      'は{wa}',
      'いくつ[ikutsu]',
      'あります[aru]',
      'か{ka}',
    ]);
    expect(show('はい、そうです')[0]).toBe('はい[hai]');
    expect(show('「はい」')).toEqual(['「<punct>', 'はい[hai]', '」<punct>']);
  });

  it('polite endings after an unknown verb stem are grammar, not ま + した (下, する) or ま + せん (千)', () => {
    expect(show(sentence(83078, '母はケーキを８つに分けました。')).slice(-3)).toEqual([
      '分け<unknown>',
      'ました{mashita}',
      '。<punct>',
    ]);
    expect(show('学校に行けませんでした')).toEqual([
      '学校[gakkou]',
      'に{ni}',
      '行け<unknown>',
      'ませんでした{masen-deshita}',
    ]);
    expect(show('窓を開けてくれませんか')).toEqual([
      '窓[mado]',
      'を{wo}',
      '開けて[akeru]',
      'くれ<unknown>',
      'ません{masen}',
      'か{ka}',
    ]);
    expect(show('急ぎましょう')).toEqual(['急ぎ<unknown>', 'ましょう{mashou}']);
    expect(show('居ます')).toEqual(['居<unknown>', 'ます{masu}']);
    // Only after something that can end a masu stem, and never after a known word.
    expect(show(sentence(123386, '読書の時間がますます少なくなっている。'))).toContain(
      'ますます<unknown>',
    );
    expect(show('ませんか')).not.toContain('ません{masen}');
    expect(show('本ます')).not.toContain('ます{masu}');
    for (const text of ['分けました', '待てません', '眠れました', '食べられません']) {
      expect(usedWordIds(tok(text)), text).toEqual([]);
    }
  });

  it('ください takes polite endings (くださいませんか)', () => {
    expect(show(sentence(201824, 'ドアをあけてくださいませんか。')).slice(2)).toEqual([
      'あけて[akeru]',
      'くださいません[kudasai]',
      'か{ka}',
      '。<punct>',
    ]);
    expect(tok('下さいました')[0]).toMatchObject({
      wordIds: ['kudasai'],
      base: '下さい',
      form: 'mashita',
    });
    expect(show('くださいます')).toEqual(['くださいます[kudasai]']);
  });

  it('てはいけません is grammar, not 池 + ない or 池 + ま + 千', () => {
    expect(show(sentence(145934, '食べながら読んではいけません。'))).toEqual([
      '食べながら[taberu]',
      '読んで[yomu]',
      'は{wa}',
      'いけません{ikenai}',
      '。<punct>',
    ]);
    expect(show('書いてはいけない')).toEqual(['書いて[kaku]', 'は{wa}', 'いけない{ikenai}']);
    expect(show('いけにさかながいます')[0]).toBe('いけ[ike]');
  });

  it('しまう after a te-form is grammar, not 閉まる', () => {
    expect(show(sentence(84793, '父は、アメリカへ行ってしまった。')).slice(-3)).toEqual([
      '行って[iku]',
      'しまった{shimau}',
      '。<punct>',
    ]);
    expect(show('忘れてしまいました')).toEqual(['忘れて[wasureru]', 'しまいました{shimau}']);
    expect(show('飲んでしまう')).toEqual(['飲んで[nomu]', 'しまう{shimau}']);
    // Without a te-form it is still 閉まる, and no grammar alternative is claimed.
    expect(tok('ドアがしまった')[2]).toEqual({
      surface: 'しまった',
      start: 3,
      end: 7,
      kind: 'word',
      wordIds: ['shimaru'],
      base: 'しまる',
      form: 'ta',
    });
  });

  it('counters follow なん but never なに', () => {
    expect(show('なんじ')).toEqual(['なん[nan]', 'じ{ji}']);
    expect(show('なんにん')).toEqual(['なん[nan]', 'にん{nin}']);
    expect(show('なにだい')).not.toContain('だい{dai}');
  });

  it('particles keep their rules after an unknown hiragana word', () => {
    // に + を is impossible, so かに is one unknown word.
    expect(show('かにをたべる')).toEqual(['かに<unknown>', 'を{wo}', 'たべる[taberu]']);
    // な + ん + です after an unknown word, not 何 + です.
    expect(show(sentence(191765, '来週ヨーロッパへ行くつもりなんです。')).slice(-5)).toEqual([
      'つもり<unknown>',
      'な{na}',
      'ん{n}',
      'です{desu}',
      '。<punct>',
    ]);
    // The copula inside an unknown word stays inside it.
    expect(show(sentence(121489, '買うかどうかはあなたしだいです。')).slice(-3)).toEqual([
      'しだい<unknown>',
      'です{desu}',
      '。<punct>',
    ]);
    expect(show('来てくださってありがとう')).toEqual([
      '来て[kuru]',
      'くださって<unknown>',
      'ありがとう[arigatou]',
    ]);
    // An unknown verb stem is followed by verbs (かかる), not by か + 買う.
    expect(show('ほとんど終わりかかっています')).toEqual([
      'ほとんど終わり<unknown>',
      'かかって[kakaru]',
      'います[iru-be]',
    ]);
  });

  it('no verb right after the linker な: 出られなかった is not 出られ + な + 買った', () => {
    expect(show(sentence(142003, '雪のため、外に出られなかった。')).slice(-3)).toEqual([
      '出られ<unknown>',
      'なかった[aru]',
      '。<punct>',
    ]);
    // An adjective is fine (みな is not in the vocabulary).
    expect(show('みな青い')).toEqual(['み<unknown>', 'な{na}', '青い[aoi]']);
  });

  it('できる and する attach to nouns without being split into で + きる', () => {
    expect(show('勉強できます')).toEqual(['勉強[benkyou]', 'できます[dekiru]']);
    expect(show('料理できません')).toEqual(['料理[ryouri]', 'できません[dekiru]']);
    expect(show('読書できない')).toEqual(['読書<unknown>', 'できない[dekiru]']);
    expect(show(sentence(201738, 'トイレお借りできますか。'))).toEqual([
      'トイレ[toire]',
      'お{o-prefix}',
      '借り[kariru]',
      'できます[dekiru]',
      'か{ka}',
      '。<punct>',
    ]);
  });

  it('お + masu stem and stem + 方', () => {
    expect(show('お待ちください')).toEqual(['お{o-prefix}', '待ち[matsu]', 'ください[kudasai]']);
    expect(show('お使い下さい')).toEqual(['お{o-prefix}', '使い[tsukau]', '下さい[kudasai]']);
    expect(show('漢字の読み方')).toEqual(['漢字[kanji]', 'の{no}', '読み[yomu]', '方[kata]']);
    expect(show('使いかた')).toEqual(['使い[tsukau]', 'かた[kata]']);
    // A bare stem elsewhere is still not a word.
    expect(show('待ちです')).not.toContain('待ち[matsu]');
  });

  it('two one-kanji nouns inside a kanji run are an unknown compound', () => {
    expect(
      show(sentence(235285, '３人の中国人留学生がその大学に入学が許された。')).slice(3, 5),
    ).toEqual(['中国人<unknown>', '留学生[ryuugakusei]']);
    expect(show('外人')).toEqual(['外人<unknown>']);
    expect(show('水中')).toEqual(['水中<unknown>']);
    expect(usedWordIds(tok('中国人です'))).toEqual([]);
    // 今 is an adverb and 何 a number word: 今何時 still splits.
    expect(show('今何時ですか')).toEqual(['今[ima]', '何[nan]', '時{ji}', 'です{desu}', 'か{ka}']);
    expect(show('本 本')).toEqual(['本[hon]', ' <punct>', '本[hon]']);
  });

  it('fragments: ～ and a clause of grammar only', () => {
    expect(show('～ね')).toEqual(['～<punct>', 'ね{ne}']);
    expect(show('〜よ')).toEqual(['〜<punct>', 'よ{yo}']);
    expect(show('～は～です')).toEqual(['～<punct>', 'は{wa}', '～<punct>', 'です{desu}']);
    expect(show('ね')).toEqual(['ね{ne}']);
    expect(show('ですね。')).toEqual(['です{desu}', 'ね{ne}', '。<punct>']);
    // A word still wins when there is one.
    expect(show('はな')).toEqual(['はな[hana-flower|hana-nose]']);
    expect(show('くらいへや')).toEqual(['くらい[kurai]', 'へや[heya]']);
  });

  it('iteration marks', () => {
    expect(show('色々')).toEqual(['色々[iroiro]']);
    expect(show('時々')).toEqual(['時々[tokidoki]']);
    expect(show('人々')).toEqual(['人々<unknown>']);
    // ゞ repeats す: not いす + ゞ.
    expect(show('いすゞ')).toEqual(['いすゞ<unknown>']);
  });

  it('the source uses no regex lookbehind (Safari 15)', () => {
    const source = readFileSync(new URL('./jp-words.ts', import.meta.url), 'utf8');
    expect(source).not.toMatch(/\(\?<[=!]/);
  });

  it('long runs stay linear', () => {
    // Each of these took seconds (quadratic) before; now they take ~100 ms.
    const cases: [string, number][] = [
      ['テレビ'.repeat(4000), 4000],
      ['学生'.repeat(6000), 6000],
      ['一'.repeat(20000), 1],
      ['あ'.repeat(5000), 1],
      ['を'.repeat(5000), 5000],
      ['の'.repeat(5000), 5000],
    ];
    for (const [text, count] of cases) {
      const t0 = performance.now();
      const tokens = tok(text);
      const ms = performance.now() - t0;
      expect(tokens, text.slice(0, 3)).toHaveLength(count);
      expect(tokens.at(-1)?.end).toBe(text.length);
      expect(ms, text.slice(0, 3)).toBeLessThan(2000);
    }
  });
});

describe('whole corpus', () => {
  it('tokens cover every sentence exactly once and in order', () => {
    const texts = sentences.flatMap((s) => (s.kana === undefined ? [s.ja] : [s.ja, s.kana]));
    const keys = new Set(GRAMMAR_WORDS.map((g) => g.key));
    for (const text of texts) {
      const tokens = tok(text);
      let at = 0;
      let prev: Token | undefined;
      for (const t of tokens) {
        expect(t.start, text).toBe(at);
        expect(t.surface, text).toBe(text.slice(t.start, t.end));
        expect(t.end, text).toBeGreaterThan(t.start);
        expect(t.wordIds.length > 0, text).toBe(t.kind === 'word');
        if (t.kind === 'grammar') expect(keys.has(t.grammar ?? ''), text).toBe(true);
        expect(prev?.kind === 'unknown' && t.kind === 'unknown', text).toBe(false);
        prev = t;
        at = t.end;
      }
      expect(at, text).toBe(text.length);
    }
  });

  it('builds the lexicon and tokenizes all sentences quickly', () => {
    const t0 = performance.now();
    const lex = createLexicon(entries);
    const built = performance.now() - t0;
    const t1 = performance.now();
    let count = 0;
    for (const s of sentences) count += tokenize(s.ja, lex).length;
    const tokenized = performance.now() - t1;
    expect(count).toBeGreaterThan(sentences.length);
    // Typically ~20 ms and ~50 ms; the limits leave room for slow CI machines.
    expect(built).toBeLessThan(250);
    expect(tokenized).toBeLessThan(2500);
  });
});
