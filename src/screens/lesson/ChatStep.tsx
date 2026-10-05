import { useEffect, useRef, useState } from 'preact/hooks';
import { ReportDialog } from '../../app/ReportDialog.tsx';
import type { GrammarNoteItem } from '../../lesson/grammar.ts';
import { hasPendingRomaji, romajiToKana } from '../../lesson/kana-input.ts';
import type { RomajiDisplay } from '../../lesson/romaji.ts';
import { ApiError } from '../../lib/api.ts';
import { speak } from '../../lib/speech.ts';
import type { AiChatResponse, AiSentence, ChatFeedback, ChatTurn } from '../../shared/ai.ts';
import { MAX_CHAT_LINE } from '../../shared/defaults.ts';
import { aiChat } from '../../state/app.ts';
import { GrammarNoteView } from '../../ui/GrammarNoteView.tsx';
import { SentenceLine } from '../../ui/Written.tsx';
import { Modal } from '../../ui/Modal.tsx';

interface ChatStepProps {
  lessonN: number;
  display: RomajiDisplay;
  sound: boolean;
  notes: ReadonlyMap<string, GrammarNoteItem>;
  onDone: () => void;
}

type Bubble =
  | { role: 'ai'; sentence: AiSentence; unknown?: string[] }
  | { role: 'learner'; ja: string; feedback?: ChatFeedback };

function problemText(e: unknown): string {
  if (e instanceof ApiError) {
    if (e.code === 'offline') return 'Rozmowa działa tylko z internetem. Tym razem ją pomijamy.';
    if (e.code === 'rate_limited')
      return 'Limit rozmów z AI na teraz się wyczerpał. Spróbuj później, a tym razem pomińmy ten krok.';
    if (e.code === 'locked') return 'Sesja wygasła. Zaloguj się kodem ponownie, żeby rozmawiać.';
  }
  return 'Rozmowa z AI jest teraz niedostępna. Ten krok można spokojnie pominąć.';
}

