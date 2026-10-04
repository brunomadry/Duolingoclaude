import { EmptyState } from '../ui/EmptyState.tsx';

export function VocabScreen() {
  return (
    <EmptyState
      title="Jeszcze pusto"
      text="Słówka będą się tu zbierać lekcja po lekcji, razem z powtórkami."
      pose="sleepy"
    />
  );
}

export function GrammarScreen() {
  return (
    <EmptyState
      title="Gramatyka czeka"
      text="Notki gramatyczne odblokują się, gdy dojdziesz do pierwszych zdań."
      pose="idle"
    />
  );
}
