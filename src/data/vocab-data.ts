/**
 * Lazy vocabulary data: words, Polish glosses and lesson examples are loaded as separate
 * chunks the first time a screen needs them (the service worker precaches them for offline
 * use). Example sentences are optional content until the course has them.
 */
import { curriculum } from '../lesson/context.ts';
import { buildVocabIndex, type RawExamples, type VocabIndex } from '../lesson/vocab.ts';

const optionalExamples = import.meta.glob<RawExamples>('../../content/examples.json', {
  import: 'default',
});

let pending: Promise<VocabIndex> | null = null;

export function loadVocab(): Promise<VocabIndex> {
  if (!pending) {
    const examples = Object.values(optionalExamples)[0];
    pending = Promise.all([
      import('../../content/vocab.json').then((m) => m.default),
      import('../../content/glosses.pl.json').then((m) => m.default),
      examples ? examples() : Promise.resolve(undefined),
    ]).then(([vocab, glosses, ex]) => buildVocabIndex(vocab, glosses, curriculum, ex));
    // A failed chunk load (offline before the first visit) may succeed on the next try.
    pending.catch(() => {
      pending = null;
    });
  }
  return pending;
}
