import { useState } from 'preact/hooks';
import { Avatar } from '../mascot/Mascot.tsx';
import type { ProfileRecord } from '../shared/api.ts';
import { AlphabetScreen, GrammarScreen, VocabScreen } from '../screens/Placeholders.tsx';
import { LicensesScreen } from '../screens/LicensesScreen.tsx';
import { ProfileEditor } from '../screens/ProfileEditor.tsx';
import { TodayScreen } from '../screens/TodayScreen.tsx';
import { BackIcon, BrushIcon, CardsIcon, ToriiIcon } from '../ui/icons.tsx';
import { SettingsSheet } from './SettingsSheet.tsx';
import { TABS, goBack, navigate, usePath } from './router.ts';

const TAB_ICONS: Record<string, () => preact.JSX.Element> = {
  '/': () => <ToriiIcon />,
  '/alfabet': () => (
    <span class="tabbar__glyph" lang="ja">
      あ
    </span>
  ),
  '/slowka': () => <CardsIcon />,
  '/gramatyka': () => <BrushIcon />,
};

interface Route {
  title: string;
  tab: boolean;
  render: () => preact.JSX.Element;
}

export function Shell({ profile }: { profile: ProfileRecord }) {
  const path = usePath();
  const [settingsOpen, setSettingsOpen] = useState(false);

  const home: Route = { title: 'Dziś', tab: true, render: () => <TodayScreen profile={profile} /> };
  const routes: Record<string, Route> = {
    '/': home,
    '/alfabet': { title: 'Alfabet', tab: true, render: () => <AlphabetScreen /> },
    '/slowka': { title: 'Słówka', tab: true, render: () => <VocabScreen /> },
    '/gramatyka': { title: 'Gramatyka', tab: true, render: () => <GrammarScreen /> },
    '/zrodla': { title: 'Źródła i licencje', tab: false, render: () => <LicensesScreen /> },
  };

  if (path === '/profil') {
    return <ProfileEditor profile={profile} onDone={() => goBack()} onCancel={() => goBack()} />;
  }

  const route = routes[path] ?? home;

  return (
    <div class="shell">
      <header class="topbar">
        <div class="row" style={{ gap: 'var(--space-1)', minWidth: 0 }}>
          {!route.tab && (
            <button class="icon-button topbar__back" onClick={() => goBack()} aria-label="Wróć">
              <BackIcon />
            </button>
          )}
          <h1 class="topbar__title">{route.title}</h1>
        </div>
        <button
          class="avatar-button"
          onClick={() => setSettingsOpen(true)}
          aria-label={`Profil ${profile.name} i ustawienia`}
          aria-haspopup="dialog"
        >
          <Avatar id={profile.avatar} size={42} decorative />
        </button>
      </header>

      <main class="page" id="main">
        {route.render()}
      </main>

      <nav class="tabbar" aria-label="Główne sekcje">
        {TABS.map((t) => (
          <button
            key={t.path}
            class="tabbar__item"
            aria-current={path === t.path ? 'page' : undefined}
            onClick={() => navigate(t.path)}
          >
            <span class="tabbar__icon">{TAB_ICONS[t.path]?.()}</span>
            {t.label}
          </button>
        ))}
      </nav>

      <SettingsSheet open={settingsOpen} onClose={() => setSettingsOpen(false)} profile={profile} />
    </div>
  );
}
