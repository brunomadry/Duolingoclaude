/** Transient messages ("Zapisano", "Brak sieci"). */
import { createStore, useStore } from '../state/store.ts';

interface Toast {
  id: number;
  text: string;
}

const toasts = createStore<{ items: Toast[] }>({ items: [] });
let nextId = 1;

export function showToast(text: string, ms = 3200): void {
  const id = nextId++;
  toasts.set((s) => ({ items: [...s.items, { id, text }] }));
  setTimeout(() => toasts.set((s) => ({ items: s.items.filter((t) => t.id !== id) })), ms);
}

export function useToasts(): Toast[] {
  return useStore(toasts).items;
}
