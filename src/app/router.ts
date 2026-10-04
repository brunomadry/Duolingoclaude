/** Minimal History API router: a path, a navigate function and a hook. */
import { useEffect, useState } from 'preact/hooks';

const listeners = new Set<() => void>();

function notify(): void {
  for (const fn of listeners) fn();
}

if (typeof window !== 'undefined') window.addEventListener('popstate', notify);

export function currentPath(): string {
  return location.pathname;
}

export function navigate(path: string, { replace = false } = {}): void {
  if (path === currentPath()) return;
  if (replace) history.replaceState(null, '', path);
  else history.pushState(null, '', path);
  window.scrollTo(0, 0);
  notify();
}

export function goBack(fallback = '/'): void {
  if (history.length > 1) history.back();
  else navigate(fallback, { replace: true });
}

export function usePath(): string {
  const [path, setPath] = useState(currentPath());
  useEffect(() => {
    const fn = () => setPath(currentPath());
    listeners.add(fn);
    return () => {
      listeners.delete(fn);
    };
  }, []);
  return path;
}

export interface Tab {
  path: string;
  label: string;
  title: string;
}

export const TABS: readonly Tab[] = [
  { path: '/', label: 'Dziś', title: 'Dziś' },
  { path: '/alfabet', label: 'Alfabet', title: 'Alfabet' },
  { path: '/slowka', label: 'Słówka', title: 'Słówka' },
  { path: '/gramatyka', label: 'Gramatyka', title: 'Gramatyka' },
];