/** "Rozmowa": a short conversation with the AI partner on what the learner knows. */
export function ChatStep({ lessonN, display, sound, notes, onDone }: ChatStepProps) {
  const [bubbles, setBubbles] = useState<Bubble[]>([]);
  const [history, setHistory] = useState<ChatTurn[]>([]);
  const [suggestion, setSuggestion] = useState<AiSentence | null>(null);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(true);
  const [done, setDone] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [shownPl, setShownPl] = useState<Set<number>>(new Set());
  const [note, setNote] = useState<GrammarNoteItem | null>(null);
  const [reporting, setReporting] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  const apply = (res: AiChatResponse, sent: ChatTurn[]) => {
    setBubbles((b) => {
      const next = [...b];
      const last = next.at(-1);
      if (res.feedback && last?.role === 'learner')
        next[next.length - 1] = { ...last, feedback: res.feedback };
      next.push({
        role: 'ai',
        sentence: res.reply,
        ...(res.reply.unknown ? { unknown: res.reply.unknown } : {}),
      });
      return next;
    });
    setHistory([...sent, { role: 'ai', ja: res.reply.ja }]);
    setSuggestion(res.suggestion ?? null);
    setDone(res.done);
  };

  const ask = async (sent: ChatTurn[]) => {
    setBusy(true);
    try {
      apply(await aiChat(lessonN, sent), sent);
    } catch (e) {
      setProblem(problemText(e));
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    void ask([]);
    // One conversation per mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const calm = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    endRef.current?.scrollIntoView({ block: 'end', behavior: calm ? 'auto' : 'smooth' });
  }, [bubbles.length, problem]);

  const kana = romajiToKana(input);
  const send = (e: Event) => {
    e.preventDefault();
    const text = romajiToKana(input, { final: true }).trim();
    if (!text || busy || done) return;
    const sent: ChatTurn[] = [...history, { role: 'learner', ja: text }];
    setBubbles((b) => [...b, { role: 'learner', ja: text }]);
    setInput('');
    setSuggestion(null);
    void ask(sent);
  };

  return (
    <div class="chat">
      <p class="exercise__prompt">Porozmawiaj z Yuki. Pisz w romaji, zamienimy to na kanę.</p>
      <div class="chat__log" aria-live="polite">
        {bubbles.map((b, i) =>
          b.role === 'ai' ? (
            <div key={i} class="chat__bubble chat__bubble--ai">
              <SentenceLine ja={b.sentence.ja} kana={b.sentence.kana} display={display} />
              {shownPl.has(i) ? (
                <p class="chat__pl">{b.sentence.pl}</p>
              ) : (
                <button class="jptext__reveal" onClick={() => setShownPl(new Set([...shownPl, i]))}>
                  Pokaż tłumaczenie
                </button>
              )}
              {b.unknown?.length ? (
                <p class="chat__warn">
                  Tu pojawiły się słowa spoza kursu:{' '}
                  <span class="jp" lang="ja">
                    {b.unknown.join('、')}
                  </span>
                </p>
              ) : null}
              <button class="chat__report" onClick={() => setReporting(b.sentence.ja)}>
                Zgłoś błąd
              </button>
            </div>
          ) : (
            <div key={i} class="chat__bubble chat__bubble--me">
              <p class="jp" lang="ja">
                {b.ja}
              </p>
              {b.feedback &&
                (b.feedback.ok ? (
                  <p class="chat__ok">Dobrze!</p>
                ) : (
                  <div class="chat__fix">
                    {b.feedback.corrected && (
                      <p>
                        Lepiej:{' '}
                        <span class="jp" lang="ja">
                          {b.feedback.corrected.kana}
                        </span>
                      </p>
                    )}
                    {b.feedback.grammarIds.map((id) => {
                      const n = notes.get(id);
                      return n ? (
                        <button key={id} class="jptext__reveal" onClick={() => setNote(n)}>
                          Notka: {n.title}
                        </button>
                      ) : null;
                    })}
                    <p class="chat__hint">Podpowiedź AI, może się mylić.</p>
                  </div>
                ))}
            </div>
          ),
        )}
        {busy && <p class="chat__typing">Yuki pisze…</p>}
        {problem && <p class="setting__hint">{problem}</p>}
        <div ref={endRef} />
      </div>

      {!done && !problem && (
        <form class="chat__form" onSubmit={send}>
          <label class="visually-hidden" for="chat-input">
            Twoja odpowiedź w romaji
          </label>
          <input
            id="chat-input"
            class="input"
            value={input}
            onInput={(e) => setInput(e.currentTarget.value)}
            placeholder="np. hai, sou desu"
            maxLength={MAX_CHAT_LINE}
            autoComplete="off"
            autoCapitalize="none"
            autoCorrect="off"
            spellcheck={false}
            enterKeyHint="send"
            disabled={busy}
          />
          {input && (
            <p class="exercise__preview jp" lang="ja" aria-hidden="true">
              {hasPendingRomaji(kana) ? romajiToKana(input, { final: true }) : kana}
            </p>
          )}
          <div class="chat__actions">
            <button
              type="button"
              class="btn"
              disabled={!suggestion || busy}
              onClick={() => {
                if (!suggestion) return;
                setInput(suggestion.kana);
                if (sound) speak(suggestion.kana);
              }}
            >
              Podpowiedź
            </button>
            <button class="btn btn--primary" type="submit" disabled={busy || !input.trim()}>
              Wyślij
            </button>
          </div>
        </form>
      )}

      <button
        class={`btn btn--block${done || problem ? ' btn--primary' : ' btn--ghost'}`}
        onClick={onDone}
      >
        {done || problem ? 'Dalej' : 'Pomiń rozmowę'}
      </button>

      <Modal open={note !== null} onClose={() => setNote(null)} title={note?.title ?? 'Notka'}>
        {note && <GrammarNoteView note={note} display={display} />}
      </Modal>
      <ReportDialog
        open={reporting !== null}
        onClose={() => setReporting(null)}
        sentence={reporting ?? ''}
        context="ai:chat"
        lessonN={lessonN}
      />
    </div>
  );
}
