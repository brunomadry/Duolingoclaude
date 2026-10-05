/** Lazy kanji data (readings from KANJIDIC via OpenJLPT, Polish meanings, lesson of each kanji). */
import { curriculum } from '../lesson/context.ts';
import { buildKanjiIndex, type KanjiIndex } from '../lesson/kanji.ts';

let pending: Promise<KanjiIndex> | null = null;

export function loadKanji(): Promise<KanjiIndex> {
  if (!pending) {
    pending = Promise.all([
      import('../../content/kanji.json').then((m) => m.default),
      import('../../content/kanji.pl.json').then((m) => m.default),
    ]).then(([raw, glosses]) => buildKanjiIndex(raw, glosses, curriculum));
    pending.catch(() => {
      pending = null;
    });
  }
  return pending;
}
