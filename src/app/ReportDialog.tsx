import { useEffect, useState } from 'preact/hooks';
import { reportProblem } from '../state/app.ts';
import { Modal } from '../ui/Modal.tsx';
import { showToast } from '../ui/toast.tsx';

interface ReportDialogProps {
  open: boolean;
  onClose: () => void;
  /** Prefilled offending text (a sentence, a gloss). */
  sentence?: string;
  context: string;
  lessonN?: number | null;
}

/** "Zgłoś błąd": queued in the outbox, so it works offline too. */
export function ReportDialog({
  open,
  onClose,
  sentence = '',
  context,
  lessonN = null,
}: ReportDialogProps) {
  const [text, setText] = useState(sentence);
  const [note, setNote] = useState('');

  useEffect(() => {
    if (open) {
      setText(sentence);
      setNote('');
    }
  }, [open, sentence]);

  const submit = async (e: Event) => {
    e.preventDefault();
    if (!note.trim() && !text.trim()) return;
    await reportProblem({ sentence: text.trim(), note: note.trim(), context, lessonN });
    showToast('Dzięki! Zgłoszenie zapisane.');
    onClose();
  };

  return (
    <Modal open={open} onClose={onClose} title="Zgłoś błąd">
      <form class="stack" onSubmit={submit}>
        <div class="field">
          <label class="field__label" for="report-sentence">
            Czego dotyczy (opcjonalnie)
          </label>
          <input
            id="report-sentence"
            class="input jp"
            value={text}
            maxLength={1000}
            onInput={(e) => setText(e.currentTarget.value)}
          />
        </div>
        <div class="field">
          <label class="field__label" for="report-note">
            Co jest nie tak?
          </label>
          <textarea
            id="report-note"
            class="input"
            maxLength={2000}
            value={note}
            onInput={(e) => setNote(e.currentTarget.value)}
          />
        </div>
        <button
          class="btn btn--primary btn--block"
          type="submit"
          disabled={!note.trim() && !text.trim()}
        >
          Wyślij
        </button>
        <p class="setting__hint">Bez internetu zgłoszenie poczeka i wyśle się samo.</p>
      </form>
    </Modal>
  );
}
